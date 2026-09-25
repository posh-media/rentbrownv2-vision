-- RentBrown V2 — Phase 4B ledger RLS + RPCs
-- Posture (same as 0003): least privilege. Clients get narrow SELECT policies;
-- zero client writes on every ledger table. All financial mutation flows
-- through post_journal (service-role only) or narrow gated definer RPCs.
--
-- finance.read roles: SUPPORT, FINANCE_ADMIN, SUPER_ADMIN
--   (matches the shared Permission map in @rentbrown/types)

alter table public.ledger_accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.ledger_entries  enable row level security;
alter table public.wallets         enable row level security;

revoke all on public.ledger_accounts from anon, authenticated;
revoke all on public.journal_entries from anon, authenticated;
revoke all on public.ledger_entries  from anon, authenticated;
revoke all on public.wallets         from anon, authenticated;

grant select on public.ledger_accounts to authenticated;
grant select on public.journal_entries to authenticated;
grant select on public.ledger_entries  to authenticated;
grant select on public.wallets         to authenticated;

-- Owner reads own rows; finance-read roles read everything.
create policy wallets_select_own
  on public.wallets for select to authenticated
  using (auth.uid() = user_id);
create policy wallets_admin_select
  on public.wallets for select to authenticated
  using (public.has_admin_role(array['SUPPORT','FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]));

create policy ledger_accounts_select_own
  on public.ledger_accounts for select to authenticated
  using (owner_user_id = auth.uid());
create policy ledger_accounts_admin_select
  on public.ledger_accounts for select to authenticated
  using (public.has_admin_role(array['SUPPORT','FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]));

create policy journal_entries_select_own
  on public.journal_entries for select to authenticated
  using (
    exists (
      select 1 from public.ledger_entries e
      join public.ledger_accounts a on a.id = e.account_id
      where e.journal_id = journal_entries.id
        and a.owner_user_id = auth.uid()
    )
  );
create policy journal_entries_admin_select
  on public.journal_entries for select to authenticated
  using (public.has_admin_role(array['SUPPORT','FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]));

create policy ledger_entries_select_own
  on public.ledger_entries for select to authenticated
  using (
    exists (
      select 1 from public.ledger_accounts a
      where a.id = ledger_entries.account_id
        and a.owner_user_id = auth.uid()
    )
  );
create policy ledger_entries_admin_select
  on public.ledger_entries for select to authenticated
  using (public.has_admin_role(array['SUPPORT','FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]));

-- No INSERT/UPDATE/DELETE policies or grants anywhere — financial history is
-- append-only and wallets are server-written.

-- ── admin_post_adjustment ────────────────────────────────────────────────────
-- The ONLY admin-facing money mutation: an immutable balanced ADMIN_ADJUSTMENT
-- journal (user bucket line + system ADJUSTMENTS contra) + audit_log row, all
-- in one transaction. FINANCE_ADMIN/SUPER_ADMIN only; reason is mandatory.
create or replace function public.admin_post_adjustment(
  p_user_id      uuid,
  p_currency     public.currency_code,
  p_bucket       public.wallet_bucket,
  p_amount_minor bigint,
  p_direction    public.entry_direction,  -- effect on the user's bucket
  p_reason       text,
  p_request_id   text default null,
  p_idempotency_key text default null
)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_j    public.journal_entries;
  v_role text;
begin
  v_role := public.current_admin_role()::text;
  if not public.has_admin_role(array['FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    raise exception 'not authorized to post financial adjustments';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'adjustment reason is required';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'adjustment amount must be a positive integer';
  end if;

  select * into v_j from public.post_journal(
    'ADMIN_ADJUSTMENT',
    p_currency,
    case p_direction
      when 'CREDIT' then jsonb_build_array(
        jsonb_build_object('account_key','system:adjustments','direction','DEBIT','amount_minor',p_amount_minor),
        jsonb_build_object('account_key','user:' || p_user_id::text || ':' || lower(p_bucket::text),'direction','CREDIT','amount_minor',p_amount_minor))
      else jsonb_build_array(
        jsonb_build_object('account_key','user:' || p_user_id::text || ':' || lower(p_bucket::text),'direction','DEBIT','amount_minor',p_amount_minor),
        jsonb_build_object('account_key','system:adjustments','direction','CREDIT','amount_minor',p_amount_minor))
    end,
    null,
    coalesce(p_idempotency_key, 'adj:' || gen_random_uuid()::text),
    'adjustment', p_user_id::text,
    'ADMIN', auth.uid(), p_request_id,
    'admin adjustment: ' || btrim(p_reason),
    jsonb_build_object('bucket', p_bucket, 'direction', p_direction, 'amount_minor', p_amount_minor, 'reason', p_reason)
  );

  insert into public.audit_log (actor_id, actor_role, action, entity_type, entity_id, result, request_id, metadata)
  values (auth.uid(), v_role, 'wallet.adjust', 'wallet', p_user_id::text || ':' || p_currency::text,
          'SUCCESS', p_request_id,
          jsonb_build_object('journal_id', v_j.id, 'bucket', p_bucket, 'direction', p_direction,
                             'amount_minor', p_amount_minor, 'reason', p_reason));
  return v_j;
end;
$$;

-- ── reverse_journal ──────────────────────────────────────────────────────────
-- Correction path: posts a REVERSAL journal whose lines mirror the original.
-- A journal may be reversed at most once — explicit pre-check + partial unique
-- index on reverses_journal_id as the concurrency backstop.
-- Callable by finance roles; under service_role (auth.uid() null) the gate
-- passes so providers/jobs can reverse without an admin grant.
create or replace function public.reverse_journal(
  p_journal_id uuid,
  p_reason     text,
  p_request_id text default null
)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orig  public.journal_entries;
  v_lines jsonb;
begin
  if auth.uid() is not null
     and not public.has_admin_role(array['FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    raise exception 'not authorized to reverse journals';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reversal reason is required';
  end if;

  select * into v_orig from public.journal_entries where id = p_journal_id;
  if not found then
    raise exception 'journal % not found', p_journal_id;
  end if;
  if v_orig.journal_type = 'REVERSAL' then
    raise exception 'cannot reverse a REVERSAL journal';
  end if;
  if exists (select 1 from public.journal_entries where reverses_journal_id = p_journal_id) then
    raise exception 'journal % already reversed', p_journal_id;
  end if;

  select jsonb_agg(jsonb_build_object(
           'account_key',
             case a.kind
               when 'USER'   then 'user:' || a.owner_user_id::text || ':' || lower(a.bucket::text)
               else 'system:' || lower(a.system_kind::text)
             end,
           'direction', case e.direction when 'DEBIT' then 'CREDIT' else 'DEBIT' end,
           'amount_minor', e.amount_minor)
         order by e.id)
    into v_lines
    from public.ledger_entries e
    join public.ledger_accounts a on a.id = e.account_id
   where e.journal_id = p_journal_id;

  return public.post_journal(
    'REVERSAL',
    v_orig.currency,
    v_lines,
    'RVS-' || v_orig.reference,
    'rev:' || v_orig.idempotency_key,
    v_orig.entity_type, v_orig.entity_id,
    case when auth.uid() is null then 'SYSTEM' else 'ADMIN' end,
    auth.uid(), p_request_id,
    'reversal of ' || v_orig.reference || ': ' || btrim(p_reason),
    jsonb_build_object('reverses', v_orig.id, 'reason', p_reason),
    v_orig.id
  );
end;
$$;

-- ── reconcile_wallets ────────────────────────────────────────────────────────
-- Ledger is truth; wallets are a projection. Returns one row per (user,
-- currency, bucket) where stored <> ledger-derived — empty means clean.
create or replace function public.reconcile_wallets(p_user_id uuid default null)
returns table (
  user_id       uuid,
  currency      public.currency_code,
  bucket        public.wallet_bucket,
  stored_minor  bigint,
  derived_minor bigint,
  diff_minor    bigint
)
language sql stable
security definer
set search_path = ''
as $$
  with derived as (
    select a.owner_user_id, a.currency, a.bucket,
           coalesce(sum(e.amount_minor) filter (where e.direction = 'CREDIT'), 0)
         - coalesce(sum(e.amount_minor) filter (where e.direction = 'DEBIT'), 0) as bal
      from public.ledger_accounts a
      left join public.ledger_entries e on e.account_id = a.id
     where a.kind = 'USER'
     group by a.owner_user_id, a.currency, a.bucket
  ),
  flat as (
    select w.user_id, w.currency, b.bucket,
           case b.bucket
             when 'AVAILABLE' then w.available_minor
             when 'RESERVED'  then w.reserved_minor
             when 'BONUS'     then w.bonus_minor
             else w.pending_minor
           end as stored
      from public.wallets w
      cross join unnest(array['AVAILABLE','RESERVED','BONUS','PENDING']::public.wallet_bucket[]) as b(bucket)
  )
  -- FULL JOIN so accounts without a wallet row (and vice versa) also surface.
  select coalesce(f.user_id, d.owner_user_id),
         coalesce(f.currency, d.currency),
         coalesce(f.bucket, d.bucket),
         coalesce(f.stored, 0), coalesce(d.bal, 0),
         coalesce(f.stored, 0) - coalesce(d.bal, 0)
    from flat f
    full join derived d
      on d.owner_user_id = f.user_id and d.currency = f.currency and d.bucket = f.bucket
   where (p_user_id is null or coalesce(f.user_id, d.owner_user_id) = p_user_id)
     and coalesce(f.stored, 0) <> coalesce(d.bal, 0)
     and (auth.uid() is null  -- service_role / direct SQL
          or public.has_admin_role(array['FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]))
   order by 1, 2, 3;
$$;

-- ── get_wallet_transactions ──────────────────────────────────────────────────
-- User-facing transaction feed: one row per ledger line on the caller's own
-- accounts, newest first. balance_after_minor is a display snapshot.
create or replace function public.get_wallet_transactions(
  p_limit     int default 50,
  p_before_id bigint default null
)
returns table (
  entry_id            bigint,
  journal_id          uuid,
  reference           text,
  journal_type        public.journal_type,
  bucket              public.wallet_bucket,
  direction           public.entry_direction,
  amount_minor        bigint,
  currency            public.currency_code,
  description         text,
  entity_type         text,
  entity_id           text,
  balance_after_minor bigint,
  occurred_at         timestamptz
)
language sql stable
security definer
set search_path = ''
as $$
  select e.id, j.id, j.reference, j.journal_type, a.bucket, e.direction,
         e.amount_minor, j.currency, j.description, j.entity_type, j.entity_id,
         e.balance_after_minor, e.created_at
    from public.ledger_entries e
    join public.ledger_accounts a on a.id = e.account_id
    join public.journal_entries j on j.id = e.journal_id
   where a.owner_user_id = auth.uid()
     and (p_before_id is null or e.id < p_before_id)
   order by e.id desc
   limit p_limit;
$$;

-- ── Function privileges ──────────────────────────────────────────────────────
-- post_journal and internals: service only. Definer helpers call it as owner;
-- revoking EXECUTE from clients prevents direct posting.
revoke execute on function public.post_journal(public.journal_type, public.currency_code, jsonb, text, text, text, text, text, uuid, text, text, jsonb, uuid) from public, anon, authenticated;
grant  execute on function public.post_journal(public.journal_type, public.currency_code, jsonb, text, text, text, text, text, uuid, text, text, jsonb, uuid) to service_role;

revoke execute on function public.assert_journal_shape(public.journal_type, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.assert_journal_balanced(uuid) from public, anon, authenticated;
revoke execute on function public.assert_immutable() from public, anon, authenticated;
revoke execute on function public.assert_wallet_write() from public, anon, authenticated;
revoke execute on function public.trg_assert_journal_balanced() from public, anon, authenticated;
revoke execute on function public.trg_assert_line_balanced() from public, anon, authenticated;

revoke execute on function public.admin_post_adjustment(uuid, public.currency_code, public.wallet_bucket, bigint, public.entry_direction, text, text, text) from public, anon;
revoke execute on function public.reverse_journal(uuid, text, text) from public, anon;
revoke execute on function public.reconcile_wallets(uuid) from public, anon;
revoke execute on function public.get_wallet_transactions(int, bigint) from public, anon;

grant execute on function public.admin_post_adjustment(uuid, public.currency_code, public.wallet_bucket, bigint, public.entry_direction, text, text, text) to authenticated, service_role;
grant execute on function public.reverse_journal(uuid, text, text) to authenticated, service_role;
grant execute on function public.reconcile_wallets(uuid) to authenticated, service_role;
grant execute on function public.get_wallet_transactions(int, bigint) to authenticated;
