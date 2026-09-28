-- 0022 — Phase 9B part 1: referrals + reward grant schema.
--
-- Durable reward-relationship and grant/provenance model per
-- docs/phases/PHASE_9A_REFERRALS_REWARDS_TASKS_ARCHITECTURE.md.
--
--   referrals            — durable referrer→referred relationship (backfilled
--                          from profiles.referred_by; created inside
--                          handle_new_user from here on)
--   reward_grants        — one row per issued/pending reward. The ledger is
--                          the money truth; the per-grant bucket counters are a
--                          reconciled projection answering "where is this
--                          reward's value right now"
--   reward_allocations   — append-only per-grant movement log (the audit trail
--                          linking grants to journals/withdrawals/investments)
--   reward_receivables   — debt ledger for reward value that could not be
--                          clawed back on reversal (rewards already spent)
--   referral_events      — append-only referral lifecycle log
--   reward_events        — append-only grant lifecycle log
--   user_identities      — external provider identity links (Telegram for
--                          task verification)
--
-- Write guards mirror wallets/withdrawals: tables may only be written while
-- the matching transaction-local flag is set inside a definer function.

-- ── Enums ────────────────────────────────────────────────────────────────────

create type public.referral_status as enum
  ('JOINED', 'QUALIFIED', 'CREDITED', 'DISQUALIFIED', 'BLOCKED');
create type public.reward_kind as enum
  ('REFERRAL_SIGNUP', 'REFERRAL_DEPOSIT', 'TASK');
create type public.reward_grant_status as enum
  ('PENDING', 'QUALIFIED', 'CREDITED', 'PARTIALLY_REVERSED', 'REVERSED', 'BLOCKED');
create type public.reward_movement as enum
  ('ISSUE', 'RELEASE', 'HOLD', 'HOLD_RETURN', 'CONSUME', 'REVERSE', 'RECOVER');
create type public.receivable_status as enum
  ('OPEN', 'SETTLED');
create type public.identity_provider as enum
  ('TELEGRAM');

-- ── referrals ────────────────────────────────────────────────────────────────

create table public.referrals (
  id                uuid primary key default gen_random_uuid(),
  referrer_id       uuid not null references public.profiles (id) on delete restrict,
  referred_id       uuid not null references public.profiles (id) on delete restrict,
  status            public.referral_status not null default 'JOINED',
  code_snapshot     text not null,
  attributed_via    text not null default 'signup_metadata',
  qualifying_deposit_id    uuid,
  qualifying_investment_id uuid,
  qualified_at      timestamptz,
  credited_at       timestamptz,
  request_id        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint referrals_no_self check (referrer_id <> referred_id)
);

comment on table public.referrals is
  'Durable financial referral relationship. profiles.referred_by is the
   attribution fast-path captured at signup; this table is the authoritative
   reward relationship. Server-controlled — clients can never write it.';
comment on column public.referrals.qualifying_deposit_id is
  'The deposit that first satisfied the qualifying threshold.';
comment on column public.referrals.qualifying_investment_id is
  'The investment that completed qualification (sign-up reward gate).';

create unique index referrals_referred_uq on public.referrals (referred_id);
create unique index referrals_pair_uq on public.referrals (referrer_id, referred_id);
create index referrals_referrer_idx on public.referrals (referrer_id, created_at desc);
create index referrals_status_idx on public.referrals (status)
  where status in ('JOINED','QUALIFIED','BLOCKED');

create trigger referrals_updated_at
  before update on public.referrals
  for each row execute function public.touch_updated_at();

-- ── reward_grants ────────────────────────────────────────────────────────────
-- Bucket counters are a projection: issued_minor value sits in exactly one of
-- {bonus, released, reserved, consumed, reversed} at all times.
--   bonus     — value currently in the BONUS wallet bucket
--   released  — value moved to AVAILABLE but still reward-provenance
--   reserved  — value inside a pending withdrawal/investment hold
--   consumed  — paid out or invested (terminal)
--   reversed  — clawed back to the platform (recovered + receivable-converted)
-- Invariant (reconciled + CHECK): issued = bonus+released+reserved+consumed+reversed

create table public.reward_grants (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete restrict,
  kind              public.reward_kind not null,
  status            public.reward_grant_status not null default 'PENDING',
  face_minor        bigint not null default 0 check (face_minor >= 0),
  currency          public.currency_code,
  issued_minor      bigint not null default 0 check (issued_minor >= 0),
  bonus_minor       bigint not null default 0 check (bonus_minor >= 0),
  released_minor    bigint not null default 0 check (released_minor >= 0),
  reserved_minor    bigint not null default 0 check (reserved_minor >= 0),
  consumed_minor    bigint not null default 0 check (consumed_minor >= 0),
  reversed_minor    bigint not null default 0 check (reversed_minor >= 0),
  referral_id       uuid references public.referrals (id) on delete restrict,
  deposit_id        uuid references public.deposits (id) on delete restrict,
  task_claim_id     uuid,           -- FK added in 0026 (task_claims table)
  issue_journal_id  uuid references public.journal_entries (id) on delete restrict,
  request_id        text,
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint reward_grants_bucket_invariant check (
    issued_minor = bonus_minor + released_minor + reserved_minor
                   + consumed_minor + reversed_minor),
  constraint reward_grants_kind_source check (
    (kind = 'REFERRAL_SIGNUP'
       and referral_id is not null and deposit_id is null and task_claim_id is null)
    or (kind = 'REFERRAL_DEPOSIT'
       and referral_id is not null and deposit_id is not null and task_claim_id is null)
    or (kind = 'TASK'
       and task_claim_id is not null and referral_id is null and deposit_id is null)),
  constraint reward_grants_issued_needs_currency check (
    issued_minor = 0 or currency is not null)
);

comment on table public.reward_grants is
  'One row per reward. face_minor is the configured amount for pending grants;
   issued_minor is the ledger-minted amount once CREDITED. The bucket counters
   track where issued value currently sits; every movement has a
   reward_allocations row (and usually a journal).';

-- one reward per source event — idempotent issuance at the storage layer
create unique index reward_grants_deposit_uq
  on public.reward_grants (deposit_id) where kind = 'REFERRAL_DEPOSIT';
create unique index reward_grants_signup_uq
  on public.reward_grants (referral_id) where kind = 'REFERRAL_SIGNUP';
create unique index reward_grants_task_uq
  on public.reward_grants (task_claim_id) where kind = 'TASK';
create index reward_grants_user_idx on public.reward_grants (user_id, currency, created_at desc);
create index reward_grants_status_idx on public.reward_grants (status)
  where status in ('PENDING','QUALIFIED','BLOCKED');
create index reward_grants_referral_idx on public.reward_grants (referral_id)
  where referral_id is not null;

create trigger reward_grants_updated_at
  before update on public.reward_grants
  for each row execute function public.touch_updated_at();

-- ── reward_receivables ───────────────────────────────────────────────────────
-- Debt owed to the platform when a reward is reversed after the user already
-- spent/withdrew it. Settled by offset against future rewards or admin
-- collection — never by forcing a wallet negative.

create table public.reward_receivables (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete restrict,
  currency            public.currency_code not null,
  amount_minor        bigint not null check (amount_minor > 0),
  outstanding_minor   bigint not null check (outstanding_minor >= 0),
  source_grant_id     uuid not null references public.reward_grants (id) on delete restrict,
  reversal_journal_id uuid references public.journal_entries (id) on delete restrict,
  status              public.receivable_status not null default 'OPEN',
  request_id          text,
  created_at          timestamptz not null default now(),
  settled_at          timestamptz,

  constraint receivables_outstanding_le_amount check (outstanding_minor <= amount_minor)
);

comment on table public.reward_receivables is
  'Reward debt: the part of a reversed grant that could not be clawed back
   because the user already moved/spent it. outstanding_minor is offset
   against future reward issuances (reward.debt_offset_on_issue) or collected
   by finance admin. Reconciled against the system:reward_receivable account.';

create index reward_receivables_open_idx
  on public.reward_receivables (user_id, currency)
  where status = 'OPEN';
create index reward_receivables_grant_idx on public.reward_receivables (source_grant_id);

-- ── reward_allocations ───────────────────────────────────────────────────────
-- bucket = the non-reserved side of the movement (BONUS or RELEASED value)
-- for HOLD/HOLD_RETURN/REVERSE/RECOVER; null for ISSUE/CONSUME.

create table public.reward_allocations (
  id             bigint generated always as identity primary key,
  grant_id       uuid not null references public.reward_grants (id) on delete restrict,
  movement       public.reward_movement not null,
  bucket         text check (bucket in ('BONUS','RELEASED')),
  amount_minor   bigint not null check (amount_minor > 0),
  journal_id     uuid references public.journal_entries (id) on delete restrict,
  withdrawal_id  uuid references public.withdrawals (id) on delete restrict,
  investment_id  uuid references public.investments (id) on delete restrict,
  receivable_id  uuid references public.reward_receivables (id) on delete restrict,
  note           text,
  request_id     text,
  created_at     timestamptz not null default now()
);

comment on table public.reward_allocations is
  'Append-only movement log between grant bucket counters. Answers "why is
   ₦X withdrawable / where did reward funds go" without re-deriving history.
   HOLD/HOLD_RETURN carry bucket=BONUS|RELEASED so a released hold restores
   grant counters to the provenance bucket it came from.';

create index reward_allocations_grant_idx on public.reward_allocations (grant_id, id);
create index reward_allocations_withdrawal_idx
  on public.reward_allocations (withdrawal_id) where withdrawal_id is not null;
create index reward_allocations_investment_idx
  on public.reward_allocations (investment_id) where investment_id is not null;

-- ── referral_events / reward_events (append-only logs) ──────────────────────

create table public.referral_events (
  id           bigint generated always as identity primary key,
  referral_id  uuid not null references public.referrals (id) on delete restrict,
  event_type   text not null,
  actor_kind   text not null default 'SYSTEM'
               check (actor_kind in ('INVESTOR','ADMIN','SYSTEM','PROVIDER')),
  actor_id     uuid,
  request_id   text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index referral_events_referral_idx on public.referral_events (referral_id, id);

create table public.reward_events (
  id          bigint generated always as identity primary key,
  grant_id    uuid references public.reward_grants (id) on delete restrict,
  referral_id uuid references public.referrals (id) on delete restrict,
  event_type  text not null,
  actor_kind  text not null default 'SYSTEM'
              check (actor_kind in ('INVESTOR','ADMIN','SYSTEM','PROVIDER')),
  actor_id    uuid,
  journal_id  uuid references public.journal_entries (id) on delete restrict,
  request_id  text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index reward_events_grant_idx on public.reward_events (grant_id, id);
create index reward_events_referral_idx on public.reward_events (referral_id, id)
  where referral_id is not null;

-- ── user_identities (external provider linkage for task verification) ───────

create table public.user_identities (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete restrict,
  provider          public.identity_provider not null,
  provider_user_id  text,
  provider_username text,
  link_token        text,
  token_expires_at  timestamptz,
  linked_at         timestamptz,
  request_id        text,
  created_at        timestamptz not null default now()
);

comment on table public.user_identities is
  'External identity links (Telegram user id etc.). Created with a short-lived
   link_token by create_identity_link_token; the provider webhook binds the
   provider_user_id. Provider ids are never user-editable.';

create unique index user_identities_provider_user_uq
  on public.user_identities (provider, provider_user_id)
  where provider_user_id is not null;
create unique index user_identities_provider_owner_uq
  on public.user_identities (provider, user_id);
create unique index user_identities_link_token_uq
  on public.user_identities (link_token) where link_token is not null;

-- ── Write guards ─────────────────────────────────────────────────────────────
-- Mirrors the wallets/withdrawals convention: the flag is transaction-local
-- and only ever set inside a definer function.

create or replace function public.assert_reward_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.reward_write', true) is distinct from '1' then
    raise exception 'reward-domain writes must go through the reward RPCs';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger referrals_write_guard
  before insert or update or delete on public.referrals
  for each row execute function public.assert_reward_write();
create trigger referral_events_write_guard
  before insert or update or delete on public.referral_events
  for each row execute function public.assert_reward_write();
create trigger reward_grants_write_guard
  before insert or update or delete on public.reward_grants
  for each row execute function public.assert_reward_write();
create trigger reward_allocations_write_guard
  before insert or update or delete on public.reward_allocations
  for each row execute function public.assert_reward_write();
create trigger reward_receivables_write_guard
  before insert or update or delete on public.reward_receivables
  for each row execute function public.assert_reward_write();
create trigger reward_events_write_guard
  before insert or update or delete on public.reward_events
  for each row execute function public.assert_reward_write();
create trigger user_identities_write_guard
  before insert or update or delete on public.user_identities
  for each row execute function public.assert_reward_write();

-- ── handle_new_user — create the durable referral relationship ───────────────
-- profiles.referred_by stays as the attribution fast-path; referrals is the
-- authoritative reward relationship, inserted atomically with signup.

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  base_username text;
  candidate text;
  suffix int := 0;
  referrer uuid;
  v_ref_id uuid;
begin
  base_username := public.normalize_username(
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    )
  );
  if base_username is null or length(base_username) < 3 then
    base_username := 'user';
  end if;

  -- Resolve collisions deterministically: base, base2, base3, …
  candidate := base_username;
  while exists (select 1 from public.profiles where username = candidate)
        or exists (select 1 from public.reserved_usernames where username = candidate) loop
    suffix := suffix + 1;
    candidate := substring(base_username from 1 for greatest(1, 20 - length(suffix::text))) || suffix::text;
    if suffix > 9999 then
      candidate := 'user_' || replace(new.id::text, '-', '')::text;
      exit;
    end if;
  end loop;

  if new.raw_user_meta_data ? 'referral_code' then
    select id into referrer
      from public.profiles
      where referral_code = upper(new.raw_user_meta_data ->> 'referral_code');
  end if;

  insert into public.profiles (id, username, display_name, phone, referral_code, referred_by)
  values (
    new.id,
    candidate,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      candidate
    ),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    public.generate_referral_code(),
    referrer
  );

  -- Durable referral relationship (Phase 9). referrer can never equal new.id
  -- here (the profile does not exist yet), but the CHECK constraint stands as
  -- the structural guarantee.
  if referrer is not null then
    perform set_config('app.reward_write', '1', true);
    insert into public.referrals
      (referrer_id, referred_id, status, code_snapshot, attributed_via)
    select p.id, new.id, 'JOINED', p.referral_code, 'signup_metadata'
      from public.profiles p where p.id = referrer
    on conflict (referred_id) do nothing
    returning id into v_ref_id;
    if v_ref_id is not null then
      insert into public.referral_events (referral_id, event_type, actor_kind, metadata)
      values (v_ref_id, 'ATTRIBUTED', 'SYSTEM',
              jsonb_build_object('code', (select referral_code from public.profiles where id = referrer)));
    end if;
  end if;

  return new;
end;
$$;

-- ── Backfill: existing referred_by attributions become referral rows ─────────

select set_config('app.reward_write', '1', true);

insert into public.referrals (referrer_id, referred_id, status, code_snapshot, attributed_via)
select p.referred_by, p.id, 'JOINED', r.referral_code, 'backfill_0022'
  from public.profiles p
  join public.profiles r on r.id = p.referred_by
 where p.referred_by is not null
on conflict (referred_id) do nothing;

insert into public.referral_events (referral_id, event_type, actor_kind, metadata)
select rf.id, 'ATTRIBUTED', 'SYSTEM', jsonb_build_object('backfill', true)
  from public.referrals rf where rf.attributed_via = 'backfill_0022';

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.referrals           enable row level security;
alter table public.reward_grants       enable row level security;
alter table public.reward_allocations  enable row level security;
alter table public.reward_receivables  enable row level security;
alter table public.referral_events     enable row level security;
alter table public.reward_events       enable row level security;
alter table public.user_identities     enable row level security;

create policy referrals_select_own
  on public.referrals for select
  using (auth.uid() = referrer_id or auth.uid() = referred_id);
create policy referrals_select_admin
  on public.referrals for select using (public.is_admin());

create policy reward_grants_select_own
  on public.reward_grants for select using (auth.uid() = user_id);
create policy reward_grants_select_admin
  on public.reward_grants for select using (public.is_admin());

create policy reward_allocations_select_own
  on public.reward_allocations for select
  using (exists (select 1 from public.reward_grants g
                  where g.id = grant_id and g.user_id = auth.uid()));
create policy reward_allocations_select_admin
  on public.reward_allocations for select using (public.is_admin());

create policy reward_receivables_select_own
  on public.reward_receivables for select using (auth.uid() = user_id);
create policy reward_receivables_select_admin
  on public.reward_receivables for select using (public.is_admin());

create policy referral_events_select_own
  on public.referral_events for select
  using (exists (select 1 from public.referrals rf
                  where rf.id = referral_id
                    and (rf.referrer_id = auth.uid() or rf.referred_id = auth.uid())));
create policy referral_events_select_admin
  on public.referral_events for select using (public.is_admin());

create policy reward_events_select_own
  on public.reward_events for select
  using (exists (select 1 from public.reward_grants g
                  where g.id = grant_id and g.user_id = auth.uid()));
create policy reward_events_select_admin
  on public.reward_events for select using (public.is_admin());

create policy user_identities_select_own
  on public.user_identities for select using (auth.uid() = user_id);
create policy user_identities_select_admin
  on public.user_identities for select using (public.is_admin());
