-- RentBrown V2 — Phase 4B ledger schema
-- Double-entry ledger + wallet projection (docs/phases/PHASE_4A_LEDGER_WALLET_PROPOSAL.md).
--
--   journal_entries  — balanced, immutable transaction header (idempotent)
--   ledger_entries   — debit/credit lines (append-only)
--   ledger_accounts  — chart of accounts: per-user bucket accounts + system
--                      contra accounts
--   wallets          — materialized per-(user,currency) bucket balances;
--                      mutated ONLY inside post_journal under a row lock,
--                      always reconcilable against the ledger
--
-- Invariants (DB-enforced):
--   * every journal balances (ΣDR = ΣCR) and holds ≥2 lines — deferred trigger
--   * one currency per journal; every line's account matches it — trigger
--   * journal type permits only declared account/direction shapes — RPC check
--   * wallet buckets never negative — CHECK under FOR UPDATE lock
--   * one journal per idempotency_key — UNIQUE; replays return the original
--   * at most one reversal per journal — partial UNIQUE
--   * financial tables are insert-only — immutability trigger (even for
--     superusers); corrections are REVERSAL journals
--   * wallets writable only while app.ledger_posting=1 (set by post_journal)

create type public.ledger_account_kind as enum ('USER', 'SYSTEM');
create type public.wallet_bucket as enum ('AVAILABLE', 'RESERVED', 'BONUS', 'PENDING');
create type public.entry_direction as enum ('DEBIT', 'CREDIT');
create type public.system_account_kind as enum (
  'DEPOSITS_CLEARING', 'PAYOUTS_CLEARING', 'FEE_REVENUE',
  'INVESTMENT_PRINCIPAL_PAYABLE', 'INVESTMENT_PROFIT_PAYABLE',
  'REWARD_EXPENSE', 'ADJUSTMENTS'
);
create type public.journal_type as enum (
  'FUNDING_CREDIT', 'PENDING_CREDIT', 'PENDING_CONFIRM',
  'HOLD', 'HOLD_RELEASE', 'HOLD_DEBIT',
  'REFUND', 'ADMIN_ADJUSTMENT', 'REVERSAL',
  'INVESTMENT_DEBIT', 'MATURITY_CREDIT', 'EXTERNAL_PAYOUT',
  'REWARD_CREDIT', 'BONUS_RELEASE', 'FEE_DEBIT'
);

-- ── Ledger accounts ─────────────────────────────────────────────────────────

create table public.ledger_accounts (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,
  kind          public.ledger_account_kind not null,
  owner_user_id uuid references public.profiles (id) on delete restrict,
  bucket        public.wallet_bucket,
  system_kind   public.system_account_kind,
  currency      public.currency_code not null,
  created_at    timestamptz not null default now(),

  constraint ledger_accounts_shape check (
    (kind = 'USER'
       and owner_user_id is not null and bucket is not null and system_kind is null)
    or
    (kind = 'SYSTEM'
       and owner_user_id is null and bucket is null and system_kind is not null)
  )
);

comment on table public.ledger_accounts is
  'Chart of accounts. USER accounts map to wallet buckets (user:<uid>:<bucket>:<cur>);
   SYSTEM accounts are platform contra (system:<kind>:<cur>) and may run negative.';

create unique index ledger_accounts_user_uq
  on public.ledger_accounts (owner_user_id, bucket, currency)
  where kind = 'USER';
create unique index ledger_accounts_system_uq
  on public.ledger_accounts (system_kind, currency)
  where kind = 'SYSTEM';
create index ledger_accounts_owner_idx
  on public.ledger_accounts (owner_user_id, currency)
  where kind = 'USER';

-- ── Journal entries (transaction header) ────────────────────────────────────

create table public.journal_entries (
  id                   uuid primary key default gen_random_uuid(),
  reference            text not null unique,
  idempotency_key      text not null unique,
  journal_type         public.journal_type not null,
  currency             public.currency_code not null,
  reverses_journal_id  uuid references public.journal_entries (id),
  entity_type          text,
  entity_id            text,
  initiated_by         uuid references auth.users (id),
  actor_kind           text not null default 'SYSTEM'
                         check (actor_kind in ('INVESTOR', 'ADMIN', 'SYSTEM')),
  request_id           text,
  description          text not null default '',
  metadata             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now()
);

comment on table public.journal_entries is
  'Immutable balanced transaction header. Corrections are REVERSAL journals
   mirroring the original lines — history is never edited.';
comment on column public.journal_entries.idempotency_key is
  'Caller-supplied dedup key (dep:<ref>, wd:<id>, adj:<uuid>…). A retry returns
   the originally committed journal — never a second financial effect.';

create index journal_entries_entity_idx on public.journal_entries (entity_type, entity_id);
create index journal_entries_created_idx on public.journal_entries (created_at desc);
create index journal_entries_initiator_idx on public.journal_entries (initiated_by, created_at desc);
create unique index journal_entries_reversed_once_uq
  on public.journal_entries (reverses_journal_id)
  where reverses_journal_id is not null;

-- ── Ledger entries (journal lines) ──────────────────────────────────────────

create table public.ledger_entries (
  id                  bigint generated always as identity primary key,
  journal_id          uuid not null references public.journal_entries (id) on delete restrict,
  account_id          uuid not null references public.ledger_accounts (id) on delete restrict,
  direction           public.entry_direction not null,
  amount_minor        bigint not null check (amount_minor > 0),
  balance_after_minor bigint check (balance_after_minor is null or balance_after_minor >= 0),
  created_at          timestamptz not null default now()
);

comment on table public.ledger_entries is
  'Append-only journal lines. CREDIT increases a USER bucket, DEBIT decreases it;
   system accounts are contra. Currency is implied by journal + account.';
comment on column public.ledger_entries.balance_after_minor is
  'Display snapshot of the affected bucket after this line — never authoritative.
   Reconciliation derives balances from the ledger itself.';

create index ledger_entries_journal_idx on public.ledger_entries (journal_id);
create index ledger_entries_account_idx on public.ledger_entries (account_id, id);

-- ── Wallets (materialized projection — not an independent source of truth) ──

create table public.wallets (
  user_id        uuid not null references public.profiles (id) on delete restrict,
  currency       public.currency_code not null,
  available_minor bigint not null default 0 check (available_minor >= 0),
  reserved_minor  bigint not null default 0 check (reserved_minor >= 0),
  bonus_minor     bigint not null default 0 check (bonus_minor >= 0),
  pending_minor   bigint not null default 0 check (pending_minor >= 0),
  updated_at      timestamptz not null default now(),

  constraint wallets_pk primary key (user_id, currency)
);

comment on table public.wallets is
  'Per-(user,currency) bucket balances. Written only inside post_journal under
   a FOR UPDATE row lock; the ledger can always re-derive these values.';

create trigger wallets_updated_at
  before update on public.wallets
  for each row execute function public.touch_updated_at();

-- ── Guards ───────────────────────────────────────────────────────────────────

create or replace function public.assert_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'financial records are immutable — post a reversal journal instead';
end;
$$;

create trigger journal_entries_immutable
  before update or delete on public.journal_entries
  for each row execute function public.assert_immutable();
create trigger ledger_entries_immutable
  before update or delete on public.ledger_entries
  for each row execute function public.assert_immutable();
create trigger ledger_accounts_immutable
  before update or delete on public.ledger_accounts
  for each row execute function public.assert_immutable();

-- Wallet mutation is allowed only inside post_journal (flag set per-transaction).
create or replace function public.assert_wallet_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'wallet rows cannot be deleted';
  end if;
  if current_setting('app.ledger_posting', true) is distinct from '1' then
    raise exception 'wallets may only be mutated inside post_journal';
  end if;
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger wallets_guard
  before insert or update or delete on public.wallets
  for each row execute function public.assert_wallet_write();

-- Whole-journal validation, checked at COMMIT so multi-statement postings are
-- judged complete: ≥2 lines, ΣDR=ΣCR, every line's account matches the journal
-- currency.
create or replace function public.assert_journal_balanced(p_journal uuid)
returns void
language plpgsql stable
set search_path = ''
as $$
declare
  v_n int; v_dr bigint; v_cr bigint; v_bad int;
  v_cur public.currency_code;
begin
  select currency into v_cur from public.journal_entries where id = p_journal;
  if v_cur is null then
    raise exception 'journal % not found', p_journal;
  end if;

  select count(*),
         coalesce(sum(e.amount_minor) filter (where e.direction = 'DEBIT'), 0),
         coalesce(sum(e.amount_minor) filter (where e.direction = 'CREDIT'), 0)
    into v_n, v_dr, v_cr
    from public.ledger_entries e
   where e.journal_id = p_journal;

  if v_n < 2 then
    raise exception 'journal % has fewer than 2 lines', p_journal;
  end if;
  if v_dr <> v_cr then
    raise exception 'journal % is unbalanced: DR % <> CR %', p_journal, v_dr, v_cr;
  end if;

  select count(*) into v_bad
    from public.ledger_entries e
    join public.ledger_accounts a on a.id = e.account_id
   where e.journal_id = p_journal and a.currency <> v_cur;
  if v_bad > 0 then
    raise exception 'journal % has cross-currency lines', p_journal;
  end if;
end;
$$;

create or replace function public.trg_assert_journal_balanced()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_journal_balanced(new.id);
  return null;
end;
$$;

create constraint trigger journal_entries_balanced_check
  after insert on public.journal_entries
  deferrable initially deferred
  for each row execute function public.trg_assert_journal_balanced();

create or replace function public.trg_assert_line_balanced()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_journal_balanced(new.journal_id);
  return null;
end;
$$;

create constraint trigger ledger_entries_balanced_check
  after insert on public.ledger_entries
  deferrable initially deferred
  for each row execute function public.trg_assert_line_balanced();

-- ── Journal-type shape validation ────────────────────────────────────────────
-- A balanced journal is NOT automatically valid: each journal_type permits an
-- exact multiset of account/direction lines. Resolved lines are staged in the
-- transaction-scoped pg_temp.ledger_post_lines table by post_journal.

create or replace function public.assert_journal_shape(
  p_type public.journal_type,
  p_reverses uuid,
  p_self uuid
)
returns void
language plpgsql stable
set search_path = ''
as $$
declare
  v_usr_dr text[]; v_usr_cr text[];
  v_sys_dr text[]; v_sys_cr text[];
  v_lines int; v_owners int;
  v_orig_type public.journal_type;
  ok boolean;
begin
  select count(*), count(distinct owner) into v_lines, v_owners
    from pg_temp.ledger_post_lines;

  if v_lines < 2 then
    raise exception 'journal requires at least 2 lines';
  end if;
  if v_owners > 1 then
    raise exception 'a journal may touch at most one user wallet';
  end if;

  select coalesce(array_agg(bucket::text    order by bucket::text)    filter (where kind = 'USER'   and direction = 'DEBIT'),  '{}'),
         coalesce(array_agg(bucket::text    order by bucket::text)    filter (where kind = 'USER'   and direction = 'CREDIT'), '{}'),
         coalesce(array_agg(syskind::text   order by syskind::text)   filter (where kind = 'SYSTEM' and direction = 'DEBIT'),  '{}'),
         coalesce(array_agg(syskind::text   order by syskind::text)   filter (where kind = 'SYSTEM' and direction = 'CREDIT'), '{}')
    into v_usr_dr, v_usr_cr, v_sys_dr, v_sys_cr
    from pg_temp.ledger_post_lines;

  ok := case p_type
    -- external funds confirmed → spendable
    when 'FUNDING_CREDIT' then
      v_sys_dr = '{DEPOSITS_CLEARING}' and v_usr_cr = '{AVAILABLE}'
      and v_sys_cr = '{}' and v_usr_dr = '{}'
    -- refund of an external credit → spendable
    when 'REFUND' then
      v_sys_dr = '{DEPOSITS_CLEARING}' and v_usr_cr = '{AVAILABLE}'
      and v_sys_cr = '{}' and v_usr_dr = '{}'
    -- external funds seen, not yet confirmed
    when 'PENDING_CREDIT' then
      v_sys_dr = '{DEPOSITS_CLEARING}' and v_usr_cr = '{PENDING}'
      and v_sys_cr = '{}' and v_usr_dr = '{}'
    -- pending deposit confirmed → spendable
    when 'PENDING_CONFIRM' then
      v_usr_dr = '{PENDING}' and v_usr_cr = '{AVAILABLE}'
      and v_sys_dr = '{}' and v_sys_cr = '{}'
    -- commitment: available → reserved
    when 'HOLD' then
      v_usr_dr = '{AVAILABLE}' and v_usr_cr = '{RESERVED}'
      and v_sys_dr = '{}' and v_sys_cr = '{}'
    -- commitment released: reserved → available
    when 'HOLD_RELEASE' then
      v_usr_dr = '{RESERVED}' and v_usr_cr = '{AVAILABLE}'
      and v_sys_dr = '{}' and v_sys_cr = '{}'
    -- bonus becomes spendable
    when 'BONUS_RELEASE' then
      v_usr_dr = '{BONUS}' and v_usr_cr = '{AVAILABLE}'
      and v_sys_dr = '{}' and v_sys_cr = '{}'
    -- reserved funds consumed by an outgoing payout
    when 'HOLD_DEBIT' then
      v_usr_dr = '{RESERVED}' and v_sys_cr = '{PAYOUTS_CLEARING}'
      and v_sys_dr = '{}' and v_usr_cr = '{}'
    -- wallet-funded investment: reserved → principal payable
    when 'INVESTMENT_DEBIT' then
      v_usr_dr = '{RESERVED}' and v_sys_cr = '{INVESTMENT_PRINCIPAL_PAYABLE}'
      and v_sys_dr = '{}' and v_usr_cr = '{}'
    -- payout with optional fee split (gross reserved → net payout + fee revenue)
    when 'EXTERNAL_PAYOUT' then
      v_usr_dr = '{RESERVED}' and v_sys_cr <> '{}'
      and v_sys_cr <@ '{PAYOUTS_CLEARING,FEE_REVENUE}'::text[]
      and v_sys_dr = '{}' and v_usr_cr = '{}'
    -- maturity: payable(s) → user available (principal and/or profit legs)
    when 'MATURITY_CREDIT' then
      v_usr_cr = '{AVAILABLE}' and v_sys_dr <> '{}'
      and v_sys_dr <@ '{INVESTMENT_PRINCIPAL_PAYABLE,INVESTMENT_PROFIT_PAYABLE}'::text[]
      and v_sys_cr = '{}' and v_usr_dr = '{}'
    when 'REWARD_CREDIT' then
      v_sys_dr = '{REWARD_EXPENSE}' and v_usr_cr = '{BONUS}'
      and v_sys_cr = '{}' and v_usr_dr = '{}'
    when 'FEE_DEBIT' then
      v_usr_dr = '{AVAILABLE}' and v_sys_cr = '{FEE_REVENUE}'
      and v_sys_dr = '{}' and v_usr_cr = '{}'
    -- one user bucket line + ADJUSTMENTS contra, opposite directions
    when 'ADMIN_ADJUSTMENT' then
      v_lines = 2 and (
        (v_sys_dr = '{ADJUSTMENTS}' and array_length(v_usr_cr, 1) = 1
           and v_sys_cr = '{}' and v_usr_dr = '{}')
        or
        (v_sys_cr = '{ADJUSTMENTS}' and array_length(v_usr_dr, 1) = 1
           and v_sys_dr = '{}' and v_usr_cr = '{}')
      )
    else null
  end case;

  if p_type = 'REVERSAL' then
    if p_reverses is null then
      raise exception 'REVERSAL requires reverses_journal_id';
    end if;
    select journal_type into v_orig_type
      from public.journal_entries where id = p_reverses;
    if v_orig_type is null then
      raise exception 'journal % not found for reversal', p_reverses;
    end if;
    if v_orig_type = 'REVERSAL' then
      raise exception 'cannot reverse a REVERSAL journal';
    end if;
    if exists (select 1 from public.journal_entries
                where reverses_journal_id = p_reverses and id <> p_self) then
      raise exception 'journal % is already reversed', p_reverses;
    end if;
    -- provided lines must be the exact direction-mirror of the original
    ok := not exists (
        select account_id, direction, amount_minor from pg_temp.ledger_post_lines
        except
        select account_id,
               case direction when 'DEBIT' then 'CREDIT'::public.entry_direction else 'DEBIT'::public.entry_direction end,
               amount_minor
          from public.ledger_entries where journal_id = p_reverses
      ) and not exists (
        select account_id,
               case direction when 'DEBIT' then 'CREDIT'::public.entry_direction else 'DEBIT'::public.entry_direction end,
               amount_minor
          from public.ledger_entries where journal_id = p_reverses
        except
        select account_id, direction, amount_minor from pg_temp.ledger_post_lines
      );
  end if;

  if ok is distinct from true then
    raise exception 'journal type % does not permit this account/direction shape', p_type;
  end if;
end;
$$;

-- ── post_journal — the single financial write path ───────────────────────────
-- SERVICE-ROLE ONLY (grants in 0006). Atomic sequence:
--   idempotent journal insert → resolve/create accounts → shape validation →
--   wallet row upsert + FOR UPDATE lock → ordered bucket updates + line
--   inserts → deferred commit-time balance/currency trigger.
-- Any failure aborts the whole transaction, including lazy provisioning.

create or replace function public.post_journal(
  p_journal_type        public.journal_type,
  p_currency            public.currency_code,
  p_lines               jsonb,
  p_reference           text default null,
  p_idempotency_key     text default null,
  p_entity_type         text default null,
  p_entity_id           text default null,
  p_actor_kind          text default 'SYSTEM',
  p_initiated_by        uuid default null,
  p_request_id          text default null,
  p_description         text default '',
  p_metadata            jsonb default '{}'::jsonb,
  p_reverses_journal_id uuid default null
)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_j          public.journal_entries;
  v_line       record;
  v_key        text;
  v_owner      uuid;
  v_bucket     public.wallet_bucket;
  v_syskind    public.system_account_kind;
  v_account_id uuid;
  v_uid        uuid;
  v_delta      bigint;
  v_col        text;
  v_after      bigint;
  v_n          int;
  v_dr         bigint;
  v_cr         bigint;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency_key is required';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'p_lines must be a JSON array of at least 2 lines';
  end if;

  -- single-authority flag: wallets may only be written from here on
  perform set_config('app.ledger_posting', '1', true);

  -- Idempotent header insert. A retry (same key) returns the committed
  -- journal without re-posting a single line.
  insert into public.journal_entries
    (reference, idempotency_key, journal_type, currency, reverses_journal_id,
     entity_type, entity_id, initiated_by, actor_kind, request_id, description, metadata)
  values (
    coalesce(p_reference, 'JRN-' || upper(substr(md5(gen_random_uuid()::text), 1, 12))),
    p_idempotency_key, p_journal_type, p_currency, p_reverses_journal_id,
    p_entity_type, p_entity_id, p_initiated_by, p_actor_kind, p_request_id,
    p_description, p_metadata)
  on conflict (idempotency_key) do nothing
  returning * into v_j;

  if v_j.id is null then
    select * into v_j from public.journal_entries where idempotency_key = p_idempotency_key;
    return v_j;  -- replay: one financial effect, committed once
  end if;

  -- Staging for resolved lines (transaction-scoped).
  create temp table if not exists pg_temp.ledger_post_lines (
    seq         bigint generated always as identity,
    account_id  uuid not null,
    kind        public.ledger_account_kind not null,
    owner       uuid,
    bucket      public.wallet_bucket,
    syskind     public.system_account_kind,
    direction   public.entry_direction not null,
    amount_minor bigint not null
  ) on commit drop;
  delete from pg_temp.ledger_post_lines;

  -- Resolve + lazily provision accounts; keys are logical (no currency) —
  -- the journal currency selects the account, so cross-currency lines are
  -- structurally unreachable.
  for v_line in
    select * from jsonb_to_recordset(p_lines)
      as x(account_key text, direction public.entry_direction, amount_minor bigint)
  loop
    if v_line.amount_minor is null or v_line.amount_minor <= 0 then
      raise exception 'ledger amounts must be positive integers';
    end if;

    if v_line.account_key ~* '^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(available|reserved|bonus|pending)$' then
      v_owner   := split_part(v_line.account_key, ':', 2)::uuid;
      v_bucket  := upper(split_part(v_line.account_key, ':', 3))::public.wallet_bucket;
      v_syskind := null;
      v_key     := 'user:' || v_owner::text || ':' || lower(v_bucket::text) || ':' || p_currency::text;
      insert into public.ledger_accounts (key, kind, owner_user_id, bucket, currency)
        values (v_key, 'USER', v_owner, v_bucket, p_currency)
        on conflict (key) do nothing;
      select id into v_account_id from public.ledger_accounts where key = v_key;
    elsif v_line.account_key ~* '^system:[a-z_]+$' then
      v_syskind := upper(split_part(v_line.account_key, ':', 2))::public.system_account_kind;
      v_key     := 'system:' || lower(v_syskind::text) || ':' || p_currency::text;
      select id into v_account_id from public.ledger_accounts where key = v_key;
      if v_account_id is null then
        raise exception 'unknown system account: %', v_key;
      end if;
      v_owner := null; v_bucket := null;
    else
      raise exception 'invalid account key: %', v_line.account_key;
    end if;

    insert into pg_temp.ledger_post_lines
      (account_id, kind, owner, bucket, syskind, direction, amount_minor)
    values
      (v_account_id, case when v_owner is null then 'SYSTEM'::public.ledger_account_kind else 'USER'::public.ledger_account_kind end,
       v_owner, v_bucket, v_syskind, v_line.direction, v_line.amount_minor);
  end loop;

  -- Early balance check (deferred trigger re-verifies at COMMIT).
  select count(*),
         coalesce(sum(amount_minor) filter (where direction = 'DEBIT'), 0),
         coalesce(sum(amount_minor) filter (where direction = 'CREDIT'), 0)
    into v_n, v_dr, v_cr
    from pg_temp.ledger_post_lines;
  if v_dr <> v_cr then
    raise exception 'journal is unbalanced: DR % <> CR %', v_dr, v_cr;
  end if;

  -- Journal-type shape gate: balanced ≠ valid.
  perform public.assert_journal_shape(p_journal_type, p_reverses_journal_id, v_j.id);

  -- Wallet provisioning + serialization: lock the (user,currency) row for
  -- the rest of this transaction; concurrent postings queue here.
  select owner into v_uid from pg_temp.ledger_post_lines where owner is not null limit 1;
  if v_uid is not null then
    insert into public.wallets (user_id, currency)
      values (v_uid, p_currency)
      on conflict (user_id, currency) do nothing;
    perform 1 from public.wallets
      where user_id = v_uid and currency = p_currency
      for update;
  end if;

  -- Apply lines in caller order: USER lines move bucket columns and record
  -- the post-line snapshot; SYSTEM lines are contra-only.
  for v_line in select * from pg_temp.ledger_post_lines order by seq loop
    v_after := null;
    if v_line.kind = 'USER' then
      v_col   := lower(v_line.bucket::text) || '_minor';
      v_delta := case when v_line.direction = 'CREDIT'
                      then v_line.amount_minor else -v_line.amount_minor end;
      execute format(
        'update public.wallets set %I = %I + $1 where user_id = $2 and currency = $3 returning %I',
        v_col, v_col, v_col)
        using v_delta, v_uid, p_currency
        into v_after;  -- CHECK >= 0 rejects insufficient funds
    end if;
    insert into public.ledger_entries
      (journal_id, account_id, direction, amount_minor, balance_after_minor)
    values
      (v_j.id, v_line.account_id, v_line.direction, v_line.amount_minor, v_after);
  end loop;

  return v_j;
end;
$$;
