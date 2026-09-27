-- RentBrown V2 — Phase 8B part 1: KYC schema + transaction PIN.
-- Built on docs/phases/PHASE_8A_KYC_WITHDRAWALS_ARCHITECTURE.md (D-008).
--
--   kyc_submissions   — versioned KYC attempts (one live row per user)
--   kyc_events        — append-only transition log
--   user_pins         — bcrypt transaction-PIN store (no client SELECT)
--   kyc-documents     — private Storage bucket for selfie/POA objects
--
-- KYC documents never live in Postgres — only storage object paths. BVN is a
-- restricted column: masked in every investor response, visible in full only
-- through reviewer-gated admin RPCs. profiles.kyc_verified is a projection
-- written by the governed verification transition, never by clients.

-- bcrypt lives in pgcrypto. It is installed into the dedicated extensions
-- schema (Supabase convention) and referenced schema-qualified because every
-- function here runs with SET search_path=''.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ── Enums ──────────────────────────────────────────────────────────────────

create type public.kyc_status as enum (
  'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'SUPERSEDED'
);
create type public.kyc_gender as enum ('MALE', 'FEMALE', 'OTHER');
create type public.kyc_poa_type as enum (
  'UTILITY_BILL', 'ELECTRICITY_BILL', 'BANK_STATEMENT', 'OTHER'
);
create type public.kyc_provider as enum ('MANUAL');

-- ── kyc_submissions ────────────────────────────────────────────────────────

create table public.kyc_submissions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete restrict,
  attempt_no         integer not null check (attempt_no > 0),
  status             public.kyc_status not null default 'DRAFT',
  full_legal_name    text,
  gender             public.kyc_gender,
  bvn                text check (bvn is null or bvn ~ '^\d{11}$'),
  selfie_path        text,
  poa_path           text,
  poa_type           public.kyc_poa_type,
  provider           public.kyc_provider not null default 'MANUAL',
  provider_reference text,
  provider_result    jsonb not null default '{}'::jsonb,
  submitted_at       timestamptz,
  reviewed_by        uuid references auth.users (id),
  reviewed_at        timestamptz,
  review_note        text,
  rejection_reason   text,
  request_id         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint kyc_attempt_uq unique (user_id, attempt_no)
);

comment on table public.kyc_submissions is
  'Versioned KYC attempts. One live (non-SUPERSEDED) submission per user.
   Documents are storage paths only — binaries live in the private
   kyc-documents bucket. provider/provider_* are the future third-party seam;
   Phase 8 uses MANUAL review only.';

-- Exactly one live submission per user.
create unique index kyc_one_live_per_user
  on public.kyc_submissions (user_id) where status <> 'SUPERSEDED';
create index kyc_status_idx on public.kyc_submissions (status)
  where status in ('SUBMITTED','UNDER_REVIEW');
create index kyc_user_idx on public.kyc_submissions (user_id, attempt_no desc);

create trigger kyc_submissions_updated_at
  before update on public.kyc_submissions
  for each row execute function public.touch_updated_at();

-- ── kyc_events (append-only) ───────────────────────────────────────────────

create table public.kyc_events (
  id            bigint generated always as identity primary key,
  submission_id uuid not null references public.kyc_submissions (id) on delete restrict,
  from_status   public.kyc_status,
  to_status     public.kyc_status not null,
  source        public.domain_event_source not null,
  request_id    text,
  note          text,
  created_at    timestamptz not null default now()
);

create index kyc_events_sub_idx on public.kyc_events (submission_id, id);

-- ── user_pins ──────────────────────────────────────────────────────────────

create table public.user_pins (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  pin_hash        text not null,
  failed_attempts integer not null default 0,
  locked_until    timestamptz,
  pin_set_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.user_pins is
  'Transaction PINs. bcrypt hash only (pgcrypto crypt/gen_salt bf). No client
   SELECT at all — interaction exclusively through definer RPCs.';

create trigger user_pins_updated_at
  before update on public.user_pins
  for each row execute function public.touch_updated_at();

-- ── Write guards ───────────────────────────────────────────────────────────

create or replace function public.assert_kyc_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'kyc submissions cannot be deleted';
  end if;
  if current_setting('app.kyc_write', true) is distinct from '1' then
    raise exception 'kyc submissions may only be mutated inside kyc functions';
  end if;
  return new;
end;
$$;

create trigger kyc_submissions_guard
  before insert or update or delete on public.kyc_submissions
  for each row execute function public.assert_kyc_write();

create trigger kyc_events_immutable
  before update or delete on public.kyc_events
  for each row execute function public.assert_immutable();

create or replace function public.assert_pin_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'user pins cannot be deleted';
  end if;
  if current_setting('app.pin_write', true) is distinct from '1' then
    raise exception 'user pins may only be mutated inside pin functions';
  end if;
  return new;
end;
$$;

create trigger user_pins_guard
  before insert or update or delete on public.user_pins
  for each row execute function public.assert_pin_write();

-- ── apply_kyc_transition (service/admin path — governed state machine) ──────

create or replace function public.apply_kyc_transition(
  p_submission_id uuid,
  p_to            public.kyc_status,
  p_source        public.domain_event_source,
  p_request_id    text default null,
  p_note          text default null
)
returns public.kyc_status
language plpgsql security definer set search_path = '' as $$
declare
  v public.kyc_submissions;
  ok boolean;
begin
  perform set_config('app.kyc_write', '1', true);
  select * into v from public.kyc_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'kyc submission % not found', p_submission_id;
  end if;
  if v.status = p_to then
    return v.status;
  end if;

  ok := case v.status
    when 'DRAFT'        then p_to in ('SUBMITTED','SUPERSEDED')
    when 'SUBMITTED'    then p_to in ('UNDER_REVIEW','DRAFT','VERIFIED','REJECTED')
    when 'UNDER_REVIEW' then p_to in ('VERIFIED','REJECTED')
    when 'REJECTED'     then p_to = 'SUPERSEDED'
    else false
  end;

  if not ok then
    raise exception 'invalid kyc transition: % → %', v.status, p_to;
  end if;

  update public.kyc_submissions set
    status       = p_to,
    submitted_at = case when p_to = 'SUBMITTED' and submitted_at is null
                        then now() else submitted_at end,
    reviewed_at  = case when p_to in ('VERIFIED','REJECTED') then now() else reviewed_at end
  where id = p_submission_id;

  insert into public.kyc_events
    (submission_id, from_status, to_status, source, request_id, note)
  values
    (p_submission_id, v.status, p_to, p_source, p_request_id, p_note);

  -- Profile projection: kyc_submissions is authoritative; the flag is written
  -- only here, inside the same transaction as VERIFIED.
  if p_to = 'VERIFIED' then
    update public.profiles
       set kyc_verified = true, kyc_verified_at = now()
     where id = v.user_id;
  end if;

  return p_to;
end;
$$;

-- ── kyc_get_own (authenticated) — investor-facing status, BVN masked ────────

create or replace function public.kyc_get_own()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v     public.kyc_submissions;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  select * into v from public.kyc_submissions
   where user_id = v_uid and status <> 'SUPERSEDED';
  if v.id is null then
    return jsonb_build_object('status', 'NOT_STARTED', 'submission', null);
  end if;
  return jsonb_build_object(
    'status', v.status::text,
    'submission', jsonb_build_object(
      'id', v.id,
      'attempt_no', v.attempt_no,
      'status', v.status::text,
      'full_legal_name', v.full_legal_name,
      'gender', v.gender::text,
      'bvn_masked', case when v.bvn is null then null else '***' || right(v.bvn, 4) end,
      'poa_type', v.poa_type::text,
      'has_selfie', v.selfie_path is not null,
      'has_poa', v.poa_path is not null,
      'provider', v.provider::text,
      'submitted_at', v.submitted_at,
      'reviewed_at', v.reviewed_at,
      'rejection_reason', v.rejection_reason));
end;
$$;

-- ── kyc_save_draft (authenticated) — create/edit own DRAFT, resubmit ────────

create or replace function public.kyc_save_draft(
  p_full_legal_name text default null,
  p_gender          public.kyc_gender default null,
  p_bvn             text default null,
  p_poa_type        public.kyc_poa_type default null,
  p_selfie_path     text default null,
  p_poa_path        text default null,
  p_request_id      text default null
)
returns public.kyc_submissions
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v     public.kyc_submissions;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  if p_bvn is not null and p_bvn !~ '^\d{11}$' then
    raise exception 'ERR_BVN: BVN must be exactly 11 digits';
  end if;

  perform set_config('app.kyc_write', '1', true);

  select * into v from public.kyc_submissions
   where user_id = v_uid and status <> 'SUPERSEDED'
   for update;

  if v.id is not null and v.status not in ('DRAFT','REJECTED') then
    raise exception 'ERR_KYC_STATE: submission is % and cannot be edited', v.status;
  end if;

  if v.id is not null and v.status = 'REJECTED' then
    -- resubmission: retire the rejected attempt, open a fresh draft
    perform public.apply_kyc_transition(v.id, 'SUPERSEDED', 'USER', p_request_id,
      'resubmission — superseded by new attempt');
    v := null;
  end if;

  if v.id is null then
    -- generate the id first so storage paths can be validated against it
    v.id := gen_random_uuid();
    if (p_selfie_path is not null and p_selfie_path !~ ('^' || v_uid::text || '/' || v.id::text || '/'))
       or (p_poa_path is not null and p_poa_path !~ ('^' || v_uid::text || '/' || v.id::text || '/')) then
      raise exception 'ERR_STORAGE: document paths must be <user>/<submission>/…';
    end if;
    insert into public.kyc_submissions
      (id, user_id, attempt_no, full_legal_name, gender, bvn, poa_type,
       selfie_path, poa_path, request_id)
    values (
      v.id, v_uid,
      coalesce((select max(attempt_no) from public.kyc_submissions where user_id = v_uid), 0) + 1,
      p_full_legal_name, p_gender, p_bvn, p_poa_type, p_selfie_path, p_poa_path,
      p_request_id)
    returning * into v;
    insert into public.kyc_events
      (submission_id, from_status, to_status, source, request_id, note)
    values (v.id, null, 'DRAFT', 'USER', p_request_id, 'kyc draft created');
  else
    -- paths must live under this user's storage prefix for this submission
    if p_selfie_path is not null and p_selfie_path !~ ('^' || v_uid::text || '/' || v.id::text || '/') then
      raise exception 'ERR_STORAGE: selfie path must be <user>/<submission>/…';
    end if;
    if p_poa_path is not null and p_poa_path !~ ('^' || v_uid::text || '/' || v.id::text || '/') then
      raise exception 'ERR_STORAGE: poa path must be <user>/<submission>/…';
    end if;
    update public.kyc_submissions set
      full_legal_name = coalesce(p_full_legal_name, full_legal_name),
      gender          = coalesce(p_gender, gender),
      bvn             = coalesce(p_bvn, bvn),
      poa_type        = coalesce(p_poa_type, poa_type),
      selfie_path     = coalesce(p_selfie_path, selfie_path),
      poa_path        = coalesce(p_poa_path, poa_path)
    where id = v.id
    returning * into v;
  end if;

  return v;
end;
$$;

-- ── kyc_submit (authenticated) — DRAFT → SUBMITTED, evidence locked ─────────

create or replace function public.kyc_submit(
  p_submission_id uuid,
  p_request_id    text default null
)
returns public.kyc_submissions
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v     public.kyc_submissions;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  select * into v from public.kyc_submissions where id = p_submission_id;
  if not found or v.user_id <> v_uid then
    raise exception 'kyc submission not found';
  end if;
  if v.status <> 'DRAFT' then
    raise exception 'ERR_KYC_STATE: only a DRAFT can be submitted (now %)', v.status;
  end if;
  if v.full_legal_name is null or v.gender is null or v.bvn is null
     or v.selfie_path is null or v.poa_path is null or v.poa_type is null then
    raise exception 'ERR_INCOMPLETE: legal name, gender, BVN, selfie and proof of address are all required';
  end if;
  perform public.apply_kyc_transition(p_submission_id, 'SUBMITTED', 'USER', p_request_id, 'kyc submitted for review');
  select * into v from public.kyc_submissions where id = p_submission_id;
  return v;
end;
$$;

-- ── kyc_withdraw_to_draft (authenticated) — SUBMITTED → DRAFT (unclaimed) ───

create or replace function public.kyc_withdraw_to_draft(
  p_submission_id uuid,
  p_request_id    text default null
)
returns public.kyc_submissions
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v     public.kyc_submissions;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  select * into v from public.kyc_submissions where id = p_submission_id;
  if not found or v.user_id <> v_uid then
    raise exception 'kyc submission not found';
  end if;
  perform public.apply_kyc_transition(p_submission_id, 'DRAFT', 'USER', p_request_id, 'withdrawn back to draft');
  select * into v from public.kyc_submissions where id = p_submission_id;
  return v;
end;
$$;

-- ── set_transaction_pin (authenticated) ────────────────────────────────────

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
        pin_set_at = now();
  insert into public.audit_log (actor_id, actor_role, action, entity_type, entity_id, result, request_id, metadata)
  values (v_uid, 'INVESTOR', 'security.pin_set', 'user', v_uid::text, 'SUCCESS', p_request_id, '{}'::jsonb);
end;
$$;

-- ── verify_transaction_pin (authenticated definer — internal gate) ──────────
-- Returns false on mismatch so a standalone call COMMITS the failed-attempt
-- increment (an exception would roll it back). Lockout and unset PIN raise —
-- they carry no counter mutation. Callers (e.g. request_withdrawal) convert a
-- false return into ERR_PIN.

create or replace function public.verify_transaction_pin(
  p_pin        text,
  p_request_id text default null
)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v      public.user_pins;
  v_max  int;
  v_lock int;
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
    if v.failed_attempts > 0 or v.locked_until is not null then
      update public.user_pins set failed_attempts = 0, locked_until = null
       where user_id = v_uid;
    end if;
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

-- ── Config seeds ───────────────────────────────────────────────────────────

insert into public.admin_config (key, category, value_type, value, currency, description, is_active)
values
  ('kyc.required_for_withdrawal', 'kyc', 'BOOLEAN', 'true', null,
   'Require a verified KYC submission before withdrawal (subject to the first-withdrawal exception).', true),
  ('kyc.max_upload_mb', 'kyc', 'INTEGER', '5', null,
   'Maximum KYC document upload size in megabytes.', true),
  ('security.pin.max_attempts', 'security', 'INTEGER', '5', null,
   'Failed PIN attempts before lockout.', true),
  ('security.pin.lockout_minutes', 'security', 'INTEGER', '15', null,
   'PIN lockout duration in minutes.', true),
  ('withdrawal.min_mode', 'withdrawals', 'TEXT', '"DYNAMIC"', null,
   'DYNAMIC: min = maturity value of one slot in the cheapest PUBLISHED plan. FIXED: withdrawal.min_minor.<cur>.', true),
  ('withdrawal.first_without_kyc_max_minor.NGN', 'withdrawals', 'MONEY_MINOR', '1000000', 'NGN',
   'First-ever withdrawal below this amount needs no KYC (strictly less than).', true),
  ('withdrawal.first_without_kyc_max_minor.USD', 'withdrawals', 'MONEY_MINOR', '1000', 'USD',
   'First-ever withdrawal below this amount needs no KYC (strictly less than).', true)
on conflict (key) do nothing;

-- ── Private storage bucket ────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('kyc-documents', 'kyc-documents', false)
on conflict (id) do nothing;

-- Owner may upload/modify objects only under <uid>/<submission-id>/… while
-- that submission is still an editable DRAFT. Once submitted the evidence is
-- locked — updates/deletes are denied by policy.
create policy kyc_owner_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'kyc-documents'
    and (string_to_array(name, '/'))[1] = auth.uid()::text
    and exists (
      select 1 from public.kyc_submissions ks
       where ks.id::text = (string_to_array(name, '/'))[2]
         and ks.user_id = auth.uid()
         and ks.status = 'DRAFT'));
create policy kyc_owner_update on storage.objects for update to authenticated
  using (
    bucket_id = 'kyc-documents'
    and (string_to_array(name, '/'))[1] = auth.uid()::text
    and exists (
      select 1 from public.kyc_submissions ks
       where ks.id::text = (string_to_array(name, '/'))[2]
         and ks.user_id = auth.uid()
         and ks.status = 'DRAFT'));
create policy kyc_owner_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'kyc-documents'
    and (string_to_array(name, '/'))[1] = auth.uid()::text
    and exists (
      select 1 from public.kyc_submissions ks
       where ks.id::text = (string_to_array(name, '/'))[2]
         and ks.user_id = auth.uid()
         and ks.status = 'DRAFT'));
create policy kyc_owner_read on storage.objects for select to authenticated
  using (
    bucket_id = 'kyc-documents'
    and (string_to_array(name, '/'))[1] = auth.uid()::text);
create policy kyc_reviewer_read on storage.objects for select to authenticated
  using (
    bucket_id = 'kyc-documents'
    and public.has_admin_role(array['KYC_REVIEWER','FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]));

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table public.kyc_submissions enable row level security;
alter table public.kyc_events      enable row level security;
alter table public.user_pins       enable row level security;

create policy kyc_submissions_owner_read on public.kyc_submissions
  for select to authenticated using (user_id = auth.uid());
-- Reviewer/admin read — full row incl. BVN is further gated at the RPC layer;
-- masked exposure is enforced by what callers SELECT, never client-supplied SQL.
create policy kyc_submissions_admin_read on public.kyc_submissions
  for select to authenticated
  using (public.has_admin_role(array['KYC_REVIEWER','FINANCE_ADMIN','SUPER_ADMIN','OPERATIONS_ADMIN','SUPPORT']::public.admin_role[]));

create policy kyc_events_owner_read on public.kyc_events
  for select to authenticated
  using (exists (select 1 from public.kyc_submissions s
                  where s.id = submission_id and s.user_id = auth.uid()));
create policy kyc_events_admin_read on public.kyc_events
  for select to authenticated
  using (public.has_admin_role(array['KYC_REVIEWER','FINANCE_ADMIN','SUPER_ADMIN','OPERATIONS_ADMIN','SUPPORT']::public.admin_role[]));

-- user_pins: no policies → no client visibility whatsoever.

-- ── Privileges ─────────────────────────────────────────────────────────────

revoke insert, update, delete on public.kyc_submissions from authenticated, anon;
revoke insert, update, delete on public.kyc_events      from authenticated, anon;
revoke all                            on public.user_pins       from authenticated, anon;

-- BVN + provider internals are restricted columns: Postgres column grants are
-- additive, so we grant SELECT on the safe column list rather than the whole
-- table. Definer RPCs (owner context) still read everything.
revoke select on public.kyc_submissions from authenticated, anon;
grant select (
  id, user_id, attempt_no, status, full_legal_name, gender,
  selfie_path, poa_path, poa_type, provider, provider_reference,
  submitted_at, reviewed_by, reviewed_at, review_note, rejection_reason,
  request_id, created_at, updated_at)
  on public.kyc_submissions to authenticated;
grant select on public.kyc_events      to authenticated;
grant all    on public.kyc_submissions, public.kyc_events, public.user_pins to service_role;

revoke execute on function public.kyc_get_own() from public, anon;
revoke execute on function public.kyc_save_draft(text, public.kyc_gender, text, public.kyc_poa_type, text, text, text) from public, anon;
revoke execute on function public.kyc_submit(uuid, text) from public, anon;
revoke execute on function public.kyc_withdraw_to_draft(uuid, text) from public, anon;
revoke execute on function public.set_transaction_pin(text, text) from public, anon;
revoke execute on function public.verify_transaction_pin(text, text) from public, anon;
revoke execute on function public.apply_kyc_transition(uuid, public.kyc_status, public.domain_event_source, text, text) from public, anon, authenticated;

grant execute on function public.kyc_get_own() to authenticated;
grant execute on function public.kyc_save_draft(text, public.kyc_gender, text, public.kyc_poa_type, text, text, text) to authenticated;
grant execute on function public.kyc_submit(uuid, text) to authenticated;
grant execute on function public.kyc_withdraw_to_draft(uuid, text) to authenticated;
grant execute on function public.set_transaction_pin(text, text) to authenticated;
grant execute on function public.verify_transaction_pin(text, text) to authenticated;
grant execute on function public.apply_kyc_transition(uuid, public.kyc_status, public.domain_event_source, text, text) to service_role;
