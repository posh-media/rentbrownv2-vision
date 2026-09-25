-- RentBrown V2 — Phase 3B domain schema
-- Core domain model: properties → investment_plans → investment_rounds →
-- investments → investment_events, plus property_documents/property_updates,
-- admin_config (+history), audit_log, and profile verification fields.
--
-- Design contract (docs/phases/PHASE_3A_SCHEMA_PROPOSAL.md):
--  * Money = bigint minor units; ROI = integer basis points; duration = hours.
--  * Investments snapshot all economics — plan edits never rewrite history.
--  * Round capacity: total/allocated/reserved counters; availability derived.
--  * No client writes on any domain table — mutations happen in future
--    SECURITY DEFINER RPCs (Phase 4+). This file creates structure only.

-- ── Enums ────────────────────────────────────────────────────────────────────

create type public.currency_code as enum ('NGN', 'USD');
create type public.property_publication_status as enum ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');
create type public.property_document_type as enum ('TITLE', 'VALUATION', 'INSPECTION', 'COST_SCHEDULE', 'INSURANCE', 'LEGAL_OPINION', 'OPERATOR_AGREEMENT');
create type public.property_document_status as enum ('UPLOADED', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED');
create type public.investment_plan_status as enum ('DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED');
create type public.investment_round_status as enum ('SCHEDULED', 'OPEN', 'NEARING_CAPACITY', 'SOLD_OUT', 'CLOSED', 'SETTLED');
create type public.investment_status as enum ('PAYMENT_PENDING', 'ACTIVE', 'MATURITY_DUE', 'SETTLING', 'COMPLETED', 'FAILED', 'REFUNDED', 'REVIEW_REQUIRED');
create type public.investment_event_type as enum ('CREATED', 'PAYMENT_PENDING', 'PAYMENT_CONFIRMED', 'ACTIVATED', 'CANCELLED', 'FAILED', 'REFUNDED', 'MATURED', 'SETTLEMENT_STARTED', 'SETTLED', 'REVIEW_REQUIRED', 'NOTE_ADDED');
create type public.funding_source as enum ('WALLET', 'BANK_TRANSFER', 'CARD');
create type public.config_value_type as enum ('MONEY_MINOR', 'BPS', 'INTEGER', 'TEXT', 'BOOLEAN', 'STRING_LIST');
create type public.audit_result as enum ('SUCCESS', 'DENIED', 'FAILED');

-- ── Profile verification fields ──────────────────────────────────────────────
-- email_verified is synced from auth.users.email_confirmed_at (trigger below);
-- kyc_verified is flipped by the Phase 8 KYC workflow. Both default false and
-- are absent from the client column-grant, so no client can set them.

alter table public.profiles
  add column email_verified boolean not null default false,
  add column email_verified_at timestamptz,
  add column kyc_verified boolean not null default false,
  add column kyc_verified_at timestamptz;

comment on column public.profiles.email_verified is
  'Mirror of auth.users.email_confirmed_at for RLS/joins. Live auth value stays authoritative.';
comment on column public.profiles.kyc_verified is
  'Server-managed KYC gate flag; flipped by the Phase 8 KYC workflow only.';

-- ── Properties (the asset — no economics here) ───────────────────────────────

create table public.properties (
  id                 uuid primary key default gen_random_uuid(),
  slug               citext not null unique,
  name               text not null,
  property_type      text not null,
  summary            text not null,
  description        text not null,
  area               text,
  city               text,
  state              text,
  location_label     text not null,
  address            text,
  images             text[] not null default '{}',
  operator_name      text,
  operator_description text,
  highlights         text[] not null default '{}',
  revenue_model      text,
  publication_status public.property_publication_status not null default 'DRAFT',
  created_by         uuid references auth.users (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{2,63}$')
);

comment on table public.properties is
  'Asset record. ROI, slot price, duration and capacity live on plans/rounds — never here.';
comment on column public.properties.address is
  'Internal only — exact addresses are never exposed to public catalogue reads.';

create index properties_published_idx
  on public.properties (publication_status)
  where publication_status = 'PUBLISHED';

create trigger properties_updated_at
  before update on public.properties
  for each row execute function public.touch_updated_at();

-- ── Property documents (evidence with a real review trail) ──────────────────

create table public.property_documents (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties (id) on delete cascade,
  document_type public.property_document_type not null,
  title         text not null,
  summary       text,
  storage_path  text,
  status        public.property_document_status not null default 'UPLOADED',
  version       text not null default 'v1',
  reviewed_by   uuid references auth.users (id),
  reviewed_at   timestamptz,
  review_note   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint verified_needs_reviewer check (
    status <> 'VERIFIED' or (reviewed_by is not null and reviewed_at is not null)
  )
);

comment on table public.property_documents is
  'Evidence metadata. VERIFIED = reviewed under RentBrown internal process — not a legal claim.';
comment on column public.property_documents.storage_path is
  'Supabase Storage object key (Phase 11). Never a public URL; not exposed to clients.';
comment on column public.property_documents.review_note is
  'Internal reviewer note — admin only.';

create index property_documents_property_idx on public.property_documents (property_id, status);

create trigger property_documents_updated_at
  before update on public.property_documents
  for each row execute function public.touch_updated_at();

-- ── Property updates (published news per asset) ─────────────────────────────

create table public.property_updates (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  title        text not null,
  body         text not null,
  published_at timestamptz not null default now(),
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now()
);

create index property_updates_property_idx on public.property_updates (property_id, published_at desc);

-- ── Investment plans (the economic terms) ───────────────────────────────────

create table public.investment_plans (
  id                  uuid primary key default gen_random_uuid(),
  property_id         uuid not null references public.properties (id) on delete restrict,
  name                text not null,
  description         text,
  currency            public.currency_code not null,
  slot_price_minor    bigint not null,
  roi_bps             integer not null,
  duration_hours      integer not null,
  min_slots           integer not null default 1,
  max_slots_per_user  integer,
  eligibility         jsonb not null default '[]'::jsonb,
  investment_fee_bps  integer not null default 0,
  terms               text[] not null default '{}',
  risk_disclosures    text[] not null default '{}',
  status              public.investment_plan_status not null default 'DRAFT',
  created_by          uuid references auth.users (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint plans_property_name_key unique (property_id, name),
  constraint slot_price_positive check (slot_price_minor > 0),
  constraint roi_nonnegative check (roi_bps >= 0),
  constraint duration_positive check (duration_hours > 0),
  constraint min_slots_positive check (min_slots > 0),
  constraint max_slots_sane check (
    max_slots_per_user is null
    or (max_slots_per_user > 0 and max_slots_per_user >= min_slots)
  ),
  constraint fee_nonnegative check (investment_fee_bps >= 0)
);

comment on column public.investment_plans.duration_hours is
  'Canonical duration in elapsed hours (24 = 1 day, 8760 = 1 year). UI derives labels.';
comment on column public.investment_plans.eligibility is
  'Structured gates + display strings (e.g. kyc_tier, email_verified). Server interprets.';

create index investment_plans_property_idx on public.investment_plans (property_id);
create index investment_plans_public_idx
  on public.investment_plans (status)
  where status = 'PUBLISHED';

create trigger investment_plans_updated_at
  before update on public.investment_plans
  for each row execute function public.touch_updated_at();

-- ── Investment rounds (finite capacity under a plan) ────────────────────────

create table public.investment_rounds (
  id                     uuid primary key default gen_random_uuid(),
  plan_id                uuid not null references public.investment_plans (id) on delete restrict,
  round_number           integer not null,
  status                 public.investment_round_status not null default 'SCHEDULED',
  total_slots            integer not null,
  allocated_slots        integer not null default 0,
  reserved_slots         integer not null default 0,
  slot_price_minor       bigint not null,
  currency               public.currency_code not null,
  opens_at               timestamptz not null,
  closes_at              timestamptz not null,
  projected_start_at     timestamptz,
  projected_maturity_at  timestamptz,
  opened_at              timestamptz,
  closed_at              timestamptz,
  settled_at             timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint rounds_plan_number_key unique (plan_id, round_number),
  constraint round_number_positive check (round_number > 0),
  constraint total_slots_positive check (total_slots > 0),
  constraint allocated_nonnegative check (allocated_slots >= 0),
  constraint reserved_nonnegative check (reserved_slots >= 0),
  constraint capacity_invariant check (allocated_slots + reserved_slots <= total_slots),
  constraint slot_price_positive check (slot_price_minor > 0),
  constraint round_dates_valid check (closes_at > opens_at)
);

comment on table public.investment_rounds is
  'Finite capacity. available = total - allocated - reserved (derived, never stored).
   Phase 6 reserves via one atomic conditional UPDATE; the check is the backstop.';
comment on column public.investment_rounds.slot_price_minor is
  'Snapshot of plan price taken when the round opens — rounds never re-price live.';

create index investment_rounds_plan_idx on public.investment_rounds (plan_id);
create index investment_rounds_status_idx on public.investment_rounds (status, closes_at);

create trigger investment_rounds_updated_at
  before update on public.investment_rounds
  for each row execute function public.touch_updated_at();

-- ── Investments (user positions — economics are frozen snapshots) ───────────

create table public.investments (
  id                    uuid primary key default gen_random_uuid(),
  reference             text not null unique,
  user_id               uuid not null references public.profiles (id) on delete restrict,
  round_id              uuid not null references public.investment_rounds (id) on delete restrict,
  plan_id               uuid not null references public.investment_plans (id) on delete restrict,
  property_id           uuid not null references public.properties (id) on delete restrict,
  funding_source        public.funding_source not null,
  slots                 integer not null,
  slot_price_minor      bigint not null,
  currency              public.currency_code not null,
  principal_minor       bigint not null,
  roi_bps               integer not null,
  duration_hours        integer not null,
  expected_profit_minor bigint not null,
  maturity_value_minor  bigint not null,
  status                public.investment_status not null default 'PAYMENT_PENDING',
  activated_at          timestamptz,
  matures_at            timestamptz,
  completed_at          timestamptz,
  payment_reference     text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint slots_positive check (slots > 0),
  constraint slot_price_positive check (slot_price_minor > 0),
  constraint principal_matches check (principal_minor = slots::bigint * slot_price_minor),
  constraint roi_nonnegative check (roi_bps >= 0),
  constraint duration_positive check (duration_hours > 0),
  constraint profit_nonnegative check (expected_profit_minor >= 0),
  constraint maturity_value_matches check (maturity_value_minor = principal_minor + expected_profit_minor)
);

comment on table public.investments is
  'User contract. Every *_minor/roi/duration column is a snapshot taken at
   creation — editing the plan later cannot rewrite this row.';
comment on column public.investments.matures_at is
  'Set at activation as activated_at + duration_hours * interval ''1 hour'' (Phase 7).';
comment on column public.investments.expected_profit_minor is
  'floor(principal * roi_bps / 10000) — integer arithmetic only, computed server-side.';

create index investments_user_idx on public.investments (user_id, created_at desc);
create index investments_round_idx on public.investments (round_id);
create index investments_property_idx on public.investments (property_id);
create index investments_maturity_idx
  on public.investments (status, matures_at)
  where status in ('ACTIVE', 'MATURITY_DUE');

create trigger investments_updated_at
  before update on public.investments
  for each row execute function public.touch_updated_at();

-- ── Investment events (append-only lifecycle history) ───────────────────────

create table public.investment_events (
  id            uuid primary key default gen_random_uuid(),
  investment_id uuid not null references public.investments (id) on delete cascade,
  event_type    public.investment_event_type not null,
  actor_id      uuid references auth.users (id),
  actor_kind    text not null check (actor_kind in ('INVESTOR', 'ADMIN', 'SYSTEM')),
  request_id    text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

comment on table public.investment_events is
  'Append-only. Written inside the same transaction as the state change it
   describes. request_id deduplicates retried submissions (Phase 6).';

create index investment_events_investment_idx on public.investment_events (investment_id, created_at);

-- ── Admin configuration (typed registry) ────────────────────────────────────

create table public.admin_config (
  key          text primary key,
  category     text not null,
  value_type   public.config_value_type not null,
  value        jsonb not null,
  currency     public.currency_code,
  description  text not null,
  is_active    boolean not null default true,
  updated_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.admin_config is
  'Typed policy registry. Writes only via set_admin_config() — validation +
   history + audit in one transaction. Never edited by clients directly.';

create index admin_config_category_idx on public.admin_config (category) where is_active;

create trigger admin_config_updated_at
  before update on public.admin_config
  for each row execute function public.touch_updated_at();

create table public.admin_config_history (
  id          bigint generated always as identity primary key,
  key         text not null references public.admin_config (key),
  old_value   jsonb,
  new_value   jsonb not null,
  changed_by  uuid references auth.users (id),
  reason      text,
  request_id  text,
  created_at  timestamptz not null default now()
);

create index admin_config_history_key_idx on public.admin_config_history (key, created_at desc);

-- ── Audit log (append-only) ─────────────────────────────────────────────────

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users (id),
  actor_role  text,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  result      public.audit_result not null default 'SUCCESS',
  request_id  text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

comment on table public.audit_log is
  'Append-only operational trail. metadata carries {old,new} diffs — never
   secrets, credentials, PINs or sensitive KYC payloads.';

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);
create index audit_log_created_idx on public.audit_log (created_at desc);

-- ── Helpers ─────────────────────────────────────────────────────────────────

-- Role-membership check for RLS policies and RPC permission gates.
create or replace function public.has_admin_role(roles public.admin_role[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_roles
    where user_id = auth.uid() and role = any(roles)
  );
$$;

-- Sync profiles.email_verified* from auth.users.email_confirmed_at.
create or replace function public.sync_email_verified()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is distinct from old.email_confirmed_at then
    update public.profiles
       set email_verified   = (new.email_confirmed_at is not null),
           email_verified_at = new.email_confirmed_at
     where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.sync_email_verified();

-- Validate a proposed config value against its declared type. Shared by
-- set_admin_config; raises on invalid input.
create or replace function public.assert_config_value(
  p_type public.config_value_type,
  p_value jsonb,
  p_currency public.currency_code
)
returns void
language plpgsql immutable
set search_path = ''
as $$
declare
  v_num numeric;
begin
  case p_type
    when 'MONEY_MINOR' then
      if jsonb_typeof(p_value) <> 'number' then
        raise exception 'MONEY_MINOR requires a number';
      end if;
      v_num := (p_value #>> '{}')::numeric;
      if v_num <> trunc(v_num) or v_num < 0 then
        raise exception 'MONEY_MINOR requires an integer >= 0';
      end if;
      if p_currency is null then
        raise exception 'MONEY_MINOR requires a currency';
      end if;
    when 'BPS' then
      if jsonb_typeof(p_value) <> 'number' then
        raise exception 'BPS requires a number';
      end if;
      v_num := (p_value #>> '{}')::numeric;
      if v_num <> trunc(v_num) or v_num < 0 or v_num > 10000 then
        raise exception 'BPS requires an integer in [0, 10000]';
      end if;
    when 'INTEGER' then
      if jsonb_typeof(p_value) <> 'number' then
        raise exception 'INTEGER requires a number';
      end if;
      v_num := (p_value #>> '{}')::numeric;
      if v_num <> trunc(v_num) then
        raise exception 'INTEGER requires a whole number';
      end if;
    when 'TEXT' then
      if jsonb_typeof(p_value) <> 'string' then
        raise exception 'TEXT requires a string';
      end if;
    when 'BOOLEAN' then
      if jsonb_typeof(p_value) <> 'boolean' then
        raise exception 'BOOLEAN requires a boolean';
      end if;
    when 'STRING_LIST' then
      if jsonb_typeof(p_value) <> 'array' then
        raise exception 'STRING_LIST requires an array';
      end if;
      if exists (
        select 1 from jsonb_array_elements(p_value) e
        where jsonb_typeof(e.value) <> 'string'
      ) then
        raise exception 'STRING_LIST requires an array of strings';
      end if;
    else
      raise exception 'unknown config value type: %', p_type;
  end case;
end;
$$;

-- The single write path for admin configuration. SUPER_ADMIN only (Phase 10
-- will add a proposal workflow). Validates, updates, writes history + audit —
-- atomically, in the caller's transaction.
create or replace function public.set_admin_config(
  p_key text,
  p_value jsonb,
  p_reason text default null,
  p_request_id text default null
)
returns public.admin_config
language plpgsql security definer
set search_path = ''
as $$
declare
  cfg public.admin_config;
  v_old jsonb;
  v_role text;
begin
  v_role := public.current_admin_role()::text;

  -- Denied attempts raise WITHOUT writing: an exception aborts the whole
  -- transaction, so a DENIED audit row inserted here could never persist.
  -- Denial auditing belongs to the caller/app layer (out of transaction).
  if not public.has_admin_role(array['SUPER_ADMIN']::public.admin_role[]) then
    raise exception 'not authorized to modify admin configuration';
  end if;

  select * into cfg from public.admin_config where key = p_key for update;
  if not found then
    raise exception 'unknown configuration key: %', p_key;
  end if;
  if not cfg.is_active then
    raise exception 'configuration key is inactive: %', p_key;
  end if;

  perform public.assert_config_value(cfg.value_type, p_value, cfg.currency);

  v_old := cfg.value;

  update public.admin_config
     set value = p_value,
         updated_by = auth.uid()
   where key = p_key
   returning * into cfg;

  insert into public.admin_config_history (key, old_value, new_value, changed_by, reason, request_id)
  values (p_key, v_old, p_value, auth.uid(), p_reason, p_request_id);

  insert into public.audit_log (actor_id, actor_role, action, entity_type, entity_id, result, request_id, metadata)
  values (auth.uid(), v_role, 'config.update', 'admin_config', p_key, 'SUCCESS', p_request_id,
          jsonb_build_object('old', v_old, 'new', p_value));

  return cfg;
end;
$$;

-- Typed read for engines/services. Returns active rows only; authenticated
-- callers see values (policy values are not secrets — keys are curated).
create or replace function public.get_admin_config(p_keys text[] default null)
returns setof public.admin_config
language sql stable security definer
set search_path = ''
as $$
  select * from public.admin_config
  where is_active
    and (p_keys is null or key = any(p_keys))
    and auth.uid() is not null;
$$;
