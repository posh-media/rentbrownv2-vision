-- 0025 — Phase 9B part 4: withdrawal source allocation + reward-funded invests.
--
-- The reward-exempt pool = Σ grant.bonus_minor + Σ grant.released_minor (per
-- user+currency) — value the ledger holds in BONUS and in AVAILABLE that is
-- still reward-provenance. Withdrawals are source-allocated:
--
--   reward_part   = min(amount, exempt_pool)   — no deposit-history/KYC gate
--   ordinary_part = amount - reward_part       — existing gates apply
--
-- Ledger legs: reward value in BONUS debits :bonus; reward value already
-- released to AVAILABLE and ordinary funds debit :available. Per-grant moves
-- land in reward_allocations (movement HOLD / HOLD_RETURN / CONSUME) and the
-- withdrawals row persists the coarse split for the HOLD_RELEASE mirror.
--
-- Investments draw ordinary AVAILABLE first, then released, then BONUS —
-- preserving the exempt-withdrawal pool as long as possible (documented
-- Phase-9 decision; maturity proceeds land in ordinary AVAILABLE).
--
-- The no-deposit-history rule is enforced for the ordinary portion only, via
-- withdrawal.requires_deposit_history (default true).

-- ── withdrawals: persisted source split ──────────────────────────────────────

alter table public.withdrawals
  add column if not exists reward_amount_minor   bigint not null default 0,
  add column if not exists ordinary_amount_minor bigint not null default 0,
  add column if not exists hold_bonus_minor      bigint not null default 0;

comment on column public.withdrawals.reward_amount_minor is
  'Reward-provenance portion of this withdrawal (BONUS + released-reward
   sources). Exempt from deposit-history and KYC gates.';
comment on column public.withdrawals.ordinary_amount_minor is
  'Ordinary AVAILABLE portion — deposit-history + KYC gates applied to it.';
comment on column public.withdrawals.hold_bonus_minor is
  'BONUS-bucket leg of the HOLD journal — needed to mirror HOLD_RELEASE back
   to the correct buckets on reject/fail.';

-- "first ordinary withdrawal" means no prior withdrawal that drew ordinary
-- funds — a reward-only withdrawal must not consume the KYC exception.

-- ── helpers ──────────────────────────────────────────────────────────────────

-- Per-user reward pool snapshot. Lock discipline: reward pool reads happen
-- under the caller's advisory lock (withdrawal/reward/investment paths all
-- take pg_advisory_xact_lock('reward:'||uid) before drawing).

create or replace function public.reward_pool(p_user_id uuid, p_currency public.currency_code)
returns table(bonus_minor bigint, released_minor bigint)
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(bonus_minor),0)::bigint,
         coalesce(sum(released_minor),0)::bigint
    from public.reward_grants
   where user_id = p_user_id and currency = p_currency
     and status in ('CREDITED','PARTIALLY_REVERSED')
$$;

-- draw_reward_holds — reserve reward value for a pending spend.
-- Draws RELEASED first (value already liquid), then BONUS. Each grant's
-- counters move src→reserved and a HOLD allocation is recorded.
-- Returns the total drawn from BONUS (the hold journal's bonus leg).

create or replace function public.draw_reward_holds(
  p_user_id       uuid,
  p_currency      public.currency_code,
  p_amount        bigint,
  p_withdrawal_id uuid default null,
  p_investment_id uuid default null,
  p_request_id    text default null
)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  g       record;
  v_need  bigint := p_amount;
  v_take  bigint;
  v_bonus bigint := 0;
begin
  perform set_config('app.reward_write', '1', true);
  for g in
    select * from public.reward_grants
     where user_id = p_user_id and currency = p_currency
       and status in ('CREDITED','PARTIALLY_REVERSED')
       and (released_minor + bonus_minor) > 0
     order by created_at, id
     for update
  loop
    exit when v_need <= 0;
    v_take := least(g.released_minor, v_need);
    if v_take > 0 then
      update public.reward_grants
         set released_minor = released_minor - v_take,
             reserved_minor = reserved_minor + v_take
       where id = g.id;
      insert into public.reward_allocations
        (grant_id, movement, bucket, amount_minor, withdrawal_id, investment_id, request_id)
      values (g.id, 'HOLD', 'RELEASED', v_take, p_withdrawal_id, p_investment_id, p_request_id);
      v_need := v_need - v_take;
    end if;
    if v_need > 0 then
      v_take := least(g.bonus_minor, v_need);
      if v_take > 0 then
        update public.reward_grants
           set bonus_minor = bonus_minor - v_take,
               reserved_minor = reserved_minor + v_take
         where id = g.id;
        insert into public.reward_allocations
          (grant_id, movement, bucket, amount_minor, withdrawal_id, investment_id, request_id)
        values (g.id, 'HOLD', 'BONUS', v_take, p_withdrawal_id, p_investment_id, p_request_id);
        v_need  := v_need - v_take;
        v_bonus := v_bonus + v_take;
      end if;
    end if;
  end loop;
  if v_need > 0 then
    raise exception 'reward draw shortfall by % minor units', v_need;
  end if;
  return v_bonus;
end;
$$;

-- release_reward_holds — hold resolution on reject/fail: restore each grant's
-- counters to the source bucket. If the grant was reversed while in-flight,
-- the returned value settles the linked receivable instead of resurrecting
-- withdrawable reward value (REWARD_RECOVERY drains it right back out).

create or replace function public.release_reward_holds(
  p_withdrawal_id uuid,
  p_journal_id    uuid,
  p_request_id    text default null
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  a       record;
  v_recv  public.reward_receivables;
  v_take  bigint;
  v_j     public.journal_entries;
  v_acct  text;
begin
  perform set_config('app.reward_write', '1', true);
  for a in
    select al.*, g.status as g_status, g.user_id as g_user, g.currency as g_cur
      from public.reward_allocations al
      join public.reward_grants g on g.id = al.grant_id
     where al.withdrawal_id = p_withdrawal_id and al.movement = 'HOLD'
     order by al.id
     for update of g
  loop
    -- clamp by what is actually still in reserved (a reversal may have
    -- already moved part of it to `reversed` as receivable)
    v_take := least(a.amount_minor, (select reserved_minor from public.reward_grants where id = a.grant_id));
    if v_take <= 0 then
      continue;
    end if;
    if a.g_status in ('REVERSED','PARTIALLY_REVERSED') then
      -- value returns but the grant is cancelled → settle open receivable
      update public.reward_grants
         set reserved_minor = reserved_minor - v_take,
             reversed_minor = reversed_minor + v_take
       where id = a.grant_id;
      insert into public.reward_allocations
        (grant_id, movement, bucket, amount_minor, journal_id, withdrawal_id, request_id)
      values (a.grant_id, 'HOLD_RETURN', a.bucket, v_take, p_journal_id, p_withdrawal_id, p_request_id);
      -- settle oldest open receivable for this user+currency
      select * into v_recv from public.reward_receivables
        where user_id = a.g_user and currency = a.g_cur and status = 'OPEN'
        order by created_at, id limit 1 for update;
      if v_recv.id is not null then
        v_take := least(v_take, v_recv.outstanding_minor);
        v_acct := case when a.bucket = 'BONUS' then ':bonus' else ':available' end;
        v_j := public.post_journal(
          'REWARD_RECOVERY', a.g_cur,
          jsonb_build_array(
            jsonb_build_object('account_key','user:' || a.g_user::text || v_acct,'direction','DEBIT','amount_minor',v_take),
            jsonb_build_object('account_key','system:reward_receivable','direction','CREDIT','amount_minor',v_take)),
          'RWR-RCV-' || v_recv.id::text || '-rel',
          'reward:recover:' || v_recv.id::text || ':rel:' || p_withdrawal_id::text,
          'reward_receivable', v_recv.id::text, 'SYSTEM', null, p_request_id,
          'reward debt settled by returned hold',
          jsonb_build_object('receivable_id', v_recv.id, 'withdrawal_id', p_withdrawal_id),
          null);
        update public.reward_receivables
           set outstanding_minor = outstanding_minor - v_take,
               status = case when outstanding_minor - v_take <= 0
                             then 'SETTLED'::public.receivable_status else status end,
               settled_at = case when outstanding_minor - v_take <= 0
                                 then now() else settled_at end
         where id = v_recv.id;
      end if;
    else
      update public.reward_grants
         set reserved_minor = reserved_minor - v_take,
             bonus_minor    = bonus_minor    + case when a.bucket = 'BONUS'    then v_take else 0 end,
             released_minor = released_minor + case when a.bucket = 'RELEASED' then v_take else 0 end
       where id = a.grant_id;
      insert into public.reward_allocations
        (grant_id, movement, bucket, amount_minor, journal_id, withdrawal_id, request_id)
      values (a.grant_id, 'HOLD_RETURN', a.bucket, v_take, p_journal_id, p_withdrawal_id, p_request_id);
    end if;
  end loop;
end;
$$;

-- consume_reward_holds — hold resolution on payout/investment debit:
-- reserved → consumed for every HOLD allocation of the entity.

create or replace function public.consume_reward_holds(
  p_withdrawal_id uuid default null,
  p_investment_id uuid default null,
  p_journal_id    uuid default null,
  p_request_id    text default null
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  a      record;
  v_take bigint;
begin
  perform set_config('app.reward_write', '1', true);
  for a in
    select al.* from public.reward_allocations al
      join public.reward_grants g on g.id = al.grant_id
     where al.movement = 'HOLD'
       and ((p_withdrawal_id is not null and al.withdrawal_id = p_withdrawal_id)
         or (p_investment_id is not null and al.investment_id = p_investment_id))
     order by al.id
     for update of g
  loop
    v_take := least(a.amount_minor,
              (select reserved_minor from public.reward_grants where id = a.grant_id));
    if v_take <= 0 then
      continue;
    end if;
    update public.reward_grants
       set reserved_minor = reserved_minor - v_take,
           consumed_minor = consumed_minor + v_take
     where id = a.grant_id;
    insert into public.reward_allocations
      (grant_id, movement, amount_minor, journal_id, withdrawal_id, investment_id, request_id)
    values (a.grant_id, 'CONSUME', v_take, p_journal_id,
            p_withdrawal_id, p_investment_id, p_request_id);
  end loop;
end;
$$;

-- has_deposit_history — the explicit no-deposit gate predicate.

create or replace function public.has_deposit_history(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.deposits
     where user_id = p_user_id and funding_journal_id is not null)
$$;

-- ── quote_withdrawal — provenance-aware quote ────────────────────────────────

create or replace function public.quote_withdrawal(
  p_amount_minor    bigint,
  p_bank_account_id uuid default null
)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid        uuid := auth.uid();
  v_currency   public.currency_code := 'NGN';
  v_status     text;
  v_available  bigint;
  v_bonus_w    bigint;
  v_bonus_g    bigint;
  v_released   bigint;
  v_exempt     bigint;
  v_ordinary   bigint;
  v_ord_part   bigint;
  v_rew_part   bigint;
  v_has_dep    boolean;
  v_dep_req    boolean;
  v_min        bigint;
  v_bps        numeric;
  v_cap        numeric;
  v_fee        bigint;
  v_net        bigint;
  v_verified   boolean;
  v_first      boolean;
  v_threshold  numeric;
  v_kyc_req    boolean;
  v_exempt_kyc boolean;
  v_pin_set    boolean;
  v_blocked    text;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select account_status into v_status from public.profiles where id = v_uid;
  select coalesce(available_minor,0), coalesce(bonus_minor,0)
    into v_available, v_bonus_w
    from public.wallets where user_id = v_uid and currency = v_currency;
  v_available := coalesce(v_available, 0);
  v_bonus_w   := coalesce(v_bonus_w, 0);

  select bonus_minor, released_minor into v_bonus_g, v_released
    from public.reward_pool(v_uid, v_currency);
  v_bonus_g  := coalesce(v_bonus_g, 0);
  v_released := coalesce(v_released, 0);
  -- exempt pool = tracked reward value (bonus counters are authoritative for
  -- the spendable grant value; wallet.bonus may additionally hold untracked
  -- admin-adjusted bonus, which reconcile flags)
  v_exempt   := least(v_bonus_w, v_bonus_g) + v_released;
  v_ordinary := greatest(0, v_available - v_released);

  v_rew_part := least(coalesce(p_amount_minor,0), v_exempt);
  v_ord_part := greatest(0, coalesce(p_amount_minor,0) - v_rew_part);

  v_dep_req := coalesce(public.config_bool('withdrawal.requires_deposit_history'), true);
  v_has_dep := public.has_deposit_history(v_uid);

  v_min := public.min_withdrawal_minor(v_currency);
  v_bps := public.config_number('withdrawal.fee_bps');
  v_cap := public.config_number('withdrawal.fee_cap_minor.' || v_currency::text);

  v_verified := exists (
    select 1 from public.kyc_submissions
     where user_id = v_uid and status = 'VERIFIED');
  -- first-withdrawal exception applies to the first withdrawal that draws
  -- ordinary funds; reward-only withdrawals do not consume it
  v_first := not exists (
    select 1 from public.withdrawals where user_id = v_uid and ordinary_amount_minor > 0);
  v_kyc_req := coalesce(public.config_bool('kyc.required_for_withdrawal'), true);
  v_threshold := public.config_number('withdrawal.first_without_kyc_max_minor.' || v_currency::text);
  v_exempt_kyc := v_first and v_threshold is not null
                  and p_amount_minor is not null and p_amount_minor < v_threshold;
  v_pin_set := exists (select 1 from public.user_pins where user_id = v_uid);

  v_fee := case when p_amount_minor is null or p_amount_minor <= 0 then null
                else floor(p_amount_minor * coalesce(v_bps, 0) / 10000)::bigint end;
  if v_fee is not null and v_cap is not null then
    v_fee := least(v_fee, v_cap)::bigint;
  end if;
  v_net := case when v_fee is null then null else p_amount_minor - v_fee end;

  v_blocked := case
    when v_status is distinct from 'ACTIVE' then 'Your account is not active.'
    when p_amount_minor is null or p_amount_minor <= 0 then 'Enter a valid amount.'
    when v_min is not null and p_amount_minor < v_min then 'Amount is below the minimum withdrawal.'
    when p_amount_minor > v_available + v_bonus_w then 'Insufficient withdrawable balance.'
    when v_ord_part > 0 and v_dep_req and not v_has_dep
      then 'A confirmed deposit is required before withdrawing non-reward funds.'
    when not v_pin_set then 'Set a transaction PIN before withdrawing.'
    when v_ord_part > 0 and v_kyc_req and not v_verified and not v_exempt_kyc
      then 'Identity verification is required to withdraw.'
    else null end;

  return jsonb_build_object(
    'currency', v_currency::text,
    'amount_minor', p_amount_minor,
    'available_minor', v_available,
    'bonus_minor', v_bonus_w,
    'withdrawable_minor', v_available + v_bonus_w,
    'reward_exempt_minor', v_exempt,
    'ordinary_available_minor', v_ordinary,
    'reward_part_minor', v_rew_part,
    'ordinary_part_minor', v_ord_part,
    'has_deposit_history', v_has_dep,
    'requires_deposit_history', v_dep_req,
    'min_minor', v_min,
    'fee_minor', v_fee,
    'net_minor', v_net,
    'fee_bps', v_bps,
    'fee_cap_minor', v_cap,
    'kyc_verified', v_verified,
    'kyc_required', v_ord_part > 0 and v_kyc_req and not v_verified and not v_exempt_kyc,
    'first_withdrawal', v_first,
    'first_without_kyc_max_minor', v_threshold,
    'kyc_exempt', v_exempt_kyc,
    'pin_set', v_pin_set,
    'eligible', v_blocked is null,
    'blocked_reason', v_blocked);
end;
$$;

-- ── request_withdrawal — provenance-aware hold ───────────────────────────────

drop function public.request_withdrawal(bigint, jsonb, text, text, uuid);

create or replace function public.request_withdrawal(
  p_amount_minor    bigint,
  p_destination     jsonb,
  p_idempotency_key text,
  p_request_id      text default null,
  p_bank_account_id uuid default null
)
returns public.withdrawals
language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid;
  v_min       numeric;
  v_bps       numeric;
  v_cap       numeric;
  v_fee       bigint;
  v_net       bigint;
  v_wid       uuid := gen_random_uuid();
  v_j         public.journal_entries;
  v_w         public.withdrawals;
  v_status    text;
  v_currency  public.currency_code := 'NGN';
  v_verified  boolean;
  v_first     boolean;
  v_kyc_req   boolean;
  v_threshold numeric;
  v_bank      public.user_bank_accounts;
  v_bonus_w   bigint;
  v_bonus_g   bigint;
  v_released  bigint;
  v_exempt    bigint;
  v_reward    bigint;
  v_ordinary  bigint;
  v_bonus_leg bigint;
  v_avail_leg bigint;
  v_dep_req   boolean;
  v_has_dep   boolean;
  v_lines     jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  select account_status into v_status from public.profiles where id = v_uid;
  if v_status is distinct from 'ACTIVE' then
    raise exception 'account is not active';
  end if;

  -- Lock order contract: 'reward:' before 'withdrawal:' — every path that
  -- draws reward value takes the reward lock so pool snapshots are stable
  -- against concurrent reward spends (withdrawals, investments, releases).
  perform pg_advisory_xact_lock(hashtextextended('reward:' || v_uid::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('withdrawal:' || v_uid::text, 0));

  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'ERR_AMOUNT: amount must be a positive integer minor-unit value';
  end if;
  v_min := public.min_withdrawal_minor(v_currency);
  if v_min is not null and p_amount_minor < v_min then
    raise exception 'ERR_AMOUNT: minimum withdrawal is % minor units', v_min;
  end if;

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency_key is required';
  end if;

  -- Idempotent retry: converge before any gate or journal so a legitimate
  -- replay never re-checks the PIN stamp or re-checks KYC.
  select * into v_w from public.withdrawals
    where idempotency_key = 'wd:init:' || v_uid::text || ':' || p_idempotency_key;
  if v_w.id is not null then
    return v_w;
  end if;

  -- Destination: saved account wins; otherwise inline jsonb (validated).
  if p_bank_account_id is not null then
    select * into v_bank from public.user_bank_accounts
     where id = p_bank_account_id and user_id = v_uid and archived_at is null;
    if not found then
      raise exception 'ERR_DESTINATION: bank account not found';
    end if;
    p_destination := jsonb_build_object(
      'bank_name', v_bank.bank_name, 'bank_code', v_bank.bank_code,
      'account_number', v_bank.account_number, 'account_name', v_bank.account_name,
      'bank_account_id', v_bank.id);
  elsif p_destination is null
     or btrim(coalesce(p_destination ->> 'bank_name','')) = ''
     or btrim(coalesce(p_destination ->> 'account_number','')) = ''
     or btrim(coalesce(p_destination ->> 'account_name','')) = '' then
    raise exception 'ERR_DESTINATION: bank_name, account_number and account_name are required';
  end if;

  -- ── Source allocation: exempt (reward) part first, ordinary remainder ──
  select bonus_minor, released_minor into v_bonus_g, v_released
    from public.reward_pool(v_uid, v_currency);
  v_bonus_g  := coalesce(v_bonus_g, 0);
  v_released := coalesce(v_released, 0);
  select coalesce(bonus_minor,0) into v_bonus_w
    from public.wallets where user_id = v_uid and currency = v_currency;
  v_bonus_w := coalesce(v_bonus_w, 0);
  v_exempt   := least(v_bonus_w, v_bonus_g) + v_released;
  v_reward   := least(p_amount_minor, v_exempt);
  v_ordinary := p_amount_minor - v_reward;

  -- ── Ordinary-portion gates ──
  -- Deposit history: a user who has never funded cannot withdraw ordinary
  -- funds. Reward-origin value is exempt (referral/task earnings).
  v_dep_req := coalesce(public.config_bool('withdrawal.requires_deposit_history'), true);
  v_has_dep := public.has_deposit_history(v_uid);
  if v_ordinary > 0 and v_dep_req and not v_has_dep then
    raise exception 'ERR_NO_DEPOSIT_HISTORY: a confirmed deposit is required before withdrawing non-reward funds';
  end if;

  -- KYC gate + first-withdrawal exception (D-8.12) — applies to ordinary
  -- funds only. "First" = no prior withdrawal that drew ordinary value.
  v_kyc_req := coalesce(public.config_bool('kyc.required_for_withdrawal'), true);
  if v_ordinary > 0 and v_kyc_req then
    v_verified := exists (
      select 1 from public.kyc_submissions
       where user_id = v_uid and status = 'VERIFIED');
    if not v_verified then
      v_first := not exists (
        select 1 from public.withdrawals
         where user_id = v_uid and ordinary_amount_minor > 0);
      v_threshold := public.config_number('withdrawal.first_without_kyc_max_minor.' || v_currency::text);
      if not (v_first and v_threshold is not null and p_amount_minor < v_threshold) then
        raise exception 'ERR_KYC: identity verification is required before withdrawal';
      end if;
    end if;
  end if;

  -- ── Transaction PIN gate (unchanged — stamp only, never a raw PIN) ──
  if not exists (select 1 from public.user_pins
                  where user_id = v_uid
                    and verified_until is not null
                    and verified_until > now()) then
    raise exception 'ERR_PIN_VERIFY: verify your transaction PIN first';
  end if;

  v_bps := public.config_number('withdrawal.fee_bps');
  v_cap := public.config_number('withdrawal.fee_cap_minor.' || v_currency::text);
  v_fee := floor(p_amount_minor * coalesce(v_bps, 0) / 10000);
  if v_cap is not null then
    v_fee := least(v_fee, v_cap);
  end if;
  v_net := p_amount_minor - v_fee;

  perform set_config('app.withdrawal_write', '1', true);

  -- The withdrawal row must exist before reward allocations reference it
  -- (reward_allocations.withdrawal_id FK). The advisory locks above serialize
  -- same-user retries, so an idempotency conflict here simply returns the
  -- existing row — no hold/journal has been posted yet for this attempt.
  insert into public.withdrawals
    (id, reference, idempotency_key, user_id, currency, amount_minor,
     fee_minor, net_minor, destination, request_id,
     reward_amount_minor, ordinary_amount_minor)
  values (
    v_wid,
    'WD-' || upper(substr(md5(v_wid::text), 1, 12)),
    'wd:init:' || v_uid::text || ':' || p_idempotency_key,
    v_uid, v_currency, p_amount_minor, v_fee, v_net,
    p_destination, p_request_id,
    v_reward, v_ordinary)
  on conflict (idempotency_key) do nothing
  returning * into v_w;

  if v_w.id is null then
    select * into v_w from public.withdrawals
      where idempotency_key = 'wd:init:' || v_uid::text || ':' || p_idempotency_key;
    return v_w;
  end if;

  -- Reserve reward value (moves grant counters; failure aborts the whole
  -- transaction including the withdrawal row above).
  if v_reward > 0 then
    v_bonus_leg := public.draw_reward_holds(v_uid, v_currency, v_reward, v_wid, null, p_request_id);
  else
    v_bonus_leg := 0;
  end if;
  v_avail_leg := p_amount_minor - v_bonus_leg;   -- released-reward + ordinary

  v_lines := '[]'::jsonb;
  if v_bonus_leg > 0 then
    v_lines := v_lines || jsonb_build_object(
      'account_key','user:' || v_uid::text || ':bonus','direction','DEBIT','amount_minor',v_bonus_leg);
  end if;
  if v_avail_leg > 0 then
    v_lines := v_lines || jsonb_build_object(
      'account_key','user:' || v_uid::text || ':available','direction','DEBIT','amount_minor',v_avail_leg);
  end if;
  v_lines := v_lines || jsonb_build_object(
      'account_key','user:' || v_uid::text || ':reserved','direction','CREDIT','amount_minor',p_amount_minor);

  begin
    v_j := public.post_journal(
      'HOLD', v_currency, v_lines,
      'WD-HOLD-' || v_wid::text, 'wd:hold:' || v_wid::text,
      'withdrawal', v_wid::text, 'INVESTOR', v_uid, p_request_id,
      'withdrawal hold', jsonb_build_object('withdrawal_id', v_wid,
        'reward_minor', v_reward, 'ordinary_minor', v_ordinary), null);
  exception when others then
    raise exception 'insufficient withdrawable balance';
  end;

  update public.withdrawals
     set hold_journal_id = v_j.id, hold_bonus_minor = v_bonus_leg
   where id = v_wid
  returning * into v_w;

  insert into public.withdrawal_events
    (withdrawal_id, from_status, to_status, source, request_id, note)
  values (v_wid, null, 'REQUESTED', 'USER', p_request_id,
    'withdrawal requested (reward ' || v_reward || ' / ordinary ' || v_ordinary || ')');

  perform public.emit_outbound('withdrawal.requested', 'withdrawal', v_wid,
    jsonb_build_object(
      'withdrawal_id', v_wid,
      'reference', v_w.reference,
      'status', 'REQUESTED',
      'user', jsonb_build_object('id', v_uid,
        'display_name', (select display_name from public.profiles where id = v_uid)),
      'amount_minor', p_amount_minor,
      'reward_amount_minor', v_reward,
      'ordinary_amount_minor', v_ordinary,
      'fee_minor', v_fee,
      'net_minor', v_net,
      'currency', v_currency::text,
      'destination', p_destination,
      'requested_at', now()),
    'wd:' || v_wid::text || ':requested', p_request_id);

  return v_w;
end;
$$;

-- ── decide_withdrawal — bucket-aware hold release + consume ──────────────────

create or replace function public.decide_withdrawal(
  p_withdrawal_id uuid,
  p_decision      text,
  p_reason        text default null,
  p_request_id    text default null
)
returns public.withdrawals
language plpgsql security definer set search_path = '' as $$
declare
  v_w   public.withdrawals;
  v_j   public.journal_entries;
  v_role text;
  v_lines jsonb;
  v_avail_leg bigint;
begin
  v_role := public.current_admin_role()::text;
  if not public.has_admin_role(array['FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    raise exception 'not authorized to decide withdrawals';
  end if;

  perform set_config('app.withdrawal_write', '1', true);
  select * into v_w from public.withdrawals where id = p_withdrawal_id for update;
  if not found then
    raise exception 'withdrawal % not found', p_withdrawal_id;
  end if;

  case p_decision
    when 'REVIEW' then
      perform public.apply_withdrawal_transition(p_withdrawal_id, 'UNDER_REVIEW', 'ADMIN', p_request_id, p_reason);
    when 'APPROVE' then
      perform public.apply_withdrawal_transition(p_withdrawal_id, 'APPROVED', 'ADMIN', p_request_id, p_reason);
      update public.withdrawals set reviewed_by = auth.uid() where id = p_withdrawal_id;
    when 'REJECT' then
      if v_w.status in ('REJECTED','COMPLETED') then
        raise exception 'cannot reject a % withdrawal', v_w.status;
      end if;
      -- Mirror the hold: return value to the buckets it was drawn from.
      v_lines := jsonb_build_array(jsonb_build_object(
        'account_key','user:' || v_w.user_id::text || ':reserved','direction','DEBIT','amount_minor',v_w.amount_minor));
      if v_w.hold_bonus_minor > 0 then
        v_lines := v_lines || jsonb_build_object(
          'account_key','user:' || v_w.user_id::text || ':bonus','direction','CREDIT','amount_minor',v_w.hold_bonus_minor);
      end if;
      v_avail_leg := v_w.amount_minor - v_w.hold_bonus_minor;
      if v_avail_leg > 0 then
        v_lines := v_lines || jsonb_build_object(
          'account_key','user:' || v_w.user_id::text || ':available','direction','CREDIT','amount_minor',v_avail_leg);
      end if;
      v_j := public.post_journal(
        'HOLD_RELEASE', v_w.currency, v_lines,
        'WD-REL-' || v_w.reference, 'wd:rel:' || v_w.id::text,
        'withdrawal', v_w.id::text, 'ADMIN', auth.uid(), p_request_id,
        'withdrawal rejected — hold released', jsonb_build_object('withdrawal_id', v_w.id), null);
      perform public.release_reward_holds(v_w.id, v_j.id, p_request_id);
      update public.withdrawals set release_journal_id = v_j.id, reviewed_by = auth.uid()
        where id = p_withdrawal_id;
      perform public.apply_withdrawal_transition(p_withdrawal_id, 'REJECTED', 'ADMIN', p_request_id, p_reason);
      perform public.emit_outbound('withdrawal.rejected', 'withdrawal', p_withdrawal_id,
        jsonb_build_object(
          'withdrawal_id', p_withdrawal_id,
          'reference', v_w.reference,
          'status', 'REJECTED',
          'reason', p_reason,
          'user', jsonb_build_object('id', v_w.user_id,
            'display_name', (select display_name from public.profiles where id = v_w.user_id)),
          'amount_minor', v_w.amount_minor,
          'currency', v_w.currency::text),
        'wd:' || p_withdrawal_id::text || ':rejected', p_request_id);
    when 'PROCESSING' then
      perform public.apply_withdrawal_transition(p_withdrawal_id, 'PROCESSING', 'ADMIN', p_request_id, p_reason);
    when 'MARK_PAID' then
      v_j := public.post_journal(
        'EXTERNAL_PAYOUT', v_w.currency,
        jsonb_build_array(
          jsonb_build_object('account_key','user:' || v_w.user_id::text || ':reserved','direction','DEBIT','amount_minor',v_w.amount_minor),
          jsonb_build_object('account_key','system:payouts_clearing','direction','CREDIT','amount_minor',v_w.net_minor))
        || case when v_w.fee_minor > 0
             then jsonb_build_array(jsonb_build_object(
                    'account_key','system:fee_revenue','direction','CREDIT','amount_minor',v_w.fee_minor))
             else '[]'::jsonb end,
        'WD-PAY-' || v_w.reference, 'wd:pay:' || v_w.id::text,
        'withdrawal', v_w.id::text, 'ADMIN', auth.uid(), p_request_id,
        'withdrawal paid externally', jsonb_build_object('withdrawal_id', v_w.id), null);
      perform public.consume_reward_holds(v_w.id, null, v_j.id, p_request_id);
      update public.withdrawals set payout_journal_id = v_j.id, reviewed_by = auth.uid()
        where id = p_withdrawal_id;
      perform public.apply_withdrawal_transition(p_withdrawal_id, 'COMPLETED', 'ADMIN', p_request_id, p_reason);
      perform public.emit_outbound('withdrawal.completed', 'withdrawal', p_withdrawal_id,
        jsonb_build_object(
          'withdrawal_id', p_withdrawal_id,
          'reference', v_w.reference,
          'status', 'COMPLETED',
          'user', jsonb_build_object('id', v_w.user_id,
            'display_name', (select display_name from public.profiles where id = v_w.user_id)),
          'amount_minor', v_w.amount_minor,
          'fee_minor', v_w.fee_minor,
          'net_minor', v_w.net_minor,
          'currency', v_w.currency::text),
        'wd:' || p_withdrawal_id::text || ':completed', p_request_id);
    when 'FAIL' then
      v_lines := jsonb_build_array(jsonb_build_object(
        'account_key','user:' || v_w.user_id::text || ':reserved','direction','DEBIT','amount_minor',v_w.amount_minor));
      if v_w.hold_bonus_minor > 0 then
        v_lines := v_lines || jsonb_build_object(
          'account_key','user:' || v_w.user_id::text || ':bonus','direction','CREDIT','amount_minor',v_w.hold_bonus_minor);
      end if;
      v_avail_leg := v_w.amount_minor - v_w.hold_bonus_minor;
      if v_avail_leg > 0 then
        v_lines := v_lines || jsonb_build_object(
          'account_key','user:' || v_w.user_id::text || ':available','direction','CREDIT','amount_minor',v_avail_leg);
      end if;
      v_j := public.post_journal(
        'HOLD_RELEASE', v_w.currency, v_lines,
        'WD-REL-' || v_w.reference, 'wd:rel:' || v_w.id::text,
        'withdrawal', v_w.id::text, 'ADMIN', auth.uid(), p_request_id,
        'withdrawal failed — hold released', jsonb_build_object('withdrawal_id', v_w.id), null);
      perform public.release_reward_holds(v_w.id, v_j.id, p_request_id);
      update public.withdrawals set release_journal_id = v_j.id where id = p_withdrawal_id;
      perform public.apply_withdrawal_transition(p_withdrawal_id, 'FAILED', 'ADMIN', p_request_id, p_reason);
    else
      raise exception 'unknown decision %', p_decision;
  end case;

  insert into public.audit_log (actor_id, actor_role, action, entity_type, entity_id, result, request_id, metadata)
  values (auth.uid(), v_role, 'withdrawal.' || lower(p_decision), 'withdrawal', p_withdrawal_id::text,
          'SUCCESS', p_request_id, jsonb_build_object('reason', p_reason, 'decision', p_decision));

  select * into v_w from public.withdrawals where id = p_withdrawal_id;
  return v_w;
end;
$$;

-- ── request_investment — reward-capable funding (ordinary → released → bonus)
-- Draw order keeps the exempt withdrawal pool intact as long as possible;
-- ordinary funds spend first, reward value covers the remainder.

create or replace function public.request_investment(
  p_round_id        uuid,
  p_slots           int,
  p_idempotency_key text,
  p_funding_source  public.funding_source default 'WALLET',
  p_request_id      text default null
)
returns public.investments
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid       uuid;
  v_prof      public.profiles%rowtype;
  v_key       text;
  v_inv       public.investments;
  v_round     public.investment_rounds%rowtype;
  v_plan      public.investment_plans%rowtype;
  v_prop      public.properties%rowtype;
  v_used      int;
  v_principal bigint;
  v_profit    bigint;
  v_j         public.journal_entries;
  v_hold_j    public.journal_entries;
  v_avail     bigint;
  v_released  bigint;
  v_bonus_g   bigint;
  v_bonus_w   bigint;
  v_ordinary  bigint;
  v_ord_take  bigint;
  v_rel_take  bigint;
  v_bon_take  bigint;
  v_rew_draw  bigint;
  v_lines     jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  -- ── account gates (Phase 3A: ACTIVE + email_verified; no KYC/PIN here) ──
  select * into v_prof from public.profiles where id = v_uid;
  if v_prof.id is null or v_prof.account_status <> 'ACTIVE' then
    raise exception 'ERR_ACCOUNT_NOT_ACTIVE';
  end if;
  if not v_prof.email_verified then
    raise exception 'ERR_EMAIL_VERIFICATION_REQUIRED';
  end if;

  -- ── inputs ──
  if p_slots is null or p_slots <= 0 then
    raise exception 'ERR_INVALID_SLOTS';
  end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency_key is required';
  end if;
  if p_funding_source is distinct from 'WALLET' then
    raise exception 'ERR_FUNDING_SOURCE';
  end if;

  v_key := 'inv:create:' || v_uid::text || ':' || p_idempotency_key;

  -- ── idempotent replay ──
  select * into v_inv from public.investments where idempotency_key = v_key;
  if v_inv.id is not null then
    if v_inv.round_id = p_round_id and v_inv.slots = p_slots then
      return v_inv;
    end if;
    raise exception 'ERR_IDEMPOTENCY_CONFLICT';
  end if;

  -- ── cheap validations first — fail before taking the round lock ──
  select * into v_round from public.investment_rounds where id = p_round_id;
  if v_round.id is null then
    raise exception 'ERR_ROUND_NOT_FOUND';
  elsif v_round.status not in ('OPEN','NEARING_CAPACITY')
     or v_round.opens_at > now()
     or v_round.closes_at <= now() then
    raise exception 'ERR_ROUND_NOT_OPEN';
  end if;

  select * into v_plan from public.investment_plans where id = v_round.plan_id;
  select * into v_prop from public.properties where id = v_plan.property_id;
  if v_plan.id is null or v_plan.status <> 'PUBLISHED'
     or v_prop.id is null or v_prop.publication_status <> 'PUBLISHED' then
    raise exception 'ERR_PLAN_NOT_AVAILABLE';
  end if;
  if v_plan.investment_fee_bps <> 0 then
    raise exception 'ERR_FEE_UNSUPPORTED';
  end if;
  if v_round.currency <> v_plan.currency then
    raise exception 'ERR_CURRENCY';
  end if;

  if p_slots < v_plan.min_slots then
    raise exception 'ERR_INVALID_SLOTS';
  end if;
  if v_plan.max_slots_per_user is not null then
    select coalesce(sum(slots), 0) into v_used
      from public.investments
     where user_id = v_uid and plan_id = v_plan.id
       and status in ('PAYMENT_PENDING','ACTIVE','MATURITY_DUE','SETTLING','COMPLETED');
    if v_used + p_slots > v_plan.max_slots_per_user then
      raise exception 'ERR_INVESTMENT_LIMIT_EXCEEDED';
    end if;
  end if;

  perform set_config('app.investment_write', '1', true);

  -- ── atomic capacity claim — serializes all buyers on the round row ──
  update public.investment_rounds
     set allocated_slots = allocated_slots + p_slots,
         status = case
           when allocated_slots + reserved_slots + p_slots >= total_slots
             then 'SOLD_OUT'::public.investment_round_status else status end,
         closed_at = case
           when allocated_slots + reserved_slots + p_slots >= total_slots
             then now() else closed_at end
   where id = p_round_id
     and status in ('OPEN','NEARING_CAPACITY')
     and opens_at <= now()
     and closes_at > now()
     and allocated_slots + reserved_slots + p_slots <= total_slots
  returning * into v_round;

  if v_round.id is null then
    select * into v_round from public.investment_rounds where id = p_round_id;
    if v_round.status in ('OPEN','NEARING_CAPACITY')
       and v_round.opens_at <= now() and v_round.closes_at > now() then
      raise exception 'ERR_ROUND_CAPACITY_EXCEEDED';
    else
      raise exception 'ERR_ROUND_NOT_OPEN';
    end if;
  end if;

  -- ── authoritative economics — integer minor units, floor truncation ──
  v_principal := p_slots::bigint * v_round.slot_price_minor;
  v_profit    := (v_principal * v_plan.roi_bps) / 10000;

  insert into public.investments (
    reference, user_id, round_id, plan_id, property_id, funding_source,
    slots, slot_price_minor, currency, principal_minor, roi_bps,
    duration_hours, expected_profit_minor, maturity_value_minor,
    status, activated_at, matures_at, idempotency_key
  ) values (
    'INV-' || upper(substr(md5(gen_random_uuid()::text), 1, 12)),
    v_uid, v_round.id, v_plan.id, v_prop.id, 'WALLET',
    p_slots, v_round.slot_price_minor, v_round.currency, v_principal,
    v_plan.roi_bps, v_plan.duration_hours, v_profit,
    v_principal + v_profit,
    'ACTIVE', now(), now() + v_plan.duration_hours * interval '1 hour',
    v_key
  ) returning * into v_inv;

  -- ── funding journals — wallet CHECK rejects insufficient funds ──
  -- Lock contract: 'reward:' taken before any draw (see request_withdrawal).
  perform pg_advisory_xact_lock(hashtextextended('reward:' || v_uid::text, 0));

  -- source split: ordinary AVAILABLE → released rewards → BONUS
  select coalesce(available_minor,0), coalesce(bonus_minor,0)
    into v_avail, v_bonus_w
    from public.wallets where user_id = v_uid and currency = v_round.currency;
  v_avail   := coalesce(v_avail, 0);
  v_bonus_w := coalesce(v_bonus_w, 0);
  select coalesce(released_minor,0), coalesce(bonus_minor,0)
    into v_released, v_bonus_g
    from public.reward_pool(v_uid, v_round.currency);
  v_released := coalesce(v_released, 0);
  v_bonus_g  := coalesce(v_bonus_g, 0);
  v_ordinary := greatest(0, v_avail - v_released);

  -- typed insufficient-balance error before touching counters — total
  -- spendable = available (ordinary+released) + min(wallet bonus, grant bonus)
  if v_principal > v_avail + least(v_bonus_w, v_bonus_g) then
    raise exception 'ERR_INSUFFICIENT_BALANCE';
  end if;

  v_ord_take := least(v_principal, v_ordinary);
  v_rew_draw := v_principal - v_ord_take;   -- drawn from released then bonus

  begin
    if v_rew_draw > 0 then
      -- counter moves (released→reserved→consumed, bonus→reserved→consumed)
      -- recorded as HOLD allocations, then CONSUME below
      v_bon_take := public.draw_reward_holds(v_uid, v_round.currency, v_rew_draw,
                                             null, v_inv.id, p_request_id);
    else
      v_bon_take := 0;
    end if;

    v_lines := '[]'::jsonb;
    if v_bon_take > 0 then
      v_lines := v_lines || jsonb_build_object(
        'account_key','user:' || v_uid::text || ':bonus','direction','DEBIT','amount_minor',v_bon_take);
    end if;
    if v_principal - v_bon_take > 0 then
      v_lines := v_lines || jsonb_build_object(
        'account_key','user:' || v_uid::text || ':available','direction','DEBIT','amount_minor',v_principal - v_bon_take);
    end if;
    v_lines := v_lines || jsonb_build_object(
        'account_key','user:' || v_uid::text || ':reserved','direction','CREDIT','amount_minor',v_principal);

    v_hold_j := public.post_journal(
      'HOLD', v_round.currency, v_lines,
      null, 'inv:hold:' || v_inv.id::text,
      'investment', v_inv.id::text, 'SYSTEM', v_uid, p_request_id,
      'Investment hold — ' || v_inv.reference);

    v_j := public.post_journal(
      'INVESTMENT_DEBIT', v_round.currency,
      jsonb_build_array(
        jsonb_build_object('account_key', 'user:' || v_uid::text || ':reserved',
                           'direction', 'DEBIT', 'amount_minor', v_principal),
        jsonb_build_object('account_key', 'system:investment_principal_payable',
                           'direction', 'CREDIT', 'amount_minor', v_principal)),
      null, 'inv:fund:' || v_inv.id::text,
      'investment', v_inv.id::text, 'SYSTEM', v_uid, p_request_id,
      'Investment principal — ' || v_inv.reference);
  exception
    when check_violation then
      raise exception 'ERR_INSUFFICIENT_BALANCE';
  end;

  if v_rew_draw > 0 then
    perform public.consume_reward_holds(null, v_inv.id, v_j.id, p_request_id);
  end if;

  update public.investments set payment_reference = v_j.reference
   where id = v_inv.id
  returning * into v_inv;

  insert into public.investment_events
    (investment_id, event_type, actor_id, actor_kind, request_id, metadata)
  values
    (v_inv.id, 'CREATED', v_uid, 'INVESTOR', p_request_id,
     jsonb_build_object('slots', p_slots)),
    (v_inv.id, 'PAYMENT_CONFIRMED', null, 'SYSTEM', p_request_id,
     jsonb_build_object('journal', v_j.reference)),
    (v_inv.id, 'ACTIVATED', null, 'SYSTEM', p_request_id,
     jsonb_build_object('matures_at', v_inv.matures_at));

  -- Phase 9B: the referred user's first investment may complete referral
  -- qualification for their referrer (deposit + invest rule).
  perform public.try_evaluate_referral(v_uid, p_request_id);

  return v_inv;
exception
  when unique_violation then
    select * into v_inv from public.investments where idempotency_key = v_key;
    if v_inv.id is not null then
      if v_inv.round_id = p_round_id and v_inv.slots = p_slots then
        return v_inv;
      end if;
      raise exception 'ERR_IDEMPOTENCY_CONFLICT';
    end if;
    raise;
end;
$$;

-- ── reconcile_rewards — ops anomaly detection (finance/admin read-only) ──────

create or replace function public.reconcile_rewards()
returns table(check_name text, entity_type text, entity_id text, detail text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_admin_role(array['FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    raise exception 'not authorized to reconcile rewards';
  end if;

  -- qualifying confirmed deposit without a deposit grant (and referrals on)
  return query
    select 'qualifying_deposit_without_reward', 'deposit', d.id::text,
           'confirmed deposit ' || d.amount_minor || ' ' || d.currency
           || ' meets threshold but has no deposit reward grant'
      from public.deposits d
      join public.referrals rf on rf.referred_id = d.user_id
     where d.status = 'CONFIRMED'
       and coalesce(d.confirmed_amount_minor, d.amount_minor)
           >= public.config_number('referral.qualifying_deposit_minor.' || d.currency::text)
       and public.config_bool('referral.enabled')
       and not exists (select 1 from public.reward_grants g
                        where g.deposit_id = d.id and g.kind = 'REFERRAL_DEPOSIT');

  -- qualified referral missing its sign-up grant entirely
  return query
    select 'qualified_referral_without_grant', 'referral', rf.id::text,
           'referral qualified/credited but no REFERRAL_SIGNUP grant exists'
      from public.referrals rf
     where rf.status in ('QUALIFIED','CREDITED')
       and not exists (select 1 from public.reward_grants g
                        where g.referral_id = rf.id and g.kind = 'REFERRAL_SIGNUP');

  -- credited grant missing its issue journal
  return query
    select 'credited_without_journal', 'reward_grant', g.id::text,
           'status CREDITED but issue_journal_id is null'
      from public.reward_grants g
     where g.status in ('CREDITED','PARTIALLY_REVERSED')
       and (g.issue_journal_id is null or not exists (
              select 1 from public.journal_entries j
               where j.id = g.issue_journal_id and j.journal_type = 'REWARD_CREDIT'));

  -- reversed grant still holding withdrawable value
  return query
    select 'reversed_with_spendable', 'reward_grant', g.id::text,
           'REVERSED grant still holds bonus/released ' ||
           (g.bonus_minor + g.released_minor)
      from public.reward_grants g
     where g.status = 'REVERSED' and (g.bonus_minor + g.released_minor) > 0;

  -- receivable ledger balance vs OPEN receivable rows, per currency
  return query
    select 'receivable_balance_drift', 'system_account', a.key,
           'ledger DR-CR balance ' || coalesce(bal.b,0)
           || ' <> open receivables ' || coalesce(o.s,0)
      from public.ledger_accounts a
      left join lateral (
        select sum(case e.direction when 'DEBIT' then e.amount_minor else -e.amount_minor end) as b
          from public.ledger_entries e where e.account_id = a.id) bal on true
      left join lateral (
        select sum(r.outstanding_minor) as s from public.reward_receivables r
         where r.currency = a.currency and r.status = 'OPEN') o on true
     where a.system_kind = 'REWARD_RECEIVABLE'
       and coalesce(bal.b,0) <> coalesce(o.s,0);

  -- grant counter totals vs wallet BONUS, per user+currency (projection drift)
  return query
    select 'bonus_counter_drift', 'wallet', w.user_id::text || ':' || w.currency::text,
           'wallet bonus ' || w.bonus_minor || ' <> grant bonus total ' || coalesce(g.t,0)
      from public.wallets w
      left join lateral (
        select sum(bonus_minor) as t from public.reward_grants g
         where g.user_id = w.user_id and g.currency = w.currency) g on true
     where w.bonus_minor <> coalesce(g.t, 0);

  -- released-reward value must never exceed the wallet's AVAILABLE balance
  return query
    select 'released_exceeds_available', 'wallet', w.user_id::text || ':' || w.currency::text,
           'released ' || coalesce(g.t,0) || ' exceeds available ' || w.available_minor
      from public.wallets w
      join lateral (
        select sum(released_minor) as t from public.reward_grants g
         where g.user_id = w.user_id and g.currency = w.currency) g on true
     where coalesce(g.t,0) > w.available_minor;
end;
$$;

-- ── Privileges ───────────────────────────────────────────────────────────────

revoke all on function public.reward_pool(uuid, public.currency_code) from public, anon, authenticated;
grant  execute on function public.reward_pool(uuid, public.currency_code) to service_role;
revoke all on function public.draw_reward_holds(uuid, public.currency_code, bigint, uuid, uuid, text)
  from public, anon, authenticated;
grant  execute on function public.draw_reward_holds(uuid, public.currency_code, bigint, uuid, uuid, text)
  to service_role;
revoke all on function public.release_reward_holds(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.release_reward_holds(uuid, uuid, text) to service_role;
revoke all on function public.consume_reward_holds(uuid, uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.consume_reward_holds(uuid, uuid, uuid, text) to service_role;
revoke all on function public.has_deposit_history(uuid) from public, anon, authenticated;
grant  execute on function public.has_deposit_history(uuid) to service_role;

revoke execute on function public.quote_withdrawal(bigint, uuid) from public, anon;
grant  execute on function public.quote_withdrawal(bigint, uuid) to authenticated;
revoke execute on function public.request_withdrawal(bigint, jsonb, text, text, uuid) from public, anon;
grant  execute on function public.request_withdrawal(bigint, jsonb, text, text, uuid) to authenticated;
revoke execute on function public.decide_withdrawal(uuid, text, text, text) from public, anon;
grant  execute on function public.decide_withdrawal(uuid, text, text, text) to authenticated;
revoke execute on function public.request_investment(uuid, int, text, public.funding_source, text) from public, anon;
grant  execute on function public.request_investment(uuid, int, text, public.funding_source, text) to authenticated;
grant  execute on function public.reconcile_rewards() to authenticated;
