-- RentBrown V2 — Phase 8B part 2: withdrawal gates.
-- Adds the KYC gate (+ first-withdrawal exception), transaction-PIN gate,
-- dynamic minimum, server-side quote, and saved bank accounts on top of the
-- Phase 5B withdrawal engine. request_withdrawal/decide_withdrawal are
-- amended in place — the HOLD/EXTERNAL_PAYOUT/HOLD_RELEASE journal flow,
-- idempotency keys, and outbox envelope are unchanged.

-- ── user_bank_accounts ─────────────────────────────────────────────────────

create table public.user_bank_accounts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete restrict,
  bank_name      text not null,
  bank_code      text not null,
  account_number text not null check (account_number ~ '^\d{6,20}$'),
  account_name   text not null,
  is_default     boolean not null default false,
  request_id     text,
  created_at     timestamptz not null default now(),
  archived_at    timestamptz
);

comment on table public.user_bank_accounts is
  'Saved withdrawal beneficiaries. The per-withdrawal snapshot lives in
   withdrawals.destination — editing/archiving here never rewrites history.';

create index uba_user_idx on public.user_bank_accounts (user_id) where archived_at is null;

create or replace function public.assert_bank_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'bank accounts cannot be deleted — archive instead';
  end if;
  if current_setting('app.bank_write', true) is distinct from '1' then
    raise exception 'bank accounts may only be mutated inside account functions';
  end if;
  return new;
end;
$$;

create trigger user_bank_accounts_guard
  before insert or update or delete on public.user_bank_accounts
  for each row execute function public.assert_bank_write();

create or replace function public.save_bank_account(
  p_bank_name      text,
  p_bank_code      text,
  p_account_number text,
  p_account_name   text,
  p_make_default   boolean default false,
  p_request_id     text default null
)
returns public.user_bank_accounts
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v     public.user_bank_accounts;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  if btrim(coalesce(p_bank_name,'')) = '' or btrim(coalesce(p_bank_code,'')) = ''
     or btrim(coalesce(p_account_name,'')) = '' then
    raise exception 'ERR_DESTINATION: bank_name, bank_code and account_name are required';
  end if;
  if p_account_number is null or p_account_number !~ '^\d{6,20}$' then
    raise exception 'ERR_DESTINATION: account_number must be 6-20 digits';
  end if;

  perform set_config('app.bank_write', '1', true);

  if p_make_default then
    update public.user_bank_accounts set is_default = false
     where user_id = v_uid and is_default;
  end if;

  insert into public.user_bank_accounts
    (user_id, bank_name, bank_code, account_number, account_name, is_default, request_id)
  values (v_uid, btrim(p_bank_name), btrim(p_bank_code), p_account_number,
          btrim(p_account_name), p_make_default, p_request_id)
  returning * into v;

  insert into public.audit_log (actor_id, actor_role, action, entity_type, entity_id, result, request_id, metadata)
  values (v_uid, 'INVESTOR', 'bank_account.saved', 'bank_account', v.id::text, 'SUCCESS', p_request_id,
          jsonb_build_object('bank_code', v.bank_code, 'account_masked', '***' || right(v.account_number, 4)));

  return v;
end;
$$;

create or replace function public.archive_bank_account(
  p_id         uuid,
  p_request_id text default null
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  perform set_config('app.bank_write', '1', true);
  update public.user_bank_accounts set archived_at = now(), is_default = false
   where id = p_id and user_id = v_uid and archived_at is null;
  if not found then
    raise exception 'bank account not found';
  end if;
end;
$$;

create or replace function public.set_default_bank_account(
  p_id         uuid,
  p_request_id text default null
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  perform set_config('app.bank_write', '1', true);
  update public.user_bank_accounts set is_default = false where user_id = v_uid;
  update public.user_bank_accounts set is_default = true
   where id = p_id and user_id = v_uid and archived_at is null;
  if not found then
    raise exception 'bank account not found';
  end if;
end;
$$;

alter table public.user_bank_accounts enable row level security;
create policy uba_owner_read on public.user_bank_accounts
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.user_bank_accounts from authenticated, anon;
grant select on public.user_bank_accounts to authenticated;
grant all    on public.user_bank_accounts to service_role;

-- ── min_withdrawal_minor — approved DYNAMIC rule with FIXED fallback ────────

create or replace function public.min_withdrawal_minor(p_currency public.currency_code)
returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare
  v_mode text;
  v      bigint;
begin
  v_mode := upper(coalesce(public.config_text('withdrawal.min_mode'), 'DYNAMIC'));
  if v_mode = 'DYNAMIC' then
    -- maturity value of one slot in the cheapest published plan
    select min(floor(p.slot_price_minor * (10000 + p.roi_bps) / 10000))::bigint
      into v
      from public.investment_plans p
     where p.status = 'PUBLISHED' and p.currency = p_currency;
    if v is not null then
      return v;
    end if;
  end if;
  return public.config_number('withdrawal.min_minor.' || p_currency::text)::bigint;
end;
$$;

-- ── quote_withdrawal (authenticated) — server-authoritative quote ──────────

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
  v_min        bigint;
  v_bps        numeric;
  v_cap        numeric;
  v_fee        bigint;
  v_net        bigint;
  v_verified   boolean;
  v_first      boolean;
  v_threshold  numeric;
  v_kyc_req    boolean;
  v_exempt     boolean;
  v_pin_set    boolean;
  v_blocked    text;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select account_status into v_status from public.profiles where id = v_uid;
  select coalesce(available_minor, 0) into v_available
    from public.wallets where user_id = v_uid and currency = v_currency;
  v_available := coalesce(v_available, 0);

  v_min := public.min_withdrawal_minor(v_currency);
  v_bps := public.config_number('withdrawal.fee_bps');
  v_cap := public.config_number('withdrawal.fee_cap_minor.' || v_currency::text);

  v_verified := exists (
    select 1 from public.kyc_submissions
     where user_id = v_uid and status = 'VERIFIED');
  v_first := not exists (
    select 1 from public.withdrawals where user_id = v_uid);
  v_kyc_req := coalesce(public.config_bool('kyc.required_for_withdrawal'), true);
  v_threshold := public.config_number('withdrawal.first_without_kyc_max_minor.' || v_currency::text);
  v_exempt := v_first and v_threshold is not null
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
    when p_amount_minor > v_available then 'Insufficient available balance.'
    when not v_pin_set then 'Set a transaction PIN before withdrawing.'
    when v_kyc_req and not v_verified and not v_exempt then 'Identity verification is required to withdraw.'
    else null end;

  return jsonb_build_object(
    'currency', v_currency::text,
    'amount_minor', p_amount_minor,
    'available_minor', v_available,
    'min_minor', v_min,
    'fee_minor', v_fee,
    'net_minor', v_net,
    'fee_bps', v_bps,
    'fee_cap_minor', v_cap,
    'kyc_verified', v_verified,
    'kyc_required', v_kyc_req and not v_verified and not v_exempt,
    'first_withdrawal', v_first,
    'first_without_kyc_max_minor', v_threshold,
    'kyc_exempt', v_exempt,
    'pin_set', v_pin_set,
    'eligible', v_blocked is null,
    'blocked_reason', v_blocked);
end;
$$;

-- ── request_withdrawal — amended: KYC gate + PIN + dynamic min + bank acct ──
-- The 4-arg signature is replaced (not overloaded) so no path bypasses gates;
-- existing callers still bind because the new parameters carry defaults.

drop function public.request_withdrawal(bigint, jsonb, text, text);

create or replace function public.request_withdrawal(
  p_amount_minor    bigint,
  p_destination     jsonb,
  p_idempotency_key text,
  p_request_id      text default null,
  p_pin             text default null,
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
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  select account_status into v_status from public.profiles where id = v_uid;
  if v_status is distinct from 'ACTIVE' then
    raise exception 'account is not active';
  end if;

  -- Serialize per-user: the first-ever-withdrawal determination and the
  -- balance check must be atomic against concurrent requests from the same
  -- account (D-8.12). Other users are unaffected.
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
  -- replay never re-verifies PIN or re-checks KYC.
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

  -- ── KYC gate + first-withdrawal exception (D-8.12) ───────────────────────
  -- "First-ever" = no prior withdrawals row of ANY status. The advisory lock
  -- above guarantees two concurrent requests cannot both observe first=true.
  v_kyc_req := coalesce(public.config_bool('kyc.required_for_withdrawal'), true);
  if v_kyc_req then
    v_verified := exists (
      select 1 from public.kyc_submissions
       where user_id = v_uid and status = 'VERIFIED');
    if not v_verified then
      v_first := not exists (
        select 1 from public.withdrawals where user_id = v_uid);
      v_threshold := public.config_number('withdrawal.first_without_kyc_max_minor.' || v_currency::text);
      if not (v_first and v_threshold is not null and p_amount_minor < v_threshold) then
        raise exception 'ERR_KYC: identity verification is required before withdrawal';
      end if;
    end if;
  end if;

  -- ── Transaction PIN gate ───────────────────────────────────────────────
  -- verify returns false on mismatch; raising here rolls back this request
  -- only — the canonical attempt counter lives in the standalone verify call.
  if not public.verify_transaction_pin(p_pin, p_request_id) then
    raise exception 'ERR_PIN: incorrect PIN';
  end if;

  -- Fee snapshot from live config (never duplicated).
  v_bps := public.config_number('withdrawal.fee_bps');
  v_cap := public.config_number('withdrawal.fee_cap_minor.' || v_currency::text);
  v_fee := floor(p_amount_minor * coalesce(v_bps, 0) / 10000);
  if v_cap is not null then
    v_fee := least(v_fee, v_cap);
  end if;
  v_net := p_amount_minor - v_fee;

  perform set_config('app.withdrawal_write', '1', true);

  -- Reserve first: insufficient available → CHECK violation rolls back all.
  begin
    v_j := public.post_journal(
      'HOLD', v_currency,
      jsonb_build_array(
        jsonb_build_object('account_key','user:' || v_uid::text || ':available','direction','DEBIT','amount_minor',p_amount_minor),
        jsonb_build_object('account_key','user:' || v_uid::text || ':reserved','direction','CREDIT','amount_minor',p_amount_minor)),
      'WD-HOLD-' || v_wid::text, 'wd:hold:' || v_wid::text,
      'withdrawal', v_wid::text, 'INVESTOR', v_uid, p_request_id,
      'withdrawal hold', jsonb_build_object('withdrawal_id', v_wid), null);
  exception when others then
    raise exception 'insufficient available balance';
  end;

  insert into public.withdrawals
    (id, reference, idempotency_key, user_id, currency, amount_minor,
     fee_minor, net_minor, destination, request_id, hold_journal_id)
  values (
    v_wid,
    'WD-' || upper(substr(md5(v_wid::text), 1, 12)),
    'wd:init:' || v_uid::text || ':' || p_idempotency_key,
    v_uid, v_currency, p_amount_minor, v_fee, v_net,
    p_destination, p_request_id, v_j.id)
  on conflict (idempotency_key) do nothing
  returning * into v_w;

  if v_w.id is null then
    -- retry of an already-created withdrawal: release our duplicate hold and
    -- return the original row (unchanged Phase 5B behaviour).
    perform public.post_journal(
      'HOLD_RELEASE', v_currency,
      jsonb_build_array(
        jsonb_build_object('account_key','user:' || v_uid::text || ':reserved','direction','DEBIT','amount_minor',p_amount_minor),
        jsonb_build_object('account_key','user:' || v_uid::text || ':available','direction','CREDIT','amount_minor',p_amount_minor)),
      'WD-REL-' || v_wid::text, 'wd:rel:' || v_wid::text,
      'withdrawal', v_wid::text, 'INVESTOR', v_uid, p_request_id,
      'withdrawal retry — releasing duplicate hold', jsonb_build_object('withdrawal_id', v_wid), null);
    select * into v_w from public.withdrawals
      where idempotency_key = 'wd:init:' || v_uid::text || ':' || p_idempotency_key;
    return v_w;
  end if;

  insert into public.withdrawal_events
    (withdrawal_id, from_status, to_status, source, request_id, note)
  values (v_wid, null, 'REQUESTED', 'USER', p_request_id, 'withdrawal requested');

  -- Durable outbound notification — same transaction as the financial fact.
  perform set_config('app.outbound_write', '1', true);
  insert into public.outbound_events
    (event_type, aggregate_type, aggregate_id, payload, idempotency_key, request_id)
  values (
    'withdrawal.requested', 'withdrawal', v_wid,
    jsonb_build_object(
      'spec', 'rentbrown.outbound.v1',
      'event_id', gen_random_uuid(),
      'event_type', 'withdrawal.requested',
      'idempotency_key', 'wd:' || v_wid::text || ':requested',
      'occurred_at', now(),
      'request_id', p_request_id,
      'data', jsonb_build_object(
        'withdrawal_id', v_wid,
        'reference', v_w.reference,
        'status', 'REQUESTED',
        'user', jsonb_build_object('id', v_uid,
          'display_name', (select display_name from public.profiles where id = v_uid)),
        'amount_minor', p_amount_minor,
        'fee_minor', v_fee,
        'net_minor', v_net,
        'currency', v_currency::text,
        'destination', p_destination,
        'requested_at', now())),
    'wd:' || v_wid::text || ':requested', p_request_id);

  return v_w;
end;
$$;

-- ── decide_withdrawal — amended: outcome outbox events (D-8.9) ─────────────
-- Identical financial behaviour; MARK_PAID/REJECT now also write the durable
-- withdrawal.completed / withdrawal.rejected events transactionally.

create or replace function public.decide_withdrawal(
  p_withdrawal_id uuid,
  p_decision      text,          -- REVIEW | APPROVE | REJECT | PROCESSING | MARK_PAID | FAIL
  p_reason        text default null,
  p_request_id    text default null
)
returns public.withdrawals
language plpgsql security definer set search_path = '' as $$
declare
  v_w   public.withdrawals;
  v_j   public.journal_entries;
  v_role text;
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
      v_j := public.post_journal(
        'HOLD_RELEASE', v_w.currency,
        jsonb_build_array(
          jsonb_build_object('account_key','user:' || v_w.user_id::text || ':reserved','direction','DEBIT','amount_minor',v_w.amount_minor),
          jsonb_build_object('account_key','user:' || v_w.user_id::text || ':available','direction','CREDIT','amount_minor',v_w.amount_minor)),
        'WD-REL-' || v_w.reference, 'wd:rel:' || v_w.id::text,
        'withdrawal', v_w.id::text, 'ADMIN', auth.uid(), p_request_id,
        'withdrawal rejected — hold released', jsonb_build_object('withdrawal_id', v_w.id), null);
      update public.withdrawals set release_journal_id = v_j.id, reviewed_by = auth.uid()
        where id = p_withdrawal_id;
      perform public.apply_withdrawal_transition(p_withdrawal_id, 'REJECTED', 'ADMIN', p_request_id, p_reason);
      perform set_config('app.outbound_write', '1', true);
      insert into public.outbound_events
        (event_type, aggregate_type, aggregate_id, payload, idempotency_key, request_id)
      values (
        'withdrawal.rejected', 'withdrawal', p_withdrawal_id,
        jsonb_build_object(
          'spec', 'rentbrown.outbound.v1',
          'event_id', gen_random_uuid(),
          'event_type', 'withdrawal.rejected',
          'idempotency_key', 'wd:' || p_withdrawal_id::text || ':rejected',
          'occurred_at', now(),
          'request_id', p_request_id,
          'data', jsonb_build_object(
            'withdrawal_id', p_withdrawal_id,
            'reference', v_w.reference,
            'status', 'REJECTED',
            'reason', p_reason,
            'user', jsonb_build_object('id', v_w.user_id,
              'display_name', (select display_name from public.profiles where id = v_w.user_id)),
            'amount_minor', v_w.amount_minor,
            'currency', v_w.currency::text)),
        'wd:' || p_withdrawal_id::text || ':rejected', p_request_id);
    when 'PROCESSING' then
      perform public.apply_withdrawal_transition(p_withdrawal_id, 'PROCESSING', 'ADMIN', p_request_id, p_reason);
    when 'MARK_PAID' then
      -- Admin asserts external payment was actually made. Money leaves:
      -- DR user RESERVED (gross) / CR payouts_clearing (net) + fee_revenue (fee).
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
      update public.withdrawals set payout_journal_id = v_j.id, reviewed_by = auth.uid()
        where id = p_withdrawal_id;
      perform public.apply_withdrawal_transition(p_withdrawal_id, 'COMPLETED', 'ADMIN', p_request_id, p_reason);
      perform set_config('app.outbound_write', '1', true);
      insert into public.outbound_events
        (event_type, aggregate_type, aggregate_id, payload, idempotency_key, request_id)
      values (
        'withdrawal.completed', 'withdrawal', p_withdrawal_id,
        jsonb_build_object(
          'spec', 'rentbrown.outbound.v1',
          'event_id', gen_random_uuid(),
          'event_type', 'withdrawal.completed',
          'idempotency_key', 'wd:' || p_withdrawal_id::text || ':completed',
          'occurred_at', now(),
          'request_id', p_request_id,
          'data', jsonb_build_object(
            'withdrawal_id', p_withdrawal_id,
            'reference', v_w.reference,
            'status', 'COMPLETED',
            'user', jsonb_build_object('id', v_w.user_id,
              'display_name', (select display_name from public.profiles where id = v_w.user_id)),
            'amount_minor', v_w.amount_minor,
            'fee_minor', v_w.fee_minor,
            'net_minor', v_w.net_minor,
            'currency', v_w.currency::text)),
        'wd:' || p_withdrawal_id::text || ':completed', p_request_id);
    when 'FAIL' then
      -- operational failure pre-payment: release the hold back to available
      v_j := public.post_journal(
        'HOLD_RELEASE', v_w.currency,
        jsonb_build_array(
          jsonb_build_object('account_key','user:' || v_w.user_id::text || ':reserved','direction','DEBIT','amount_minor',v_w.amount_minor),
          jsonb_build_object('account_key','user:' || v_w.user_id::text || ':available','direction','CREDIT','amount_minor',v_w.amount_minor)),
        'WD-REL-' || v_w.reference, 'wd:rel:' || v_w.id::text,
        'withdrawal', v_w.id::text, 'ADMIN', auth.uid(), p_request_id,
        'withdrawal failed — hold released', jsonb_build_object('withdrawal_id', v_w.id), null);
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

-- ── Privileges ─────────────────────────────────────────────────────────────

revoke execute on function public.request_withdrawal(bigint, jsonb, text, text, text, uuid) from public, anon;
grant  execute on function public.request_withdrawal(bigint, jsonb, text, text, text, uuid) to authenticated;

revoke execute on function public.quote_withdrawal(bigint, uuid) from public, anon;
grant  execute on function public.quote_withdrawal(bigint, uuid) to authenticated;

revoke execute on function public.min_withdrawal_minor(public.currency_code) from public, anon;
grant  execute on function public.min_withdrawal_minor(public.currency_code) to authenticated;

revoke execute on function public.save_bank_account(text, text, text, text, boolean, text) from public, anon;
grant  execute on function public.save_bank_account(text, text, text, text, boolean, text) to authenticated;
revoke execute on function public.archive_bank_account(uuid, text) from public, anon;
grant  execute on function public.archive_bank_account(uuid, text) to authenticated;
revoke execute on function public.set_default_bank_account(uuid, text) from public, anon;
grant  execute on function public.set_default_bank_account(uuid, text) to authenticated;
