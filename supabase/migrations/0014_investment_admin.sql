-- 0014 — Phase 6B: admin investment operations + reconciliation.
--
-- Read/oversight RPCs for the ops surface. All mutations go through
-- apply_investment_transition (0013) — no direct investment edits.
-- Role gates reuse has_admin_role with the existing permission bundles.

-- ── admin_list_investments ──────────────────────────────────────────────────
-- Filterable list for the ops investments page. Read-only.

create or replace function public.admin_list_investments(
  p_status       public.investment_status default null,
  p_property_id  uuid default null,
  p_plan_id      uuid default null,
  p_round_id     uuid default null,
  p_user_id      uuid default null,
  p_limit        int default 50,
  p_offset       int default 0
)
returns table (
  id                  uuid,
  reference           text,
  user_id             uuid,
  user_display_name   text,
  round_id            uuid,
  plan_id             uuid,
  property_id         uuid,
  property_name       text,
  property_slug       text,
  plan_name           text,
  round_number        int,
  round_status        public.investment_round_status,
  seed_tag            text,
  funding_source      public.funding_source,
  status              public.investment_status,
  currency            public.currency_code,
  slots               int,
  principal_minor     bigint,
  roi_bps             int,
  expected_profit_minor bigint,
  maturity_value_minor bigint,
  activated_at        timestamptz,
  matures_at          timestamptz,
  payment_reference   text,
  created_at          timestamptz
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.has_admin_role(
       array['SUPPORT','OPERATIONS_ADMIN','FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    raise exception 'not authorized';
  end if;

  return query
  select i.id, i.reference, i.user_id, pr.display_name,
         i.round_id, i.plan_id, i.property_id,
         p.name, p.slug::text, pl.name, r.round_number, r.status, p.seed_tag,
         i.funding_source, i.status, i.currency, i.slots, i.principal_minor,
         i.roi_bps, i.expected_profit_minor, i.maturity_value_minor,
         i.activated_at, i.matures_at, i.payment_reference, i.created_at
    from public.investments i
    join public.profiles pr on pr.id = i.user_id
    join public.investment_rounds r on r.id = i.round_id
    join public.investment_plans pl on pl.id = i.plan_id
    join public.properties p on p.id = i.property_id
   where (p_status is null or i.status = p_status)
     and (p_property_id is null or i.property_id = p_property_id)
     and (p_plan_id is null or i.plan_id = p_plan_id)
     and (p_round_id is null or i.round_id = p_round_id)
     and (p_user_id is null or i.user_id = p_user_id)
   order by i.created_at desc
   limit p_limit offset p_offset;
end;
$$;

-- ── admin_investment_detail ─────────────────────────────────────────────────
-- Full snapshot + event timeline + funding journal reference for one row.

create or replace function public.admin_investment_detail(p_investment_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_inv public.investments;
begin
  if not public.has_admin_role(
       array['SUPPORT','OPERATIONS_ADMIN','FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    raise exception 'not authorized';
  end if;

  select * into v_inv from public.investments where id = p_investment_id;
  if v_inv.id is null then
    raise exception 'investment % not found', p_investment_id;
  end if;

  return jsonb_build_object(
    'investment', to_jsonb(v_inv) - 'idempotency_key',
    'idempotency_key_prefix', split_part(v_inv.idempotency_key, ':', 1) || ':…',
    'investor', (select jsonb_build_object('id', pr.id, 'display_name', pr.display_name)
                   from public.profiles pr where pr.id = v_inv.user_id),
    'property', (select to_jsonb(x) - 'address' - 'created_by'
                   from public.properties x where x.id = v_inv.property_id),
    'plan',     (select to_jsonb(x) from public.investment_plans x
                  where x.id = v_inv.plan_id),
    'round',    (select to_jsonb(x) from public.investment_rounds x
                  where x.id = v_inv.round_id),
    'events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at)
        from public.investment_events e
       where e.investment_id = v_inv.id), '[]'::jsonb),
    'journals', coalesce((
      select jsonb_agg(jsonb_build_object(
               'reference', j.reference, 'journal_type', j.journal_type,
               'currency', j.currency, 'created_at', j.created_at)
             order by j.created_at)
        from public.journal_entries j
       where j.entity_type = 'investment' and j.entity_id = v_inv.id::text),
      '[]'::jsonb));
end;
$$;

-- ── admin_mark_investment_review ────────────────────────────────────────────
-- The only admin mutation Phase 6 permits: ACTIVE → REVIEW_REQUIRED, audited.
-- Resolution back to ACTIVE (or other states) is an explicit second call.

create or replace function public.admin_mark_investment_review(
  p_investment_id uuid,
  p_reason        text,
  p_request_id    text default null
)
returns public.investment_status
language plpgsql security definer
set search_path = ''
as $$
declare
  v_to public.investment_status;
begin
  if not public.has_admin_role(
       array['FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    raise exception 'not authorized to mark investments for review';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a review reason is required';
  end if;

  v_to := public.apply_investment_transition(
    p_investment_id, 'REVIEW_REQUIRED', 'ADMIN', auth.uid(), p_request_id, p_reason);

  insert into public.audit_log
    (actor_id, actor_role, action, entity_type, entity_id, result, request_id, metadata)
  values
    (auth.uid(), 'FINANCE_ADMIN', 'INVESTMENT_REVIEW', 'investment',
     p_investment_id::text, 'SUCCESS', p_request_id,
     jsonb_build_object('reason', p_reason));

  return v_to;
end;
$$;

-- ── admin_resolve_investment_review ─────────────────────────────────────────
-- REVIEW_REQUIRED → a legitimate post-review status. Audited; the transition
-- map in apply_investment_transition still governs what is legal.

create or replace function public.admin_resolve_investment_review(
  p_investment_id uuid,
  p_to            public.investment_status,
  p_reason        text,
  p_request_id    text default null
)
returns public.investment_status
language plpgsql security definer
set search_path = ''
as $$
declare
  v_to public.investment_status;
begin
  if not public.has_admin_role(
       array['FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    raise exception 'not authorized to resolve investment reviews';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a resolution reason is required';
  end if;

  v_to := public.apply_investment_transition(
    p_investment_id, p_to, 'ADMIN', auth.uid(), p_request_id, p_reason);

  insert into public.audit_log
    (actor_id, actor_role, action, entity_type, entity_id, result, request_id, metadata)
  values
    (auth.uid(), 'FINANCE_ADMIN', 'INVESTMENT_REVIEW_RESOLVE', 'investment',
     p_investment_id::text, 'SUCCESS', p_request_id,
     jsonb_build_object('to', p_to, 'reason', p_reason));

  return v_to;
end;
$$;

-- ── reconcile_investments ───────────────────────────────────────────────────
-- Detection only — never mutates. FINANCE_ADMIN/SUPER_ADMIN or service_role.

create or replace function public.reconcile_investments()
returns table (
  check_name   text,
  entity_type  text,
  entity_id    text,
  detail       text
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.has_admin_role(
       array['FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    raise exception 'not authorized';
  end if;

  -- investment without a funding journal
  return query
    select 'investment_without_journal', 'investment', i.id::text,
           'ACTIVE investment has no INVESTMENT_DEBIT journal'
      from public.investments i
     where i.status = 'ACTIVE'
       and not exists (
         select 1 from public.journal_entries j
          where j.entity_type = 'investment' and j.entity_id = i.id::text
            and j.journal_type = 'INVESTMENT_DEBIT');

  -- funding journal without an investment
  return query
    select 'journal_without_investment', 'journal', j.id::text,
           'INVESTMENT_DEBIT journal references a missing investment'
      from public.journal_entries j
     where j.entity_type = 'investment' and j.journal_type = 'INVESTMENT_DEBIT'
       and not exists (
         select 1 from public.investments i where i.id::text = j.entity_id);

  -- journal amount != investment principal
  return query
    select 'principal_mismatch', 'investment', i.id::text,
           'INVESTMENT_DEBIT amount differs from principal_minor'
      from public.investments i
      join public.journal_entries j
        on j.entity_type = 'investment' and j.entity_id = i.id::text
       and j.journal_type = 'INVESTMENT_DEBIT'
      join public.ledger_entries e on e.journal_id = j.id
      join public.ledger_accounts a on a.id = e.account_id
     where i.status = 'ACTIVE' and a.kind = 'USER' and e.direction = 'DEBIT'
       and e.amount_minor <> i.principal_minor;

  -- round counters vs funded investment sum. Seeded catalogue rows are
  -- excluded: their allocated_slots simulate prior-round history and are
  -- deliberately not backed by investments.
  return query
    select 'capacity_mismatch', 'round', r.id::text,
           'allocated_slots differs from funded investment slot sum'
      from public.investment_rounds r
     where r.seed_tag is null
       and r.allocated_slots <> coalesce((
         select sum(i.slots) from public.investments i
          where i.round_id = r.id
            and i.status in ('ACTIVE','MATURITY_DUE','SETTLING','COMPLETED')), 0);

  -- duplicate idempotency or funding journals (should be impossible)
  return query
    select 'duplicate_idempotency', 'investment', idempotency_key,
           'idempotency key shared by multiple investments'
      from public.investments
     where idempotency_key is not null
     group by idempotency_key having count(*) > 1;

  return query
    select 'duplicate_funding_journal', 'investment', j.entity_id,
           'multiple INVESTMENT_DEBIT journals for one investment'
      from public.journal_entries j
     where j.entity_type = 'investment' and j.journal_type = 'INVESTMENT_DEBIT'
     group by j.entity_id having count(*) > 1;

  -- currency inconsistency across the snapshot chain
  return query
    select 'currency_mismatch', 'investment', i.id::text,
           'investment currency differs from round or plan currency'
      from public.investments i
      join public.investment_rounds r on r.id = i.round_id
      join public.investment_plans pl on pl.id = i.plan_id
     where i.currency <> r.currency or i.currency <> pl.currency;

  -- orphan events
  return query
    select 'orphan_event', 'investment_event', e.id::text,
           'event references a missing investment'
      from public.investment_events e
     where not exists (select 1 from public.investments i where i.id = e.investment_id);
end;
$$;

-- ── Privileges ──────────────────────────────────────────────────────────────

revoke execute on function public.admin_list_investments(public.investment_status, uuid, uuid, uuid, uuid, int, int) from public, anon;
revoke execute on function public.admin_investment_detail(uuid) from public, anon;
revoke execute on function public.admin_mark_investment_review(uuid, text, text) from public, anon;
revoke execute on function public.admin_resolve_investment_review(uuid, public.investment_status, text, text) from public, anon;
revoke execute on function public.reconcile_investments() from public, anon;

grant execute on function public.admin_list_investments(public.investment_status, uuid, uuid, uuid, uuid, int, int) to authenticated;
grant execute on function public.admin_investment_detail(uuid) to authenticated;
grant execute on function public.admin_mark_investment_review(uuid, text, text) to authenticated;
grant execute on function public.admin_resolve_investment_review(uuid, public.investment_status, text, text) to authenticated;
grant execute on function public.reconcile_investments() to authenticated;
