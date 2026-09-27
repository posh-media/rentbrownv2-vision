-- 0021 — PIN verification stamp: close the rollback bypass (Phase 8B audit).
--
-- verify_transaction_pin returns false on mismatch so a STANDALONE call commits
-- the failed-attempt increment. But when request_withdrawal nested that call
-- and then raised, the whole transaction rolled back — including the counter —
-- so unlimited PIN guesses through the withdrawal path never engaged lockout
-- (verified: 3 wrong-PIN requests left failed_attempts = 0 hosted).
--
-- Fix: verification is a separate committed RPC that mints a short-lived
-- verified_until stamp; request_withdrawal requires a fresh stamp and never
-- verifies a raw PIN inside its own transaction. Every guess therefore goes
-- through the committing verify RPC and counts.

alter table public.user_pins
  add column if not exists verified_until timestamptz;

comment on column public.user_pins.verified_until is
  'Short-lived step-up stamp minted by a committed verify_transaction_pin
   success. Withdrawals require verified_until > now() — the raw PIN is never
   verified inside a transaction that can roll back the attempt counter.';

insert into public.admin_config (key, category, value_type, value, currency, description, is_active)
values ('security.pin.verify_window_seconds', 'security', 'INTEGER', '120', null,
        'Seconds a successful PIN verification authorizes follow-on gated actions.', true)
on conflict (key) do nothing;

-- ── verify_transaction_pin — stamp verified_until on success ────────────────

create or replace function public.verify_transaction_pin(
  p_pin        text,
  p_request_id text default null
)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v        public.user_pins;
  v_max    int;
  v_lock   int;
  v_window int;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  if p_pin is null or p_pin !~ '^\d{6}$' then
    raise exception 'ERR_PIN: PIN must be exactly 6 digits';
  end if;

  perform set_config('app.pin_write', '1', true);
  select * into v from public.user_pins where user_id = v_uid for update;
  if not found then
    raise exception 'ERR_PIN_NOT_SET: set a transaction PIN before withdrawing';
  end if;
  if v.locked_until is not null and v.locked_until > now() then
    raise exception 'ERR_PIN_LOCKED: too many failed attempts — try again later';
  end if;

  if v.pin_hash = extensions.crypt(p_pin, v.pin_hash) then
    v_window := coalesce(public.config_number('security.pin.verify_window_seconds')::int, 120);
    update public.user_pins
       set failed_attempts = 0, locked_until = null,
           verified_until = now() + make_interval(secs => v_window)
     where user_id = v_uid;
    return true;
  end if;

  v_max  := coalesce(public.config_number('security.pin.max_attempts')::int, 5);
  v_lock := coalesce(public.config_number('security.pin.lockout_minutes')::int, 15);
  update public.user_pins set
    failed_attempts = failed_attempts + 1,
    locked_until = case
      when failed_attempts + 1 >= v_max then now() + make_interval(mins => v_lock)
      else locked_until end
  where user_id = v_uid
  returning failed_attempts, locked_until into v.failed_attempts, v.locked_until;

  if v.locked_until is not null then
    insert into public.audit_log (actor_id, actor_role, action, entity_type, entity_id, result, request_id, metadata)
    values (v_uid, 'INVESTOR', 'security.pin_locked', 'user', v_uid::text, 'FAILED', p_request_id,
            jsonb_build_object('attempts', v.failed_attempts));
  end if;
  return false;
end;
$$;

-- ── set_transaction_pin — a new PIN invalidates any prior verify stamp ──────

create or replace function public.set_transaction_pin(
  p_pin        text,
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
  if p_pin is null or p_pin !~ '^\d{6}$' then
    raise exception 'ERR_PIN: PIN must be exactly 6 digits';
  end if;
  perform set_config('app.pin_write', '1', true);
  insert into public.user_pins (user_id, pin_hash)
  values (v_uid, extensions.crypt(p_pin, extensions.gen_salt('bf')))
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash,
        failed_attempts = 0,
        locked_until = null,
        verified_until = null,
        pin_set_at = now();
  insert into public.audit_log (actor_id, actor_role, action, entity_type, entity_id, result, request_id, metadata)
  values (v_uid, 'INVESTOR', 'security.pin_set', 'user', v_uid::text, 'SUCCESS', p_request_id, '{}'::jsonb);
end;
$$;

-- ── request_withdrawal — drop raw-PIN verification; require the stamp ──────
-- The signature loses p_pin: verify_transaction_pin (its own committed RPC)
-- is the only path that touches PINs, so a failed guess always persists its
-- counter increment — the withdrawal path can no longer roll it back.

drop function public.request_withdrawal(bigint, jsonb, text, text, text, uuid);

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

  -- ── Transaction PIN gate (D-8.7) — verified_until stamp, not a raw PIN ──
  -- A PIN verified in a committed verify_transaction_pin call mints a
  -- short-lived stamp. Verifying here would be unsafe: this transaction's
  -- raise would roll back the failed-attempt increment (brute-force bypass).
  if not exists (select 1 from public.user_pins
                  where user_id = v_uid
                    and verified_until is not null
                    and verified_until > now()) then
    raise exception 'ERR_PIN_VERIFY: verify your transaction PIN first';
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

-- ── Privileges ──────────────────────────────────────────────────────────────

revoke execute on function public.request_withdrawal(bigint, jsonb, text, text, uuid) from public, anon;
grant  execute on function public.request_withdrawal(bigint, jsonb, text, text, uuid) to authenticated;

revoke execute on function public.verify_transaction_pin(text, text) from public, anon;
grant  execute on function public.verify_transaction_pin(text, text) to authenticated;
revoke execute on function public.set_transaction_pin(text, text) from public, anon;
grant  execute on function public.set_transaction_pin(text, text) to authenticated;
