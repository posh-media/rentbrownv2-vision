-- RentBrown V2 — Phase 5B payments schema
-- Deposits (Paystack/KoraPay), manual withdrawals + durable outbound outbox.
-- Built on docs/phases/PHASE_5A_DEPOSIT_PAYMENT_ARCHITECTURE.md.
--
-- Money moves only through post_journal() (0005). Every table here is
-- guarded: mutations happen inside definer functions that set a
-- transaction-local flag (same pattern as wallets/app.ledger_posting).
--
--   deposits                 — deposit lifecycle + provider linkage
--   deposit_events           — append-only transition log
--   payment_provider_events  — inbound webhook intake (minimized payload)
--   withdrawals              — manual withdrawal lifecycle
--   withdrawal_events        — append-only transition log
--   outbound_events          — durable webhook outbox (Make delivery)

-- ── Enums ──────────────────────────────────────────────────────────────────

create type public.payment_provider as enum ('PAYSTACK', 'KORAPAY');

create type public.deposit_status as enum (
  'INITIATED', 'PENDING', 'CONFIRMED', 'FAILED',
  'EXPIRED', 'CANCELLED', 'REVIEW_REQUIRED', 'REFUNDED'
);

create type public.provider_event_status as enum (
  'RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED', 'REVIEW'
);

create type public.domain_event_source as enum ('SYSTEM', 'PROVIDER', 'ADMIN', 'USER');

create type public.withdrawal_status as enum (
  'REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING',
  'COMPLETED', 'REJECTED', 'FAILED'
);

create type public.outbound_status as enum ('QUEUED', 'DELIVERED', 'FAILED', 'DEAD');

-- ── deposits ────────────────────────────────────────────────────────────────

create table public.deposits (
  id                     uuid primary key default gen_random_uuid(),
  reference              text not null unique,
  idempotency_key        text not null unique,
  user_id                uuid not null references public.profiles (id) on delete restrict,
  currency               public.currency_code not null,
  amount_minor           bigint not null check (amount_minor > 0),
  confirmed_amount_minor bigint check (confirmed_amount_minor is null or confirmed_amount_minor > 0),
  provider               public.payment_provider not null,
  provider_reference     text,
  provider_txn_id        text,
  provider_status        text,
  status                 public.deposit_status not null default 'INITIATED',
  review_reason          text,
  init_channel           text,
  pending_journal_id     uuid references public.journal_entries (id) on delete restrict,
  funding_journal_id     uuid unique references public.journal_entries (id) on delete restrict,
  reversal_journal_id    uuid references public.journal_entries (id) on delete restrict,
  request_id             text,
  expires_at             timestamptz,
  initiated_at           timestamptz not null default now(),
  confirmed_at           timestamptz,
  failed_at              timestamptz,
  cancelled_at           timestamptz,
  refunded_at            timestamptz,
  metadata               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.deposits is
  'Deposit lifecycle. Client never supplies reference/currency/user; provider
   merchant reference = deposits.reference. Credit only via confirm_deposit
   → post_journal(FUNDING_CREDIT).';

create unique index deposits_provider_ref_uq
  on public.deposits (provider, provider_reference)
  where provider_reference is not null;
create index deposits_user_idx on public.deposits (user_id, created_at desc);
create index deposits_status_idx on public.deposits (status) where status in ('PENDING','REVIEW_REQUIRED');
create index deposits_expiry_idx on public.deposits (expires_at) where status = 'PENDING';

create trigger deposits_updated_at
  before update on public.deposits
  for each row execute function public.touch_updated_at();

-- ── deposit_events (append-only transition log) ────────────────────────────

create table public.deposit_events (
  id                bigint generated always as identity primary key,
  deposit_id        uuid not null references public.deposits (id) on delete restrict,
  from_status       public.deposit_status,
  to_status         public.deposit_status not null,
  source            public.domain_event_source not null,
  provider_event_id uuid,
  request_id        text,
  note              text,
  created_at        timestamptz not null default now()
);

create index deposit_events_deposit_idx on public.deposit_events (deposit_id, id);

-- ── payment_provider_events (webhook intake) ───────────────────────────────

create table public.payment_provider_events (
  id                uuid primary key default gen_random_uuid(),
  provider          public.payment_provider not null,
  provider_event_id text,
  event_type        text not null,
  signature_valid   boolean not null,
  idempotency_key   text not null unique,
  deposit_id        uuid references public.deposits (id) on delete restrict,
  payload_hash      text,
  payload           jsonb not null default '{}'::jsonb,
  status            public.provider_event_status not null default 'RECEIVED',
  attempts          int not null default 0,
  last_error        text,
  processed_at      timestamptz,
  received_at       timestamptz not null default now(),
  request_id        text
);

comment on table public.payment_provider_events is
  'Inbound provider webhook intake. Payload is MINIMIZED (refs/amount/status/
   fee) — never card data, auth objects, signatures or secrets. payload_hash
   is sha256 of the raw body for tamper evidence.';
create index ppe_deposit_idx on public.payment_provider_events (deposit_id);
create index ppe_status_idx on public.payment_provider_events (status) where status in ('FAILED','REVIEW','RECEIVED');

-- ── withdrawals ─────────────────────────────────────────────────────────────

create table public.withdrawals (
  id                 uuid primary key default gen_random_uuid(),
  reference          text not null unique,
  idempotency_key    text not null unique,
  user_id            uuid not null references public.profiles (id) on delete restrict,
  currency           public.currency_code not null,
  amount_minor       bigint not null check (amount_minor > 0),
  fee_minor          bigint not null check (fee_minor >= 0),
  net_minor          bigint not null check (net_minor >= 0),
  destination        jsonb not null,
  status             public.withdrawal_status not null default 'REQUESTED',
  hold_journal_id    uuid references public.journal_entries (id) on delete restrict,
  payout_journal_id  uuid references public.journal_entries (id) on delete restrict,
  release_journal_id uuid references public.journal_entries (id) on delete restrict,
  reviewed_by        uuid references auth.users (id),
  request_id         text,
  requested_at       timestamptz not null default now(),
  reviewed_at        timestamptz,
  paid_at            timestamptz,
  rejected_at        timestamptz,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint withdrawals_amount_split check (net_minor + fee_minor = amount_minor)
);

comment on table public.withdrawals is
  'Manual withdrawals. Funds are held (AVAILABLE→RESERVED) at request; admin
   pays externally then MARK_PAID posts EXTERNAL_PAYOUT. Rejection releases
   the hold. No payout provider exists.';

create index withdrawals_user_idx on public.withdrawals (user_id, created_at desc);
create index withdrawals_status_idx on public.withdrawals (status)
  where status in ('REQUESTED','UNDER_REVIEW','APPROVED','PROCESSING');

create trigger withdrawals_updated_at
  before update on public.withdrawals
  for each row execute function public.touch_updated_at();

-- ── withdrawal_events (append-only) ────────────────────────────────────────

create table public.withdrawal_events (
  id            bigint generated always as identity primary key,
  withdrawal_id uuid not null references public.withdrawals (id) on delete restrict,
  from_status   public.withdrawal_status,
  to_status     public.withdrawal_status not null,
  source        public.domain_event_source not null,
  request_id    text,
  note          text,
  created_at    timestamptz not null default now()
);

create index withdrawal_events_wd_idx on public.withdrawal_events (withdrawal_id, id);

-- ── outbound_events (durable webhook outbox) ───────────────────────────────

create table public.outbound_events (
  id                 uuid primary key default gen_random_uuid(),
  event_type         text not null,
  aggregate_type     text not null,
  aggregate_id       uuid not null,
  payload            jsonb not null,
  idempotency_key    text not null unique,
  status             public.outbound_status not null default 'QUEUED',
  attempts           int not null default 0,
  next_attempt_at    timestamptz not null default now(),
  last_response_code int,
  last_error         text,
  created_at         timestamptz not null default now(),
  delivered_at       timestamptz,
  request_id         text
);

comment on table public.outbound_events is
  'Durable outbound webhook outbox. Written in the same transaction as the
   domain fact; a worker delivers + retries independently. External webhook
   availability never affects financial state.';
create index outbound_due_idx on public.outbound_events (next_attempt_at)
  where status in ('QUEUED','FAILED');

-- ── Write guards ────────────────────────────────────────────────────────────
-- Same pattern as wallets: tables may only be written while the matching
-- transaction-local flag is set inside a definer function.

create or replace function public.assert_deposit_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'deposits cannot be deleted';
  end if;
  if current_setting('app.deposit_write', true) is distinct from '1' then
    raise exception 'deposits may only be mutated inside payment functions';
  end if;
  return new;
end;
$$;

create trigger deposits_guard
  before insert or update or delete on public.deposits
  for each row execute function public.assert_deposit_write();

create trigger deposit_events_immutable
  before update or delete on public.deposit_events
  for each row execute function public.assert_immutable();

create or replace function public.assert_ppe_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'provider events cannot be deleted';
  end if;
  if current_setting('app.ppe_write', true) is distinct from '1' then
    raise exception 'provider events may only be mutated inside payment functions';
  end if;
  return new;
end;
$$;

create trigger ppe_guard
  before insert or update or delete on public.payment_provider_events
  for each row execute function public.assert_ppe_write();

create or replace function public.assert_withdrawal_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'withdrawals cannot be deleted';
  end if;
  if current_setting('app.withdrawal_write', true) is distinct from '1' then
    raise exception 'withdrawals may only be mutated inside payment functions';
  end if;
  return new;
end;
$$;

create trigger withdrawals_guard
  before insert or update or delete on public.withdrawals
  for each row execute function public.assert_withdrawal_write();

create trigger withdrawal_events_immutable
  before update or delete on public.withdrawal_events
  for each row execute function public.assert_immutable();

create or replace function public.assert_outbound_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'outbound events cannot be deleted';
  end if;
  if current_setting('app.outbound_write', true) is distinct from '1' then
    raise exception 'outbound events may only be mutated inside delivery functions';
  end if;
  return new;
end;
$$;

create trigger outbound_guard
  before insert or update or delete on public.outbound_events
  for each row execute function public.assert_outbound_write();

-- ── Config helpers ──────────────────────────────────────────────────────────

create or replace function public.config_number(p_key text)
returns numeric
language sql stable security definer set search_path = '' as $$
  select (value #>> '{}')::numeric
    from public.admin_config
   where key = p_key and is_active
$$;

create or replace function public.config_bool(p_key text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select (value #>> '{}')::boolean
       from public.admin_config
      where key = p_key and is_active),
    false)
$$;

create or replace function public.config_text(p_key text)
returns text
language sql stable security definer set search_path = '' as $$
  select value #>> '{}'
    from public.admin_config
   where key = p_key and is_active
$$;

-- ── apply_deposit_transition ────────────────────────────────────────────────
-- The only status-mutation path for deposits. Locks the row, validates the
-- transition map, stamps the timestamp, writes the append-only event.

create or replace function public.apply_deposit_transition(
  p_deposit_id       uuid,
  p_to               public.deposit_status,
  p_source           public.domain_event_source,
  p_provider_event_id uuid default null,
  p_request_id       text default null,
  p_note             text default null
)
returns public.deposit_status
language plpgsql security definer set search_path = '' as $$
declare
  v public.deposits;
  ok boolean;
begin
  perform set_config('app.deposit_write', '1', true);
  select * into v from public.deposits where id = p_deposit_id for update;
  if not found then
    raise exception 'deposit % not found', p_deposit_id;
  end if;
  if v.status = p_to then
    return v.status;  -- idempotent no-op
  end if;

  ok := case v.status
    when 'INITIATED'       then p_to in ('PENDING','FAILED','CANCELLED','REVIEW_REQUIRED')
    when 'PENDING'         then p_to in ('CONFIRMED','FAILED','EXPIRED','CANCELLED','REVIEW_REQUIRED')
    when 'CONFIRMED'       then p_to in ('REFUNDED','REVIEW_REQUIRED')
    when 'REVIEW_REQUIRED' then p_to in ('CONFIRMED','FAILED','CANCELLED','REFUNDED')
    -- late provider events may re-open terminal deposits into review only
    when 'FAILED'          then p_to = 'REVIEW_REQUIRED'
    when 'EXPIRED'         then p_to = 'REVIEW_REQUIRED'
    when 'CANCELLED'       then p_to = 'REVIEW_REQUIRED'
    else false
  end;

  if not ok then
    raise exception 'invalid deposit transition: % → %', v.status, p_to;
  end if;

  update public.deposits set
    status       = p_to,
    confirmed_at = case when p_to = 'CONFIRMED'  then now() else confirmed_at end,
    failed_at    = case when p_to = 'FAILED'     then now() else failed_at end,
    cancelled_at = case when p_to = 'CANCELLED'  then now() else cancelled_at end,
    refunded_at  = case when p_to = 'REFUNDED'   then now() else refunded_at end
  where id = p_deposit_id;

  insert into public.deposit_events
    (deposit_id, from_status, to_status, source, provider_event_id, request_id, note)
  values
    (p_deposit_id, v.status, p_to, p_source, p_provider_event_id, p_request_id, p_note);

  return p_to;
end;
$$;

-- ── apply_withdrawal_transition ─────────────────────────────────────────────

create or replace function public.apply_withdrawal_transition(
  p_withdrawal_id uuid,
  p_to            public.withdrawal_status,
  p_source        public.domain_event_source,
  p_request_id    text default null,
  p_note          text default null
)
returns public.withdrawal_status
language plpgsql security definer set search_path = '' as $$
declare
  v public.withdrawals;
  ok boolean;
begin
  perform set_config('app.withdrawal_write', '1', true);
  select * into v from public.withdrawals where id = p_withdrawal_id for update;
  if not found then
    raise exception 'withdrawal % not found', p_withdrawal_id;
  end if;
  if v.status = p_to then
    return v.status;
  end if;

  ok := case v.status
    when 'REQUESTED'    then p_to in ('UNDER_REVIEW','APPROVED','REJECTED','FAILED')
    when 'UNDER_REVIEW' then p_to in ('APPROVED','REJECTED','FAILED')
    when 'APPROVED'     then p_to in ('PROCESSING','REJECTED','FAILED')
    when 'PROCESSING'   then p_to in ('COMPLETED','FAILED')
    else false
  end;

  if not ok then
    raise exception 'invalid withdrawal transition: % → %', v.status, p_to;
  end if;

  update public.withdrawals set
    status      = p_to,
    reviewed_at = case when p_to in ('UNDER_REVIEW','APPROVED','REJECTED') then now() else reviewed_at end,
    paid_at     = case when p_to = 'COMPLETED' then now() else paid_at end,
    rejected_at = case when p_to = 'REJECTED'  then now() else rejected_at end
  where id = p_withdrawal_id;

  insert into public.withdrawal_events
    (withdrawal_id, from_status, to_status, source, request_id, note)
  values
    (p_withdrawal_id, v.status, p_to, p_source, p_request_id, p_note);

  return p_to;
end;
$$;

-- ── request_deposit (authenticated) ─────────────────────────────────────────
-- Creates the INITIATED deposit. Provider API call happens afterwards in the
-- initialize-deposit Edge Function → complete_deposit_init.

create or replace function public.request_deposit(
  p_amount_minor    bigint,
  p_provider        public.payment_provider,
  p_idempotency_key text,
  p_request_id      text default null
)
returns public.deposits
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid;
  v_min   numeric;
  v_max   numeric;
  v_exp   numeric;
  v_dep   public.deposits;
  v_status text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  select account_status into v_status from public.profiles where id = v_uid;
  if v_status is distinct from 'ACTIVE' then
    raise exception 'account is not active';
  end if;

  -- Launch rule (D-5.8): Paystack/KoraPay → NGN only. A future provider adds
  -- its own currency branch here — the seam, not a redesign.
  if p_provider not in ('PAYSTACK','KORAPAY') then
    raise exception 'ERR_CURRENCY: provider % does not support deposits yet', p_provider;
  end if;
  if not public.config_bool('payment.provider.' || lower(p_provider::text) || '.enabled') then
    raise exception 'provider % is not available', p_provider;
  end if;

  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'ERR_AMOUNT: amount must be a positive integer minor-unit value';
  end if;
  v_min := public.config_number('deposit.min_minor.NGN');
  if v_min is not null and p_amount_minor < v_min then
    raise exception 'ERR_AMOUNT: minimum deposit is % minor units', v_min;
  end if;
  -- Optional cap: enforced only when configured active (no invented default).
  v_max := public.config_number('payment.deposit.max_minor');
  if v_max is not null and p_amount_minor > v_max then
    raise exception 'ERR_AMOUNT: maximum deposit is % minor units', v_max;
  end if;

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency_key is required';
  end if;

  perform set_config('app.deposit_write', '1', true);

  -- Optional expiry window — set only when configured.
  v_exp := public.config_number('payment.deposit.expiry_minutes');

  insert into public.deposits
    (reference, idempotency_key, user_id, currency, amount_minor, provider,
     request_id, expires_at, initiated_at)
  values (
    'DEP-' || upper(substr(md5(gen_random_uuid()::text), 1, 12)),
    'dep:init:' || v_uid::text || ':' || p_idempotency_key,
    v_uid, 'NGN', p_amount_minor, p_provider, p_request_id,
    case when v_exp is not null then now() + (v_exp || ' minutes')::interval end,
    now())
  on conflict (idempotency_key) do nothing
  returning * into v_dep;

  if v_dep.id is null then
    select * into v_dep from public.deposits
      where idempotency_key = 'dep:init:' || v_uid::text || ':' || p_idempotency_key;
    return v_dep;  -- client retry converges to the same deposit
  end if;

  insert into public.deposit_events
    (deposit_id, from_status, to_status, source, request_id, note)
  values (v_dep.id, null, 'INITIATED', 'USER', p_request_id, 'deposit requested');

  return v_dep;
end;
$$;

-- ── complete_deposit_init / fail_deposit_init (service) ─────────────────────
-- Called by the initialize-deposit Edge Function after the provider responds.

create or replace function public.complete_deposit_init(
  p_deposit_id        uuid,
  p_provider_reference text,
  p_provider_txn_id   text default null,
  p_checkout_url      text default null,
  p_request_id        text default null
)
returns public.deposits
language plpgsql security definer set search_path = '' as $$
declare
  v public.deposits;
begin
  perform set_config('app.deposit_write', '1', true);
  select * into v from public.deposits where id = p_deposit_id for update;
  if not found then
    raise exception 'deposit % not found', p_deposit_id;
  end if;
  if v.status <> 'INITIATED' then
    return v;  -- already advanced (replay-safe)
  end if;

  update public.deposits set
    provider_reference = coalesce(p_provider_reference, provider_reference),
    provider_txn_id    = coalesce(p_provider_txn_id, provider_txn_id),
    metadata           = metadata || case when p_checkout_url is not null
                           then jsonb_build_object('checkout_url', p_checkout_url)
                           else '{}'::jsonb end
  where id = p_deposit_id;

  perform public.apply_deposit_transition(p_deposit_id, 'PENDING', 'SYSTEM', null, p_request_id, 'provider initialized');
  select * into v from public.deposits where id = p_deposit_id;
  return v;
end;
$$;

create or replace function public.fail_deposit_init(
  p_deposit_id uuid,
  p_reason     text,
  p_request_id text default null
)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.apply_deposit_transition(p_deposit_id, 'FAILED', 'SYSTEM', null, p_request_id, p_reason);
end;
$$;

-- ── cancel_deposit (authenticated, own pending deposit) ─────────────────────

create or replace function public.cancel_deposit(p_deposit_id uuid, p_request_id text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v     public.deposits;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  select * into v from public.deposits where id = p_deposit_id for update;
  if not found or v.user_id <> v_uid then
    raise exception 'deposit not found';
  end if;
  perform public.apply_deposit_transition(p_deposit_id, 'CANCELLED', 'USER', null, p_request_id, 'cancelled by user');
end;
$$;

-- ── ingest_provider_event / mark_provider_event (service) ───────────────────
-- Webhook intake. Idempotent on (provider + deterministic key); a replay
-- returns the existing event row.

create or replace function public.ingest_provider_event(
  p_provider         public.payment_provider,
  p_event_type       text,
  p_provider_event_id text,
  p_signature_valid  boolean,
  p_idempotency_key  text,
  p_deposit_id       uuid default null,
  p_payload_hash     text default null,
  p_payload          jsonb default '{}'::jsonb,
  p_request_id       text default null
)
returns public.payment_provider_events
language plpgsql security definer set search_path = '' as $$
declare
  v public.payment_provider_events;
begin
  perform set_config('app.ppe_write', '1', true);
  insert into public.payment_provider_events
    (provider, event_type, provider_event_id, signature_valid, idempotency_key,
     deposit_id, payload_hash, payload, status, request_id)
  values
    (p_provider, p_event_type, p_provider_event_id, p_signature_valid,
     p_provider || ':' || p_idempotency_key, p_deposit_id, p_payload_hash, p_payload,
     case when p_signature_valid then 'RECEIVED'::public.provider_event_status else 'REVIEW'::public.provider_event_status end,
     p_request_id)
  on conflict (idempotency_key) do nothing
  returning * into v;

  if v.id is null then
    select * into v from public.payment_provider_events
      where idempotency_key = p_provider || ':' || p_idempotency_key;
  end if;
  return v;
end;
$$;

create or replace function public.mark_provider_event(
  p_event_id   uuid,
  p_status     public.provider_event_status,
  p_deposit_id uuid default null,
  p_error      text default null
)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.ppe_write', '1', true);
  update public.payment_provider_events set
    status       = p_status,
    deposit_id   = coalesce(p_deposit_id, deposit_id),
    attempts     = attempts + 1,
    last_error   = p_error,
    processed_at = case when p_status in ('PROCESSED','IGNORED','REVIEW') then now() else processed_at end
  where id = p_event_id;
end;
$$;

-- ── confirm_deposit (service) — the ONLY credit path ────────────────────────
-- Called by the webhook function AFTER provider API verification. Re-validates
-- amount/currency inside the DB before posting FUNDING_CREDIT.

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

  -- Idempotent: already credited.
  if v.status = 'CONFIRMED' and v.funding_journal_id is not null then
    return v;
  end if;

  -- Late success on a terminal/review deposit → review, never auto-credit.
  if v.status in ('FAILED','EXPIRED','CANCELLED') then
    perform public.apply_deposit_transition(p_deposit_id, 'REVIEW_REQUIRED', 'PROVIDER',
      p_provider_event_id, p_request_id, 'late success after ' || v.status);
    update public.deposits set review_reason = 'LATE_SUCCESS_AFTER_' || v.status::text
      where id = p_deposit_id;
    select * into v from public.deposits where id = p_deposit_id;
    return v;
  end if;
  if v.status = 'REVIEW_REQUIRED' then
    return v;  -- human resolution required; no auto-credit
  end if;
  if v.status = 'INITIATED' then
    perform public.apply_deposit_transition(p_deposit_id, 'REVIEW_REQUIRED', 'PROVIDER',
      p_provider_event_id, p_request_id, 'provider success arrived before init completed');
    update public.deposits set review_reason = 'SUCCESS_BEFORE_INIT'
      where id = p_deposit_id;
    select * into v from public.deposits where id = p_deposit_id;
    return v;
  end if;

  -- PENDING → authoritative match checks.
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

  -- Verified: post the funding journal (idempotent key → retry converges).
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

  select * into v from public.deposits where id = p_deposit_id;
  return v;
end;
$$;

-- ── refund_deposit (service/admin) — provider reversal of confirmed deposit ─

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
  exception when others then
    -- insufficient cover / reversal failure → review, never negative balance
    perform public.apply_deposit_transition(p_deposit_id, 'REVIEW_REQUIRED', v_src,
      p_provider_event_id, p_request_id, 'reversal failed: ' || sqlerrm);
    update public.deposits set review_reason = 'REVERSAL_FAILED: ' || sqlerrm
      where id = p_deposit_id;
  end;

  select * into v from public.deposits where id = p_deposit_id;
  return v;
end;
$$;

-- ── request_withdrawal (authenticated) — HOLD + record + outbox, atomically ──

create or replace function public.request_withdrawal(
  p_amount_minor    bigint,
  p_destination     jsonb,
  p_idempotency_key text,
  p_request_id      text default null
)
returns public.withdrawals
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid;
  v_min  numeric;
  v_bps  numeric;
  v_cap  numeric;
  v_fee  bigint;
  v_net  bigint;
  v_wid  uuid := gen_random_uuid();
  v_j    public.journal_entries;
  v_w    public.withdrawals;
  v_status text;
  v_currency public.currency_code := 'NGN';
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  select account_status into v_status from public.profiles where id = v_uid;
  if v_status is distinct from 'ACTIVE' then
    raise exception 'account is not active';
  end if;

  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'ERR_AMOUNT: amount must be a positive integer minor-unit value';
  end if;
  v_min := public.config_number('withdrawal.min_minor.' || v_currency::text);
  if v_min is not null and p_amount_minor < v_min then
    raise exception 'ERR_AMOUNT: minimum withdrawal is % minor units', v_min;
  end if;
  if p_destination is null
     or btrim(coalesce(p_destination ->> 'bank_name','')) = ''
     or btrim(coalesce(p_destination ->> 'account_number','')) = ''
     or btrim(coalesce(p_destination ->> 'account_name','')) = '' then
    raise exception 'ERR_DESTINATION: bank_name, account_number and account_name are required';
  end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency_key is required';
  end if;

  -- Idempotent retry: converge before posting any journal.
  select * into v_w from public.withdrawals
    where idempotency_key = 'wd:init:' || v_uid::text || ':' || p_idempotency_key;
  if v_w.id is not null then
    return v_w;
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
    -- retry of an already-created withdrawal: the hold was never posted in
    -- this txn (idempotency key belongs to the existing row's own uuid) —
    -- but OUR hold above posted under this txn's v_wid... which belongs to
    -- no withdrawal → release it and return the original.
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

-- ── decide_withdrawal (finance.review_withdrawals) ──────────────────────────

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
    when 'PROCESSING' then
      perform public.apply_withdrawal_transition(p_withdrawal_id, 'PROCESSING', 'ADMIN', p_request_id, p_reason);
    when 'MARK_PAID' then
      -- Admin asserts external payment was actually made. Money leaves:
      -- DR user RESERVED (gross) / CR payouts_clearing (net) + fee_revenue (fee).
      -- Fee line included only when > 0 (ledger forbids zero-amount lines).
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

-- ── admin_resolve_deposit (finance.reconcile) ───────────────────────────────

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
      -- admin asserts provider verification; credit the REQUESTED amount
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
    when 'FAIL' then
      perform public.apply_deposit_transition(p_deposit_id, 'FAILED', 'ADMIN', null, p_request_id, p_reason);
    when 'CANCEL' then
      perform public.apply_deposit_transition(p_deposit_id, 'CANCELLED', 'ADMIN', null, p_request_id, p_reason);
    when 'REFUND' then
      -- provider-side refund already happened; mirror it in the ledger
      if v.funding_journal_id is null then
        raise exception 'no funding journal to reverse';
      end if;
      v_j := public.reverse_journal(v.funding_journal_id, 'manual refund: ' || btrim(p_reason), p_request_id);
      update public.deposits set reversal_journal_id = v_j.id, review_reason = null
        where id = p_deposit_id;
      perform public.apply_deposit_transition(p_deposit_id, 'REFUNDED', 'ADMIN', null, p_request_id, p_reason);
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

-- ── expire_due_deposits (service sweep) ─────────────────────────────────────
-- Runs only when payment.deposit.expiry_minutes is configured; otherwise a
-- no-op — no invented expiry policy.

create or replace function public.expire_due_deposits()
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_exp numeric;
  v_d   record;
  v_n   int := 0;
begin
  v_exp := public.config_number('payment.deposit.expiry_minutes');
  if v_exp is null then
    return 0;  -- expiry disabled
  end if;
  for v_d in select id from public.deposits
              where status = 'PENDING' and expires_at is not null and expires_at < now() loop
    perform public.apply_deposit_transition(v_d.id, 'EXPIRED', 'SYSTEM', null, null, 'payment window expired');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- ── Outbox helpers (service) ────────────────────────────────────────────────

create or replace function public.claim_outbound_batch(p_limit int default 20)
returns setof public.outbound_events
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.outbound_write', '1', true);
  return query
    update public.outbound_events set attempts = attempts + 1
    where id in (
      select id from public.outbound_events
       where status in ('QUEUED','FAILED') and next_attempt_at <= now()
       order by created_at
       limit p_limit
       for update skip locked)
    returning *;
end;
$$;

create or replace function public.finish_outbound_attempt(
  p_event_id      uuid,
  p_success       boolean,
  p_response_code int default null,
  p_error         text default null
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v    public.outbound_events;
  v_max numeric;
  v_base numeric;
begin
  perform set_config('app.outbound_write', '1', true);
  select * into v from public.outbound_events where id = p_event_id for update;
  if not found then return; end if;
  if p_success then
    update public.outbound_events set
      status = 'DELIVERED', delivered_at = now(),
      last_response_code = p_response_code, last_error = null
    where id = p_event_id;
  else
    -- bounded exponential backoff; policy from admin_config with safe fallbacks
    v_max  := coalesce(public.config_number('payment.outbound.max_attempts'), 8);
    v_base := coalesce(public.config_number('payment.outbound.base_backoff_seconds'), 60);
    update public.outbound_events set
      status = case when attempts >= v_max then 'DEAD'::public.outbound_status else 'FAILED'::public.outbound_status end,
      next_attempt_at = now() + (power(2, least(attempts, 6)) * v_base * interval '1 second'),
      last_response_code = p_response_code,
      last_error = left(coalesce(p_error,''), 500)
    where id = p_event_id;
  end if;
end;
$$;
