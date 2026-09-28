-- 0024 — Phase 9B part 3: reward engine.
--
-- Config (all amounts integer minor units, per-currency keys follow the
-- established '<key>_minor.<CUR>' convention):
--   referral.enabled                      BOOLEAN  true
--   referral.signup_requires_investment   BOOLEAN  true   (deposit + invest)
--   referral.signup_reward_minor.NGN      INTEGER  150000  (₦1,500)
--   referral.signup_reward_minor.USD      INTEGER  0, is_active=false
--       — placeholder; USD signup reward is not an approved business value.
--   referral.qualifying_deposit_minor.NGN INTEGER  500000  (₦5,000 — replaces
--       the stale ₦50,000 Phase 3 default)
--   referral.qualifying_deposit_minor.USD INTEGER  500     ($5)
--   referral.deposit_reward_bps           INTEGER  500     (5% — replaces stale 1%)
--   referral.deposit_reward_cap_minor.NGN INTEGER  1000000 (₦10,000 per event)
--   referral.deposit_reward_cap_minor.USD INTEGER  1000    ($10 per event)
--   reward.claim_ttl_seconds              INTEGER  900
--   reward.debt_offset_on_issue           BOOLEAN  true
--   withdrawal.requires_deposit_history   BOOLEAN  true (enforced in 0025)
--
-- The four scalar Phase-3 referral keys are deactivated — the per-currency
-- keys above are authoritative.

-- ── System accounts (enum value added in 0023 — usable now) ─────────────────

insert into public.ledger_accounts (key, kind, system_kind, currency) values
  ('system:reward_receivable:NGN', 'SYSTEM', 'REWARD_RECEIVABLE', 'NGN'),
  ('system:reward_receivable:USD', 'SYSTEM', 'REWARD_RECEIVABLE', 'USD')
on conflict (key) do nothing;

-- ── Config ───────────────────────────────────────────────────────────────────

insert into public.admin_config (key, category, value_type, value, currency, description, is_active)
values
  ('referral.enabled', 'referrals', 'BOOLEAN', 'true', null,
   'Kill switch: when false the evaluator is a no-op (no new rewards).', true),
  ('referral.signup_requires_investment', 'referrals', 'BOOLEAN', 'true', null,
   'When true the referral qualifies only after the referred user both deposits
    at/above the qualifying threshold AND holds an activated investment.', true),
  ('referral.signup_reward_minor.NGN', 'referrals', 'MONEY_MINOR', '150000', 'NGN',
   'Sign-up reward paid to the REFERRER once the referred user qualifies.', true),
  ('referral.signup_reward_minor.USD', 'referrals', 'MONEY_MINOR', '0', 'USD',
   'USD sign-up reward — test/default placeholder only, not an approved business
    value. Inactive: no USD sign-up reward is issued until ops sets a value.', false),
  ('referral.qualifying_deposit_minor.NGN', 'referrals', 'MONEY_MINOR', '500000', 'NGN',
   'Minimum confirmed deposit (₦5,000) that makes a deposit qualifying.', true),
  ('referral.qualifying_deposit_minor.USD', 'referrals', 'MONEY_MINOR', '500', 'USD',
   'Minimum confirmed deposit ($5) that makes a deposit qualifying.', true),
  ('referral.deposit_reward_bps', 'referrals', 'BPS', '500', null,
   'Deposit reward paid to the referrer: 5% of each qualifying deposit amount.', true),
  ('referral.deposit_reward_cap_minor.NGN', 'referrals', 'MONEY_MINOR', '1000000', 'NGN',
   'Per-deposit reward cap (₦10,000).', true),
  ('referral.deposit_reward_cap_minor.USD', 'referrals', 'MONEY_MINOR', '1000', 'USD',
   'Per-deposit reward cap ($10).', true),
  ('reward.claim_ttl_seconds', 'rewards', 'INTEGER', '900', null,
   'Task claims still unverified after this TTL become EXPIRED and may be retried.', true),
  ('reward.debt_offset_on_issue', 'rewards', 'BOOLEAN', 'true', null,
   'When true, new reward issuance first offsets any open reward receivables.', true),
  ('withdrawal.requires_deposit_history', 'withdrawals', 'BOOLEAN', 'true', null,
   'When true, the ordinary (non-reward) portion of a withdrawal requires at
    least one historically-funded deposit. Reward-origin funds are exempt.', true),
  ('referral.share_base_url', 'referrals', 'TEXT', '"https://rentbrown.example/r/"', null,
   'Public share-link prefix; get_referral_summary appends the caller''s code.', true)
on conflict (key) do nothing;

-- Deactivate stale scalar Phase-3 keys so no code path can read them again.
update public.admin_config
   set is_active = false,
       description = description || ' [SUPERSEDED 0024: per-currency keys are authoritative]'
 where key in ('referral.signup_reward_minor', 'referral.qualifying_deposit_minor',
               'referral.deposit_referral_bps', 'referral.deposit_referral_cap_minor')
   and is_active;

-- ── emit_outbound — shared outbox helper ─────────────────────────────────────

create or replace function public.emit_outbound(
  p_event_type   text,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_data         jsonb,
  p_idem_key     text,
  p_request_id   text default null
)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.outbound_write', '1', true);
  insert into public.outbound_events
    (event_type, aggregate_type, aggregate_id, payload, idempotency_key, request_id)
  values (
    p_event_type, p_aggregate_type, p_aggregate_id,
    jsonb_build_object(
      'spec', 'rentbrown.outbound.v1',
      'event_id', gen_random_uuid(),
      'event_type', p_event_type,
      'idempotency_key', p_idem_key,
      'occurred_at', now(),
      'request_id', p_request_id,
      'data', p_data),
    p_idem_key, p_request_id)
  on conflict (idempotency_key) do nothing;
end;
$$;

-- ── reward_event_log — small audit helper ────────────────────────────────────

create or replace function public.reward_event_log(
  p_grant_id uuid, p_referral_id uuid, p_event_type text,
  p_actor_kind text default 'SYSTEM', p_actor_id uuid default null,
  p_journal_id uuid default null, p_request_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.reward_write', '1', true);
  insert into public.reward_events
    (grant_id, referral_id, event_type, actor_kind, actor_id, journal_id, request_id, metadata)
  values
    (p_grant_id, p_referral_id, p_event_type, p_actor_kind, p_actor_id,
     p_journal_id, p_request_id, p_metadata);
end;
$$;

-- ── collect_receivables — offset open reward debt against current bonus ──────
-- Called after each issuance. Drains BONUS (REWARD_RECOVERY journal) against
-- the oldest open receivables first. Returns total collected.

create or replace function public.collect_receivables(
  p_user_id    uuid,
  p_currency   public.currency_code,
  p_request_id text default null
)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_recv    public.reward_receivables;
  v_g       public.reward_grants;
  v_bonus   bigint;
  v_take    bigint;
  v_gt      bigint;
  v_remaining bigint;
  v_total   bigint := 0;
  v_j       public.journal_entries;
begin
  if not public.config_bool('reward.debt_offset_on_issue') then
    return 0;
  end if;
  perform set_config('app.reward_write', '1', true);
  select bonus_minor into v_bonus from public.wallets
    where user_id = p_user_id and currency = p_currency;
  v_bonus := coalesce(v_bonus, 0);

  for v_recv in
    select * from public.reward_receivables
     where user_id = p_user_id and currency = p_currency and status = 'OPEN'
     order by created_at, id
     for update
  loop
    exit when v_bonus <= 0;
    v_take := least(v_recv.outstanding_minor, v_bonus);
    exit when v_take <= 0;

    v_j := public.post_journal(
      'REWARD_RECOVERY', p_currency,
      jsonb_build_array(
        jsonb_build_object('account_key','user:' || p_user_id::text || ':bonus','direction','DEBIT','amount_minor',v_take),
        jsonb_build_object('account_key','system:reward_receivable','direction','CREDIT','amount_minor',v_take)),
      'RWR-RCV-' || v_recv.id::text,
      'reward:recover:' || v_recv.id::text || ':' || v_recv.outstanding_minor::text,
      'reward_receivable', v_recv.id::text, 'SYSTEM', null, p_request_id,
      'reward debt offset on issuance',
      jsonb_build_object('receivable_id', v_recv.id, 'source_grant_id', v_recv.source_grant_id),
      null);

    update public.reward_receivables
       set outstanding_minor = outstanding_minor - v_take,
           status            = case when outstanding_minor - v_take <= 0
                                    then 'SETTLED'::public.receivable_status else status end,
           settled_at        = case when outstanding_minor - v_take <= 0
                                    then now() else settled_at end
     where id = v_recv.id;
    v_bonus := v_bonus - v_take;
    v_total := v_total + v_take;

    -- Provenance: the repaid value comes out of the user's current reward
    -- value in BONUS. Walk live grants FIFO, decrementing bonus → consumed
    -- (value left the user's possession in settlement of reward debt).
    v_remaining := v_take;
    for v_g in
      select * from public.reward_grants
       where user_id = p_user_id and currency = p_currency
         and bonus_minor > 0
       order by created_at, id
       for update
    loop
      exit when v_remaining <= 0;
      v_gt := least(v_g.bonus_minor, v_remaining);
      update public.reward_grants
         set bonus_minor    = bonus_minor - v_gt,
             consumed_minor = consumed_minor + v_gt
       where id = v_g.id;
      insert into public.reward_allocations
        (grant_id, movement, bucket, amount_minor, journal_id, receivable_id, request_id)
      values (v_g.id, 'RECOVER', 'BONUS', v_gt, v_j.id, v_recv.id, p_request_id);
      v_remaining := v_remaining - v_gt;
    end loop;
  end loop;
  return v_total;
end;
$$;

-- ── issue_reward_grant — mint a grant's face value into BONUS ───────────────
-- Idempotent (journal idempotency key + status gate). Requires the grant owner
-- to be ACTIVE unless p_force (admin release path). Returns new status.

create or replace function public.issue_reward_grant(
  p_grant_id   uuid,
  p_request_id text default null,
  p_force      boolean default false
)
returns public.reward_grant_status
language plpgsql security definer set search_path = '' as $$
declare
  g        public.reward_grants;
  v_j      public.journal_entries;
  v_status public.account_status;
begin
  perform set_config('app.reward_write', '1', true);
  select * into g from public.reward_grants where id = p_grant_id for update;
  if not found then
    raise exception 'reward grant % not found', p_grant_id;
  end if;
  if g.status = 'CREDITED' then
    return g.status;                          -- already issued — replay safe
  end if;
  if g.status in ('REVERSED','PARTIALLY_REVERSED') then
    raise exception 'cannot issue a % reward grant', g.status;
  end if;
  if g.status = 'BLOCKED' and not p_force then
    return g.status;
  end if;
  if g.currency is null or g.face_minor <= 0 then
    -- No configured value for this currency — stays pending until ops sets one.
    perform public.reward_event_log(g.id, g.referral_id, 'ISSUE_SKIPPED_UNCONFIGURED',
      'SYSTEM', null, null, p_request_id,
      jsonb_build_object('kind', g.kind));
    return g.status;
  end if;

  select account_status into v_status from public.profiles where id = g.user_id;
  if v_status is distinct from 'ACTIVE' then
    update public.reward_grants set status = 'BLOCKED' where id = g.id;
    perform public.reward_event_log(g.id, g.referral_id, 'BLOCKED_INACTIVE_ACCOUNT',
      'SYSTEM', null, null, p_request_id, jsonb_build_object('account_status', v_status));
    return 'BLOCKED';
  end if;

  -- Mint: DR reward_expense / CR user BONUS.
  v_j := public.post_journal(
    'REWARD_CREDIT', g.currency,
    jsonb_build_array(
      jsonb_build_object('account_key','system:reward_expense','direction','DEBIT','amount_minor',g.face_minor),
      jsonb_build_object('account_key','user:' || g.user_id::text || ':bonus','direction','CREDIT','amount_minor',g.face_minor)),
    'RWD-' || upper(substr(md5(g.id::text), 1, 12)),
    'reward:issue:' || g.id::text,
    'reward_grant', g.id::text, 'SYSTEM', null, p_request_id,
    'reward issue ' || g.kind::text,
    jsonb_build_object('grant_id', g.id, 'kind', g.kind, 'referral_id', g.referral_id),
    null);

  update public.reward_grants set
    status           = 'CREDITED',
    issued_minor     = g.face_minor,
    bonus_minor      = g.face_minor,
    issue_journal_id = v_j.id
  where id = g.id;

  insert into public.reward_allocations
    (grant_id, movement, amount_minor, journal_id, request_id)
  values (g.id, 'ISSUE', g.face_minor, v_j.id, p_request_id);

  perform public.reward_event_log(g.id, g.referral_id, 'ISSUED',
    'SYSTEM', null, v_j.id, p_request_id,
    jsonb_build_object('amount_minor', g.face_minor, 'currency', g.currency, 'kind', g.kind));

  perform public.emit_outbound('reward.issued', 'reward_grant', g.id,
    jsonb_build_object(
      'grant_id', g.id, 'user_id', g.user_id, 'kind', g.kind,
      'amount_minor', g.face_minor, 'currency', g.currency,
      'referral_id', g.referral_id, 'deposit_id', g.deposit_id,
      'task_claim_id', g.task_claim_id),
    'reward:issued:' || g.id::text, p_request_id);

  -- Debt offset: open receivables consume fresh reward value first.
  perform public.collect_receivables(g.user_id, g.currency, p_request_id);
  return 'CREDITED';
end;
$$;

-- ── reverse_reward_grant — clawback / receivable conversion ──────────────────
-- p_amount_minor null = reverse the full outstanding issued value.
-- Physical clawback order: BONUS then RELEASED (AVAILABLE). Any remainder —
-- value already reserved/consumed — becomes an OPEN receivable.

create or replace function public.reverse_reward_grant(
  p_grant_id     uuid,
  p_amount_minor bigint default null,
  p_reason       text default null,
  p_request_id   text default null,
  p_actor        text default 'SYSTEM'
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  g          public.reward_grants;
  v_target   bigint;
  v_b        bigint;
  v_r        bigint;
  v_debt     bigint;
  v_lines    jsonb := '[]'::jsonb;
  v_j        public.journal_entries;
  v_recv_id  uuid;
  v_total_dr bigint;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reversal reason is required';
  end if;
  perform set_config('app.reward_write', '1', true);
  select * into g from public.reward_grants where id = p_grant_id for update;
  if not found then
    raise exception 'reward grant % not found', p_grant_id;
  end if;
  if g.status in ('PENDING','QUALIFIED','BLOCKED') then
    -- never issued — cancel, no ledger effect
    update public.reward_grants set status = 'REVERSED',
           note = coalesce(note,'') || ' cancelled: ' || btrim(p_reason)
      where id = g.id;
    perform public.reward_event_log(g.id, g.referral_id, 'CANCELLED',
      p_actor, auth.uid(), null, p_request_id, jsonb_build_object('reason', p_reason));
    return;
  end if;
  if g.status = 'REVERSED' then
    return;  -- idempotent
  end if;

  v_target := coalesce(p_amount_minor, g.issued_minor - g.reversed_minor);
  if v_target <= 0 or v_target > g.issued_minor - g.reversed_minor then
    raise exception 'invalid reversal amount % (outstanding %)', v_target,
      g.issued_minor - g.reversed_minor;
  end if;

  v_b := least(v_target, g.bonus_minor);
  v_r := least(v_target - v_b, g.released_minor);
  v_debt := v_target - v_b - v_r;             -- was reserved/consumed → receivable

  if v_b > 0 then
    v_lines := v_lines || jsonb_build_object('account_key','user:' || g.user_id::text || ':bonus','direction','DEBIT','amount_minor',v_b);
  end if;
  if v_r > 0 then
    v_lines := v_lines || jsonb_build_object('account_key','user:' || g.user_id::text || ':available','direction','DEBIT','amount_minor',v_r);
  end if;
  if v_debt > 0 then
    v_lines := v_lines || jsonb_build_object('account_key','system:reward_receivable','direction','DEBIT','amount_minor',v_debt);
  end if;
  v_lines := v_lines || jsonb_build_object('account_key','system:reward_expense','direction','CREDIT','amount_minor',v_target);

  v_j := public.post_journal(
    'REWARD_REVERSAL', g.currency, v_lines,
    'RWR-RVS-' || g.id::text || '-' || v_target::text,
    'reward:reverse:' || g.id::text || ':' || g.reversed_minor::text,
    'reward_grant', g.id::text,
    case when p_actor = 'ADMIN' then 'ADMIN' else 'SYSTEM' end,
    auth.uid(), p_request_id,
    'reward reversal: ' || btrim(p_reason),
    jsonb_build_object('grant_id', g.id, 'reason', p_reason,
                       'clawed_bonus', v_b, 'clawed_released', v_r, 'receivable', v_debt),
    null);

  if v_debt > 0 then
    insert into public.reward_receivables
      (user_id, currency, amount_minor, outstanding_minor, source_grant_id,
       reversal_journal_id, request_id)
    values (g.user_id, g.currency, v_debt, v_debt, g.id, v_j.id, p_request_id)
    returning id into v_recv_id;
  end if;

  update public.reward_grants set
    bonus_minor    = bonus_minor - v_b,
    released_minor = released_minor - v_r,
    consumed_minor = consumed_minor - least(consumed_minor,
                       v_debt - least(v_debt, reserved_minor)),
    reserved_minor = reserved_minor - least(reserved_minor, v_debt),
    reversed_minor = reversed_minor + v_target,
    status = case
      when reversed_minor + v_target >= issued_minor then 'REVERSED'::public.reward_grant_status
      else 'PARTIALLY_REVERSED'::public.reward_grant_status end
  where id = g.id;

  -- allocation rows: physical clawbacks
  if v_b > 0 then
    insert into public.reward_allocations (grant_id, movement, bucket, amount_minor, journal_id, receivable_id, request_id)
    values (g.id, 'REVERSE', 'BONUS', v_b, v_j.id, v_recv_id, p_request_id);
  end if;
  if v_r > 0 then
    insert into public.reward_allocations (grant_id, movement, bucket, amount_minor, journal_id, receivable_id, request_id)
    values (g.id, 'REVERSE', 'RELEASED', v_r, v_j.id, v_recv_id, p_request_id);
  end if;
  if v_debt > 0 then
    insert into public.reward_allocations (grant_id, movement, amount_minor, journal_id, receivable_id, request_id, note)
    values (g.id, 'REVERSE', v_debt, v_j.id, v_recv_id, p_request_id, 'converted to receivable');
  end if;

  perform public.reward_event_log(g.id, g.referral_id, 'REVERSED',
    p_actor, auth.uid(), v_j.id, p_request_id,
    jsonb_build_object('reason', p_reason, 'amount', v_target,
      'clawed_bonus', v_b, 'clawed_released', v_r, 'receivable', v_debt,
      'receivable_id', v_recv_id));

  if v_debt > 0 then
    perform public.emit_outbound('reward.receivable_created', 'reward_grant', g.id,
      jsonb_build_object('grant_id', g.id, 'user_id', g.user_id,
        'receivable_id', v_recv_id, 'amount_minor', v_debt, 'currency', g.currency,
        'reason', p_reason),
      'reward:receivable:' || v_recv_id::text, p_request_id);
  end if;
  perform public.emit_outbound('reward.reversed', 'reward_grant', g.id,
    jsonb_build_object('grant_id', g.id, 'user_id', g.user_id, 'kind', g.kind,
      'amount_minor', v_target, 'currency', g.currency, 'reason', p_reason),
    'reward:reversed:' || g.id::text || ':' || v_j.id::text, p_request_id);
end;
$$;

-- ── evaluate_referral — the referral reward state machine ────────────────────
-- Called (safe-wrapped) when a referred user confirms a deposit or activates
-- an investment. Locks the referral row → serializes concurrent evaluations.
--
-- Deposit rewards: every CONFIRMED deposit at/above the per-currency
--   threshold earns the referrer 5% capped at the per-currency cap — one grant
--   per deposit (unique index = idempotency).
-- Sign-up reward: referral qualifies once a qualifying deposit AND an
--   activated investment both exist; the PENDING grant minted at signup time
--   is then issued in the qualifying deposit's currency.

create or replace function public.evaluate_referral(
  p_referred_id uuid,
  p_request_id  text default null
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  rf         public.referrals;
  dep        record;
  v_inv_id   uuid;
  v_thresh   numeric;
  v_amt      bigint;
  v_cap      numeric;
  v_bps      numeric;
  v_grant    uuid;
  v_st       public.reward_grant_status;
  v_face     numeric;
  v_dep_qual uuid;
  v_dep_cur  public.currency_code;
begin
  if not public.config_bool('referral.enabled') then
    return;
  end if;
  perform set_config('app.reward_write', '1', true);

  select * into rf from public.referrals
   where referred_id = p_referred_id
   for update;
  if not found or rf.status = 'DISQUALIFIED' then
    return;
  end if;

  -- ── deposit rewards: one per qualifying confirmed deposit ──
  v_bps := coalesce(public.config_number('referral.deposit_reward_bps'), 0);
  for dep in
    select d.id, d.currency, coalesce(d.confirmed_amount_minor, d.amount_minor) as amt
      from public.deposits d
     where d.user_id = p_referred_id and d.status = 'CONFIRMED'
     order by d.created_at, d.id
  loop
    v_thresh := public.config_number(
      'referral.qualifying_deposit_minor.' || dep.currency::text);
    if v_thresh is null or dep.amt < v_thresh then
      continue;
    end if;
    v_dep_qual := coalesce(v_dep_qual, dep.id);  -- first qualifying deposit
    if v_bps <= 0 then
      continue;
    end if;
    v_cap := public.config_number(
      'referral.deposit_reward_cap_minor.' || dep.currency::text);
    v_amt := floor(dep.amt * v_bps / 10000)::bigint;
    if v_cap is not null then
      v_amt := least(v_amt, v_cap::bigint);
    end if;
    if v_amt <= 0 then
      continue;
    end if;
    insert into public.reward_grants
      (user_id, kind, status, face_minor, currency, referral_id, deposit_id, request_id)
    values (rf.referrer_id, 'REFERRAL_DEPOSIT', 'PENDING', v_amt, dep.currency,
            rf.id, dep.id, p_request_id)
    on conflict (deposit_id) where kind = 'REFERRAL_DEPOSIT' do nothing
    returning id into v_grant;
    if v_grant is not null then
      v_st := public.issue_reward_grant(v_grant, p_request_id);
      perform public.reward_event_log(v_grant, rf.id, 'DEPOSIT_REWARD_EVALUATED',
        'SYSTEM', null, null, p_request_id,
        jsonb_build_object('deposit_id', dep.id, 'amount', v_amt, 'status', v_st));
    end if;
  end loop;

  -- ── qualification: qualifying deposit + activated investment ──
  if rf.status = 'JOINED' then
    if v_dep_qual is null then
      select d.id into v_dep_qual from public.deposits d
       where d.user_id = p_referred_id and d.status = 'CONFIRMED'
         and coalesce(d.confirmed_amount_minor, d.amount_minor)
             >= public.config_number(
                  'referral.qualifying_deposit_minor.' || d.currency::text)
       order by d.created_at limit 1;
    end if;
    if v_dep_qual is not null then
      update public.referrals set qualifying_deposit_id = v_dep_qual
        where id = rf.id;
    end if;
  end if;

  select i.id into v_inv_id from public.investments i
   where i.user_id = p_referred_id
     and i.status in ('ACTIVE','MATURITY_DUE','SETTLING','COMPLETED')
   order by i.created_at limit 1;
  if v_inv_id is not null and rf.qualifying_investment_id is null then
    update public.referrals set qualifying_investment_id = v_inv_id where id = rf.id;
  end if;

  select * into rf from public.referrals where id = rf.id;
  if rf.status = 'JOINED'
     and rf.qualifying_deposit_id is not null
     and (not public.config_bool('referral.signup_requires_investment')
          or rf.qualifying_investment_id is not null) then
    update public.referrals set status = 'QUALIFIED', qualified_at = now()
      where id = rf.id;
    insert into public.referral_events (referral_id, event_type, actor_kind, request_id, metadata)
    values (rf.id, 'QUALIFIED', 'SYSTEM', p_request_id,
            jsonb_build_object('deposit_id', rf.qualifying_deposit_id,
                               'investment_id', rf.qualifying_investment_id));

    -- Sign-up reward in the qualifying deposit's currency, priced from live
    -- config at qualification time.
    select d.currency,
           public.config_number('referral.signup_reward_minor.' || d.currency::text)
      into v_dep_cur, v_face
      from public.deposits d where d.id = rf.qualifying_deposit_id;

    -- ensure the PENDING grant exists (backfilled referrals may lack one)
    insert into public.reward_grants
      (user_id, kind, status, face_minor, currency, referral_id, request_id)
    values (rf.referrer_id, 'REFERRAL_SIGNUP', 'PENDING',
            coalesce(v_face, 0), v_dep_cur, rf.id, p_request_id)
    on conflict (referral_id) where kind = 'REFERRAL_SIGNUP' do nothing;

    -- refresh face/currency on still-pending grants to current config
    update public.reward_grants g set
      face_minor = coalesce(v_face, 0),
      currency   = v_dep_cur
     where g.referral_id = rf.id and g.kind = 'REFERRAL_SIGNUP'
       and g.status in ('PENDING','QUALIFIED','BLOCKED');

    select id into v_grant from public.reward_grants
      where referral_id = rf.id and kind = 'REFERRAL_SIGNUP';
    if v_grant is not null then
      v_st := public.issue_reward_grant(v_grant, p_request_id);
      if v_st = 'CREDITED' then
        update public.referrals set status = 'CREDITED', credited_at = now()
          where id = rf.id;
        insert into public.referral_events (referral_id, event_type, actor_kind, request_id)
        values (rf.id, 'CREDITED', 'SYSTEM', p_request_id);
        perform public.emit_outbound('referral.qualified', 'referral', rf.id,
          jsonb_build_object('referral_id', rf.id, 'referrer_id', rf.referrer_id,
            'referred_id', rf.referred_id,
            'qualifying_deposit_id', rf.qualifying_deposit_id,
            'qualifying_investment_id', rf.qualifying_investment_id),
          'referral:qualified:' || rf.id::text, p_request_id);
      end if;
    end if;
  end if;
end;
$$;

-- ── try_evaluate_referral — exception-safe wrapper for financial hooks ───────
-- A reward bug must never strand a deposit or investment. Failures land in
-- audit_log + a reward.eval_failed outbound event so ops can replay via
-- admin_reevaluate_referral / reconcile_rewards.

create or replace function public.try_evaluate_referral(
  p_referred_id uuid,
  p_request_id  text default null
)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.evaluate_referral(p_referred_id, p_request_id);
exception when others then
  insert into public.audit_log
    (actor_id, actor_role, action, entity_type, entity_id, result, request_id, metadata)
  values (null, 'SYSTEM', 'referral.eval_failed', 'profile', p_referred_id::text,
          'FAILED', p_request_id, jsonb_build_object('error', sqlerrm));
  begin
    perform public.emit_outbound('reward.eval_failed', 'profile', p_referred_id,
      jsonb_build_object('referred_id', p_referred_id, 'error', sqlerrm),
      'reward:eval_failed:' || p_referred_id::text || ':' ||
        substr(md5(coalesce(sqlerrm,'')), 1, 12), p_request_id);
  exception when others then null;
  end;
end;
$$;

-- ── revoke_deposit_rewards — deposit refund clawback ─────────────────────────
-- Reverses every deposit reward grant sourced by the deposit; if the deposit
-- was the referral's qualifying one and no other qualifying deposit remains,
-- reverts the referral to JOINED and reverses the sign-up reward too.
-- Exception-safe: failures surface via REVIEW_REQUIRED on the deposit.

create or replace function public.revoke_deposit_rewards(
  p_deposit_id uuid,
  p_request_id text default null
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  dep   public.deposits;
  rf    public.referrals;
  g     record;
  v_alt uuid;
begin
  perform set_config('app.reward_write', '1', true);
  select * into dep from public.deposits where id = p_deposit_id;
  if not found then
    return;
  end if;

  for g in
    select * from public.reward_grants
     where deposit_id = p_deposit_id and kind = 'REFERRAL_DEPOSIT'
       and status in ('PENDING','QUALIFIED','CREDITED','PARTIALLY_REVERSED','BLOCKED')
  loop
    perform public.reverse_reward_grant(g.id, null,
      'source deposit refunded', p_request_id);
  end loop;

  -- re-evaluate referral qualification basis
  select * into rf from public.referrals where referred_id = dep.user_id for update;
  if rf.id is not null and rf.qualifying_deposit_id = p_deposit_id then
    select d.id into v_alt from public.deposits d
      where d.user_id = dep.user_id and d.status = 'CONFIRMED'
        and d.id <> p_deposit_id
        and coalesce(d.confirmed_amount_minor, d.amount_minor)
            >= public.config_number(
                 'referral.qualifying_deposit_minor.' || d.currency::text)
      order by d.created_at limit 1;
    if v_alt is null then
      -- qualification basis destroyed → revert + reverse signup grant
      update public.referrals set
          status = 'JOINED', qualified_at = null, credited_at = null,
          qualifying_deposit_id = null
        where id = rf.id and status <> 'DISQUALIFIED';
      insert into public.referral_events (referral_id, event_type, actor_kind, request_id, metadata)
      values (rf.id, 'DEQUALIFIED', 'SYSTEM', p_request_id,
              jsonb_build_object('refunded_deposit_id', p_deposit_id));
      for g in
        select * from public.reward_grants
         where referral_id = rf.id and kind = 'REFERRAL_SIGNUP'
           and status in ('PENDING','QUALIFIED','CREDITED','PARTIALLY_REVERSED','BLOCKED')
      loop
        perform public.reverse_reward_grant(g.id, null,
          'qualifying deposit refunded', p_request_id);
      end loop;
    else
      update public.referrals set qualifying_deposit_id = v_alt where id = rf.id;
    end if;
  end if;
end;
$$;

-- ── transfer_bonus_to_available (authenticated) — reward release ────────────
-- Moves reward value from BONUS into AVAILABLE while preserving provenance
-- (grant counters bonus → released). Idempotent via request_id journal key.

create or replace function public.transfer_bonus_to_available(
  p_amount_minor bigint default null,
  p_currency     public.currency_code default 'NGN',
  p_request_id   text default null
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  g        record;
  v_avail  bigint;
  v_take   bigint;
  v_amount bigint;
  v_remaining bigint;
  v_j      public.journal_entries;
  v_status text;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  select account_status into v_status from public.profiles where id = v_uid;
  if v_status is distinct from 'ACTIVE' then
    raise exception 'account is not active';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('reward:' || v_uid::text, 0));

  -- idempotent replay: the journal key is the fence — if it exists, the
  -- counter moves already happened; return without re-drawing.
  if p_request_id is not null and exists (
    select 1 from public.journal_entries
     where idempotency_key = 'bonus:release:' || v_uid::text || ':' || p_request_id) then
    select id into v_j from public.journal_entries
     where idempotency_key = 'bonus:release:' || v_uid::text || ':' || p_request_id;
    return jsonb_build_object('released_minor',
      coalesce((select sum(amount_minor) from public.reward_allocations
        where journal_id = v_j.id and movement = 'RELEASE'), 0),
      'currency', p_currency, 'journal_id', v_j.id, 'replayed', true);
  end if;

  select coalesce(sum(bonus_minor), 0) into v_avail
    from public.reward_grants
   where user_id = v_uid and currency = p_currency and bonus_minor > 0;
  if p_amount_minor is null then
    v_amount := v_avail;
  else
    v_amount := p_amount_minor;
  end if;
  if v_amount <= 0 then
    raise exception 'ERR_AMOUNT: nothing to release';
  end if;
  if v_amount > v_avail then
    raise exception 'ERR_AMOUNT: release exceeds reward balance';
  end if;

  v_j := public.post_journal(
    'BONUS_RELEASE', p_currency,
    jsonb_build_array(
      jsonb_build_object('account_key','user:' || v_uid::text || ':bonus','direction','DEBIT','amount_minor',v_amount),
      jsonb_build_object('account_key','user:' || v_uid::text || ':available','direction','CREDIT','amount_minor',v_amount)),
    'BNS-REL-' || upper(substr(md5(v_uid::text || coalesce(p_request_id, gen_random_uuid()::text)), 1, 12)),
    'bonus:release:' || v_uid::text || ':' || coalesce(p_request_id, gen_random_uuid()::text),
    'wallet', v_uid::text, 'INVESTOR', v_uid, p_request_id,
    'reward release to available', '{}'::jsonb, null);

  perform set_config('app.reward_write', '1', true);
  v_remaining := v_amount;
  for g in
    select * from public.reward_grants
     where user_id = v_uid and currency = p_currency and bonus_minor > 0
     order by created_at, id
     for update
  loop
    exit when v_remaining <= 0;
    v_take := least(g.bonus_minor, v_remaining);
    update public.reward_grants
       set bonus_minor = bonus_minor - v_take,
           released_minor = released_minor + v_take
     where id = g.id;
    insert into public.reward_allocations
      (grant_id, movement, bucket, amount_minor, journal_id, request_id)
    values (g.id, 'RELEASE', 'BONUS', v_take, v_j.id, p_request_id);
    v_remaining := v_remaining - v_take;
  end loop;

  return jsonb_build_object('released_minor', v_amount, 'currency', p_currency,
                            'journal_id', v_j.id);
end;
$$;

-- ── Investor read RPCs ───────────────────────────────────────────────────────

create or replace function public.get_referral_summary()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_stats jsonb;
  v_cfg jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  select referral_code into v_code from public.profiles where id = v_uid;

  select jsonb_build_object(
      'joined',    count(*) filter (where status = 'JOINED'),
      'qualified', count(*) filter (where status in ('QUALIFIED','CREDITED')),
      'credited',  count(*) filter (where status = 'CREDITED'),
      'total',     count(*))
    into v_stats
    from public.referrals where referrer_id = v_uid;

  select jsonb_agg(jsonb_build_object(
      'currency', currency, 'issued_minor', issued, 'pending_minor', pending))
    into v_cfg
    from (
      select currency::text as currency,
             sum(face_minor)   filter (where status in ('PENDING','QUALIFIED','BLOCKED')) as pending,
             sum(issued_minor) filter (where status in ('CREDITED','PARTIALLY_REVERSED')) as issued
        from public.reward_grants
       where user_id = v_uid and kind::text like 'REFERRAL_%'
       group by currency) t;

  return jsonb_build_object(
    'code', v_code,
    'share_url', coalesce(public.config_text('referral.share_base_url'), '') || v_code,
    'stats', coalesce(v_stats, '{}'::jsonb),
    'rewards', coalesce(v_cfg, '[]'::jsonb),
    'policy', jsonb_build_object(
      'signup_reward_minor_ngn', public.config_number('referral.signup_reward_minor.NGN'),
      'qualifying_deposit_minor_ngn', public.config_number('referral.qualifying_deposit_minor.NGN'),
      'deposit_reward_bps', public.config_number('referral.deposit_reward_bps'),
      'deposit_reward_cap_minor_ngn', public.config_number('referral.deposit_reward_cap_minor.NGN'),
      'signup_requires_investment', public.config_bool('referral.signup_requires_investment')),
    'qualification_steps', jsonb_build_array(
      'Share your code — the invitee enters it at sign-up.',
      'They make a qualifying deposit of at least the configured minimum.',
      case when public.config_bool('referral.signup_requires_investment')
           then 'They activate an investment — your signup reward lands as bonus.'
           else 'Your signup reward lands as bonus once their deposit confirms.' end,
      'Every qualifying deposit also earns you the configured percentage, capped per deposit.'),
    'rules', jsonb_build_array(
      'Rewards are credited to your bonus balance — release them to available to invest or withdraw.',
      'Self-referrals and duplicate accounts do not qualify.',
      'Referral rewards can be reversed if a qualifying deposit is refunded or flagged.',
      'Reward values and thresholds are set by the live referral policy above.'));
end;
$$;

create or replace function public.list_my_referrals()
returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  return query
    select jsonb_build_object(
      'id', rf.id,
      'referred_user_id', rf.referred_id,
      'referred_display_name',
        '···' || right(coalesce(p.username, p.id::text), 4),
      'status', rf.status::text,
      'qualified_at', rf.qualified_at,
      'credited_at', rf.credited_at,
      'created_at', rf.created_at,
      'rewards', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', g.id, 'kind', g.kind, 'status', g.status,
                 'amount_minor', g.face_minor, 'issued_minor', g.issued_minor,
                 'currency', g.currency) order by g.created_at)
          from public.reward_grants g where g.referral_id = rf.id), '[]'::jsonb))
    from public.referrals rf
    left join public.profiles p on p.id = rf.referred_id
    where rf.referrer_id = v_uid
    order by rf.created_at desc;
end;
$$;

create or replace function public.list_my_rewards()
returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  return query
    select jsonb_build_object(
      'id', g.id, 'kind', g.kind::text, 'status', g.status::text,
      'currency', g.currency::text,
      'face_minor', g.face_minor, 'issued_minor', g.issued_minor,
      'bonus_minor', g.bonus_minor, 'released_minor', g.released_minor,
      'reserved_minor', g.reserved_minor, 'consumed_minor', g.consumed_minor,
      'reversed_minor', g.reversed_minor,
      'referral_id', g.referral_id, 'deposit_id', g.deposit_id,
      'task_claim_id', g.task_claim_id,
      'created_at', g.created_at,
      'movements', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'movement', a.movement, 'bucket', a.bucket,
                 'amount_minor', a.amount_minor, 'at', a.created_at)
                 order by a.id)
          from public.reward_allocations a where a.grant_id = g.id), '[]'::jsonb))
    from public.reward_grants g
    where g.user_id = v_uid
    order by g.created_at desc;
end;
$$;

-- ── Admin RPCs ───────────────────────────────────────────────────────────────

create or replace function public.admin_referral_overview()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_ops_reader() then
    raise exception 'not authorized';
  end if;
  return jsonb_build_object(
    'totals', (select jsonb_build_object(
      'joined', count(*) filter (where status='JOINED'),
      'qualified', count(*) filter (where status='QUALIFIED'),
      'credited', count(*) filter (where status='CREDITED'),
      'disqualified', count(*) filter (where status='DISQUALIFIED'),
      'blocked', count(*) filter (where status='BLOCKED'),
      'total', count(*)) from public.referrals),
    'rewards', (select jsonb_agg(jsonb_build_object(
      'currency', currency, 'kind', kind,
      'issued_minor', sum(issued_minor),
      'pending_minor', sum(face_minor) filter (where status in ('PENDING','QUALIFIED','BLOCKED')),
      'reversed_minor', sum(reversed_minor),
      'grants', count(*)) )
      from public.reward_grants group by currency, kind),
    'receivables_open', (select jsonb_agg(jsonb_build_object(
      'currency', currency, 'outstanding_minor', sum(outstanding_minor), 'count', count(*)))
      from public.reward_receivables where status='OPEN' group by currency),
    'policy', jsonb_build_object(
      'enabled', public.config_bool('referral.enabled'),
      'signup_reward_minor_ngn', public.config_number('referral.signup_reward_minor.NGN'),
      'qualifying_deposit_minor_ngn', public.config_number('referral.qualifying_deposit_minor.NGN'),
      'deposit_reward_bps', public.config_number('referral.deposit_reward_bps'),
      'deposit_reward_cap_minor_ngn', public.config_number('referral.deposit_reward_cap_minor.NGN')));
end;
$$;

create or replace function public.admin_list_referrals(
  p_status public.referral_status default null,
  p_limit  int default 50,
  p_offset int default 0
)
returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_ops_reader() then
    raise exception 'not authorized';
  end if;
  return query
    select jsonb_build_object(
      'id', rf.id, 'status', rf.status::text,
      'referrer_id', rf.referrer_id,
      'referrer_name', pr.display_name,
      'referred_id', rf.referred_id,
      'referred_name', pd.display_name,
      'code_snapshot', rf.code_snapshot,
      'qualifying_deposit_id', rf.qualifying_deposit_id,
      'qualifying_investment_id', rf.qualifying_investment_id,
      'qualified_at', rf.qualified_at, 'credited_at', rf.credited_at,
      'created_at', rf.created_at,
      'rewards', coalesce((
        select jsonb_agg(jsonb_build_object('id', g.id, 'kind', g.kind,
                 'status', g.status, 'amount_minor', g.face_minor,
                 'issued_minor', g.issued_minor, 'currency', g.currency)
                 order by g.created_at)
          from public.reward_grants g where g.referral_id = rf.id), '[]'::jsonb))
    from public.referrals rf
    join public.profiles pr on pr.id = rf.referrer_id
    join public.profiles pd on pd.id = rf.referred_id
    where (p_status is null or rf.status = p_status)
    order by rf.created_at desc
    limit p_limit offset p_offset;
end;
$$;

create or replace function public.admin_list_reward_grants(
  p_status public.reward_grant_status default null,
  p_kind   public.reward_kind default null,
  p_limit  int default 50,
  p_offset int default 0
)
returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_ops_reader() then
    raise exception 'not authorized';
  end if;
  return query
    select jsonb_build_object(
      'id', g.id, 'kind', g.kind::text, 'status', g.status::text,
      'user_id', g.user_id, 'user_display_name', p.display_name,
      'currency', g.currency::text,
      'face_minor', g.face_minor, 'issued_minor', g.issued_minor,
      'bonus_minor', g.bonus_minor, 'released_minor', g.released_minor,
      'reserved_minor', g.reserved_minor, 'consumed_minor', g.consumed_minor,
      'reversed_minor', g.reversed_minor,
      'referral_id', g.referral_id, 'deposit_id', g.deposit_id,
      'task_claim_id', g.task_claim_id, 'issue_journal_id', g.issue_journal_id,
      'created_at', g.created_at)
    from public.reward_grants g
    join public.profiles p on p.id = g.user_id
    where (p_status is null or g.status = p_status)
      and (p_kind is null or g.kind = p_kind)
    order by g.created_at desc
    limit p_limit offset p_offset;
end;
$$;

create or replace function public.admin_reverse_reward(
  p_grant_id uuid,
  p_reason   text,
  p_request_id text default null
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := public.current_admin_role()::text;
begin
  if not public.has_admin_role(array['FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    raise exception 'not authorized to reverse rewards';
  end if;
  perform public.reverse_reward_grant(p_grant_id, null, 'admin: ' || btrim(p_reason), p_request_id, 'ADMIN');
  insert into public.audit_log (actor_id, actor_role, action, entity_type, entity_id, result, request_id, metadata)
  values (auth.uid(), v_role, 'reward.reverse', 'reward_grant', p_grant_id::text,
          'SUCCESS', p_request_id, jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.admin_release_blocked_reward(
  p_grant_id uuid,
  p_request_id text default null
)
returns public.reward_grant_status
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := public.current_admin_role()::text;
  v_st   public.reward_grant_status;
begin
  if not public.has_admin_role(array['FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    raise exception 'not authorized to release rewards';
  end if;
  v_st := public.issue_reward_grant(p_grant_id, p_request_id, true);
  insert into public.audit_log (actor_id, actor_role, action, entity_type, entity_id, result, request_id, metadata)
  values (auth.uid(), v_role, 'reward.release_blocked', 'reward_grant', p_grant_id::text,
          'SUCCESS', p_request_id, jsonb_build_object('status', v_st));
  return v_st;
end;
$$;

create or replace function public.admin_reevaluate_referral(
  p_referral_id uuid,
  p_request_id text default null
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  rf public.referrals;
begin
  if not public.is_ops_reader() then
    raise exception 'not authorized';
  end if;
  select * into rf from public.referrals where id = p_referral_id;
  if not found then
    raise exception 'referral % not found', p_referral_id;
  end if;
  perform public.evaluate_referral(rf.referred_id, p_request_id);
end;
$$;

create or replace function public.admin_list_receivables(
  p_status public.receivable_status default 'OPEN',
  p_limit  int default 50,
  p_offset int default 0
)
returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_ops_reader() then
    raise exception 'not authorized';
  end if;
  return query
    select jsonb_build_object(
      'id', r.id, 'user_id', r.user_id,
      'user_display_name', p.display_name,
      'currency', r.currency::text,
      'amount_minor', r.amount_minor, 'outstanding_minor', r.outstanding_minor,
      'source_grant_id', r.source_grant_id, 'status', r.status::text,
      'created_at', r.created_at, 'settled_at', r.settled_at)
    from public.reward_receivables r
    join public.profiles p on p.id = r.user_id
    where (p_status is null or r.status = p_status)
    order by r.created_at desc
    limit p_limit offset p_offset;
end;
$$;

-- ── Hooks: deposit confirm / investment activation / deposit refund ─────────
-- evaluate_referral is invoked through try_evaluate_referral so a reward bug
-- can never strand money movement; failures are audited + replayable.

create or replace function public.confirm_deposit(
  p_deposit_id          uuid,
  p_verified_amount_minor bigint,
  p_verified_currency   public.currency_code,
  p_provider_txn_id     text,
  p_provider_status     text,
  p_provider_event_id   uuid default null,
  p_request_id          text default null
)
returns public.deposits
language plpgsql security definer set search_path = '' as $$
declare
  v   public.deposits;
  v_j public.journal_entries;
begin
  perform set_config('app.deposit_write', '1', true);
  select * into v from public.deposits where id = p_deposit_id for update;
  if not found then
    raise exception 'deposit % not found', p_deposit_id;
  end if;

  if v.status = 'CONFIRMED' and v.funding_journal_id is not null then
    return v;
  end if;

  if v.status in ('FAILED','EXPIRED','CANCELLED') then
    perform public.apply_deposit_transition(p_deposit_id, 'REVIEW_REQUIRED', 'PROVIDER',
      p_provider_event_id, p_request_id, 'late success after ' || v.status);
    update public.deposits set review_reason = 'LATE_SUCCESS_AFTER_' || v.status::text
      where id = p_deposit_id;
    select * into v from public.deposits where id = p_deposit_id;
    return v;
  end if;
  if v.status = 'REVIEW_REQUIRED' then
    return v;
  end if;
  if v.status = 'INITIATED' then
    perform public.apply_deposit_transition(p_deposit_id, 'REVIEW_REQUIRED', 'PROVIDER',
      p_provider_event_id, p_request_id, 'provider success arrived before init completed');
    update public.deposits set review_reason = 'SUCCESS_BEFORE_INIT'
      where id = p_deposit_id;
    select * into v from public.deposits where id = p_deposit_id;
    return v;
  end if;

  if p_verified_amount_minor is distinct from v.amount_minor then
    perform public.apply_deposit_transition(p_deposit_id, 'REVIEW_REQUIRED', 'PROVIDER',
      p_provider_event_id, p_request_id,
      format('amount mismatch: requested %s verified %s', v.amount_minor, p_verified_amount_minor));
    update public.deposits set review_reason = 'AMOUNT_MISMATCH' where id = p_deposit_id;
    select * into v from public.deposits where id = p_deposit_id;
    return v;
  end if;
  if p_verified_currency is distinct from v.currency then
    perform public.apply_deposit_transition(p_deposit_id, 'REVIEW_REQUIRED', 'PROVIDER',
      p_provider_event_id, p_request_id, 'currency mismatch');
    update public.deposits set review_reason = 'CURRENCY_MISMATCH' where id = p_deposit_id;
    select * into v from public.deposits where id = p_deposit_id;
    return v;
  end if;

  select * into v_j from public.post_journal(
    'FUNDING_CREDIT', v.currency,
    jsonb_build_array(
      jsonb_build_object('account_key','user:' || v.user_id::text || ':available','direction','CREDIT','amount_minor',v.amount_minor),
      jsonb_build_object('account_key','system:deposits_clearing','direction','DEBIT','amount_minor',v.amount_minor)),
    'DEP-CR-' || v.reference,
    'dep:fund:' || v.id::text,
    'deposit', v.id::text,
    'SYSTEM', null, coalesce(p_request_id, v.request_id),
    'deposit funding ' || v.reference,
    jsonb_build_object('deposit_id', v.id, 'provider', v.provider),
    null);

  update public.deposits set
    funding_journal_id     = v_j.id,
    confirmed_amount_minor = v.amount_minor,
    provider_txn_id        = coalesce(p_provider_txn_id, provider_txn_id),
    provider_status        = p_provider_status
  where id = p_deposit_id;

  perform public.apply_deposit_transition(p_deposit_id, 'CONFIRMED', 'PROVIDER',
    p_provider_event_id, p_request_id, 'provider verified + funded');

  -- Phase 9B: referral rewards (deposit reward + qualification progress).
  perform public.try_evaluate_referral(v.user_id, coalesce(p_request_id, v.request_id));

  select * into v from public.deposits where id = p_deposit_id;
  return v;
end;
$$;

create or replace function public.refund_deposit(
  p_deposit_id        uuid,
  p_reason            text,
  p_provider_event_id uuid default null,
  p_request_id        text default null
)
returns public.deposits
language plpgsql security definer set search_path = '' as $$
declare
  v   public.deposits;
  v_j public.journal_entries;
  v_src public.domain_event_source;
begin
  perform set_config('app.deposit_write', '1', true);
  select * into v from public.deposits where id = p_deposit_id for update;
  if not found then
    raise exception 'deposit % not found', p_deposit_id;
  end if;
  if v.status = 'REFUNDED' then
    return v;
  end if;
  if v.status <> 'CONFIRMED' or v.funding_journal_id is null then
    raise exception 'only a CONFIRMED funded deposit can be reversed';
  end if;

  v_src := case when auth.uid() is null then 'PROVIDER'::public.domain_event_source else 'ADMIN'::public.domain_event_source end;

  begin
    v_j := public.reverse_journal(v.funding_journal_id, coalesce(p_reason,'provider reversal'), p_request_id);
    update public.deposits set reversal_journal_id = v_j.id where id = p_deposit_id;
    perform public.apply_deposit_transition(p_deposit_id, 'REFUNDED', v_src,
      p_provider_event_id, p_request_id, p_reason);
    -- Phase 9B: claw back rewards sourced by this deposit. A failure here
    -- routes to REVIEW_REQUIRED via the same handler — never inconsistent.
    perform public.revoke_deposit_rewards(p_deposit_id, coalesce(p_request_id, 'refund'));
  exception when others then
    perform public.apply_deposit_transition(p_deposit_id, 'REVIEW_REQUIRED', v_src,
      p_provider_event_id, p_request_id, 'reversal failed: ' || sqlerrm);
    update public.deposits set review_reason = 'REVERSAL_FAILED: ' || sqlerrm
      where id = p_deposit_id;
  end;

  select * into v from public.deposits where id = p_deposit_id;
  return v;
end;
$$;

-- admin_resolve_deposit — same body as 0008 plus the Phase 9B reward hooks on
-- the CONFIRM/REFUND paths, so a manual resolution can never mint or skip
-- rewards differently from the provider path.
create or replace function public.admin_resolve_deposit(
  p_deposit_id uuid,
  p_resolution text,           -- CONFIRM | FAIL | CANCEL | REFUND
  p_reason     text,
  p_request_id text default null
)
returns public.deposits
language plpgsql security definer set search_path = '' as $$
declare
  v     public.deposits;
  v_j   public.journal_entries;
  v_role text;
begin
  v_role := public.current_admin_role()::text;
  if not public.has_admin_role(array['FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    raise exception 'not authorized to resolve deposits';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'resolution reason is required';
  end if;

  perform set_config('app.deposit_write', '1', true);
  select * into v from public.deposits where id = p_deposit_id for update;
  if not found then
    raise exception 'deposit % not found', p_deposit_id;
  end if;
  if v.status <> 'REVIEW_REQUIRED' then
    raise exception 'only REVIEW_REQUIRED deposits can be resolved (now %)', v.status;
  end if;

  case p_resolution
    when 'CONFIRM' then
      v_j := public.post_journal(
        'FUNDING_CREDIT', v.currency,
        jsonb_build_array(
          jsonb_build_object('account_key','user:' || v.user_id::text || ':available','direction','CREDIT','amount_minor',v.amount_minor),
          jsonb_build_object('account_key','system:deposits_clearing','direction','DEBIT','amount_minor',v.amount_minor)),
        'DEP-CR-' || v.reference, 'dep:fund:' || v.id::text,
        'deposit', v.id::text, 'ADMIN', auth.uid(), coalesce(p_request_id, v.request_id),
        'deposit funding (manual resolution)', jsonb_build_object('deposit_id', v.id), null);
      update public.deposits set
        funding_journal_id = v_j.id,
        confirmed_amount_minor = v.amount_minor,
        review_reason = null
      where id = p_deposit_id;
      perform public.apply_deposit_transition(p_deposit_id, 'CONFIRMED', 'ADMIN', null, p_request_id, p_reason);
      -- Phase 9B: referral evaluation — identical to the provider confirm path
      perform public.try_evaluate_referral(v.user_id, coalesce(p_request_id, v.request_id));
    when 'FAIL' then
      perform public.apply_deposit_transition(p_deposit_id, 'FAILED', 'ADMIN', null, p_request_id, p_reason);
    when 'CANCEL' then
      perform public.apply_deposit_transition(p_deposit_id, 'CANCELLED', 'ADMIN', null, p_request_id, p_reason);
    when 'REFUND' then
      if v.funding_journal_id is null then
        raise exception 'no funding journal to reverse';
      end if;
      v_j := public.reverse_journal(v.funding_journal_id, 'manual refund: ' || btrim(p_reason), p_request_id);
      update public.deposits set reversal_journal_id = v_j.id, review_reason = null
        where id = p_deposit_id;
      perform public.apply_deposit_transition(p_deposit_id, 'REFUNDED', 'ADMIN', null, p_request_id, p_reason);
      -- Phase 9B: claw back rewards sourced by this deposit. Failure aborts the
      -- whole resolution (deposit stays REVIEW_REQUIRED for retry) — never
      -- refunds the wallet while leaving reward provenance dangling.
      perform public.revoke_deposit_rewards(p_deposit_id, coalesce(p_request_id, 'admin-refund'));
    else
      raise exception 'unknown resolution %', p_resolution;
  end case;

  insert into public.audit_log (actor_id, actor_role, action, entity_type, entity_id, result, request_id, metadata)
  values (auth.uid(), v_role, 'deposit.resolve_' || lower(p_resolution), 'deposit', p_deposit_id::text,
          'SUCCESS', p_request_id, jsonb_build_object('reason', p_reason));

  select * into v from public.deposits where id = p_deposit_id;
  return v;
end;
$$;

-- ── Pending sign-up grant on every new referral ──────────────────────────────
-- A pending reward record must exist the moment the relationship does;
-- face/currency are re-priced from live config at qualification time.

create or replace function public.trg_referral_pending_grant()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.reward_write', '1', true);
  insert into public.reward_grants
    (user_id, kind, status, face_minor, currency, referral_id)
  values (new.referrer_id, 'REFERRAL_SIGNUP', 'PENDING',
          coalesce(public.config_number('referral.signup_reward_minor.NGN'), 0),
          null, new.id)
  on conflict (referral_id) where kind = 'REFERRAL_SIGNUP' do nothing;
  return new;
end;
$$;

create trigger referral_pending_grant
  after insert on public.referrals
  for each row execute function public.trg_referral_pending_grant();

-- ── Privileges ───────────────────────────────────────────────────────────────

-- investor-facing
revoke execute on function public.transfer_bonus_to_available(bigint, public.currency_code, text)
  from public, anon;
grant  execute on function public.transfer_bonus_to_available(bigint, public.currency_code, text)
  to authenticated;
revoke execute on function public.get_referral_summary()  from public, anon;
grant  execute on function public.get_referral_summary()  to authenticated;
revoke execute on function public.list_my_referrals()     from public, anon;
grant  execute on function public.list_my_referrals()     to authenticated;
revoke execute on function public.list_my_rewards()       from public, anon;
grant  execute on function public.list_my_rewards()       to authenticated;

-- admin-facing (role checks are enforced inside each function)
grant execute on function public.admin_referral_overview() to authenticated;
grant execute on function public.admin_list_referrals(public.referral_status, int, int) to authenticated;
grant execute on function public.admin_list_reward_grants(public.reward_grant_status, public.reward_kind, int, int) to authenticated;
grant execute on function public.admin_reverse_reward(uuid, text, text) to authenticated;
grant execute on function public.admin_release_blocked_reward(uuid, text) to authenticated;
grant execute on function public.admin_reevaluate_referral(uuid, text) to authenticated;
grant execute on function public.admin_list_receivables(public.receivable_status, int, int) to authenticated;

-- engine internals: service only — clients may never drive the reward machine
revoke all on function public.emit_outbound(text, text, uuid, jsonb, text, text)
  from public, anon, authenticated;
grant  execute on function public.emit_outbound(text, text, uuid, jsonb, text, text)
  to service_role;
revoke all on function public.reward_event_log(uuid, uuid, text, text, uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant  execute on function public.reward_event_log(uuid, uuid, text, text, uuid, uuid, text, jsonb)
  to service_role;
revoke all on function public.collect_receivables(uuid, public.currency_code, text)
  from public, anon, authenticated;
grant  execute on function public.collect_receivables(uuid, public.currency_code, text)
  to service_role;
revoke all on function public.issue_reward_grant(uuid, text, boolean)
  from public, anon, authenticated;
grant  execute on function public.issue_reward_grant(uuid, text, boolean) to service_role;
revoke all on function public.reverse_reward_grant(uuid, bigint, text, text, text)
  from public, anon, authenticated;
grant  execute on function public.reverse_reward_grant(uuid, bigint, text, text, text)
  to service_role;
revoke all on function public.evaluate_referral(uuid, text) from public, anon, authenticated;
grant  execute on function public.evaluate_referral(uuid, text) to service_role;
revoke all on function public.try_evaluate_referral(uuid, text) from public, anon, authenticated;
grant  execute on function public.try_evaluate_referral(uuid, text) to service_role;
revoke all on function public.revoke_deposit_rewards(uuid, text) from public, anon, authenticated;
grant  execute on function public.revoke_deposit_rewards(uuid, text) to service_role;
revoke all on function public.trg_referral_pending_grant() from public, anon, authenticated;
