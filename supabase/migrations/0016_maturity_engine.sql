-- 0016 — Phase 7B: investment maturity engine.
--
-- Implements docs/phases/PHASE_7A_MATURITY_ENGINE_ARCHITECTURE.md (D-7.x):
--   * mark_due_investments()  — ACTIVE → MATURITY_DUE sweep (matures_at <= now)
--   * claim_due_investments() — bounded batch claim incl. stale SETTLING
--   * settle_investment()     — single-transaction settlement:
--       claim → SETTLING → MATURITY_CREDIT journal → COMPLETED, atomically
--   * reconcile_investments() extended with maturity checks
--   * admin_config maturity policy keys
--   * durable outbound_events: investment.matured / .settled / .settlement_review
--
-- No new tables, enums, journal types, or system accounts. Settlement uses
-- the immutable investment snapshot only — never current plan/property data.

-- ── admin_config: maturity policy ───────────────────────────────────────────

insert into public.admin_config
  (key, category, value_type, value, description, is_active) values
  ('investment.maturity.enabled', 'investment', 'BOOLEAN', 'true'::jsonb,
   'Master switch for maturity processing (worker checks this each run).', true),
  ('investment.maturity.batch_limit', 'investment', 'INTEGER', '25'::jsonb,
   'Max investments marked/claimed per worker batch.', true),
  ('investment.maturity.stale_minutes', 'investment', 'INTEGER', '15'::jsonb,
   'A SETTLING investment older than this is reclaimable (journal-aware).', true)
on conflict (key) do nothing;

-- ── Internal: outbound event emitter ────────────────────────────────────────
-- Same durable-outbox contract as 0008 (rentbrown.outbound.v1). Written in the
-- same transaction as the state change; delivery never affects settlement.

create or replace function public.emit_investment_outbound(
  p_investment_id uuid,
  p_event_type    text,
  p_request_id    text default null,
  p_extra         jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_inv public.investments;
begin
  select * into v_inv from public.investments where id = p_investment_id;
  if v_inv.id is null then return; end if;

  perform set_config('app.outbound_write', '1', true);
  insert into public.outbound_events
    (event_type, aggregate_type, aggregate_id, payload, idempotency_key, request_id)
  values (
    p_event_type, 'investment', v_inv.id,
    jsonb_build_object(
      'spec', 'rentbrown.outbound.v1',
      'event_id', gen_random_uuid(),
      'event_type', p_event_type,
      'idempotency_key', 'inv:' || v_inv.id::text || ':' || p_event_type,
      'occurred_at', now(),
      'request_id', p_request_id,
      'data', jsonb_build_object(
        'investment_id', v_inv.id,
        'reference', v_inv.reference,
        'status', v_inv.status,
        'currency', v_inv.currency,
        'principal_minor', v_inv.principal_minor,
        'expected_profit_minor', v_inv.expected_profit_minor,
        'maturity_value_minor', v_inv.maturity_value_minor,
        'matures_at', v_inv.matures_at,
        'user', jsonb_build_object('id', v_inv.user_id)) || p_extra),
    'inv:' || v_inv.id::text || ':' || p_event_type,
    p_request_id)
  on conflict (idempotency_key) do nothing;
end;
$$;

-- ── mark_due_investments ────────────────────────────────────────────────────
-- ACTIVE → MATURITY_DUE for matures_at <= now(). Bounded batch, SKIP LOCKED,
-- governed transition (emits MATURED + durable outbound per row).

create or replace function public.mark_due_investments(
  p_limit      int default 100,
  p_request_id text default null
)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_n  int := 0;
begin
  for v_id in
    select id from public.investments
     where status = 'ACTIVE' and matures_at <= now()
     order by matures_at
     limit p_limit
     for update skip locked
  loop
    perform public.apply_investment_transition(
      v_id, 'MATURITY_DUE', 'SYSTEM', null, p_request_id, 'matures_at reached');
    perform public.emit_investment_outbound(v_id, 'investment.matured', p_request_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- ── claim_due_investments ───────────────────────────────────────────────────
-- Bounded batch of settleable ids: MATURITY_DUE plus SETTLING rows stale
-- beyond investment.maturity.stale_minutes (defense-in-depth; settle is
-- journal-aware so re-claiming is safe). Mutual exclusion is enforced by the
-- conditional UPDATE inside settle_investment; SKIP LOCKED here keeps two
-- concurrent workers from handing each other the same ids.

create or replace function public.claim_due_investments(
  p_limit int default 25
)
returns setof uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_stale interval;
begin
  v_stale := coalesce(public.config_number('investment.maturity.stale_minutes'), 15)
             * interval '1 minute';
  return query
    select i.id from public.investments i
     where i.status = 'MATURITY_DUE'
        or (i.status = 'SETTLING' and i.updated_at < now() - v_stale)
     order by i.matures_at
     limit p_limit
     for update skip locked;
end;
$$;

-- ── settle_investment ───────────────────────────────────────────────────────
-- Single atomic transaction:
--   claim (conditional status gate) → SETTLING → MATURITY_CREDIT journal →
--   COMPLETED → durable outbound. Any failure rolls back everything; the row
--   remains MATURITY_DUE/SETTLING and is retried by the next worker pass.
--
-- Journal-aware stale recovery (D-7.9 amendment): a SETTLING row whose
-- 'inv:mature:<id>' journal already exists is NEVER re-posted — the legs are
-- verified against the snapshot; on match the row is repaired to COMPLETED,
-- on mismatch it escalates to REVIEW_REQUIRED with a settlement_review
-- outbound event. A SETTLING row with no journal takes the normal path.

create or replace function public.settle_investment(
  p_investment_id uuid,
  p_request_id    text default null
)
returns public.investments
language plpgsql security definer
set search_path = ''
as $$
declare
  v_inv    public.investments;
  v_j      public.journal_entries;
  v_key    text;
  v_ok     boolean;
begin
  v_key := 'inv:mature:' || p_investment_id::text;

  -- Serialize all settlers on the investment row.
  select * into v_inv from public.investments
   where id = p_investment_id for update;
  if not found then
    raise exception 'investment % not found', p_investment_id;
  end if;

  if v_inv.status = 'COMPLETED' then
    return v_inv;  -- idempotent no-op
  end if;

  perform set_config('app.investment_write', '1', true);

  -- ── stale SETTLING: reconcile against an existing settlement journal ──
  if v_inv.status = 'SETTLING' then
    select * into v_j from public.journal_entries
     where idempotency_key = v_key;
    if v_j.id is not null then
      -- The journal is authoritative. Verify its legs match the snapshot:
      -- DR principal_payable=principal, DR profit_payable=profit,
      -- CR user available=maturity_value.
      v_ok :=
        exists (select 1 from public.ledger_entries e
                 join public.ledger_accounts a on a.id = e.account_id
                 where e.journal_id = v_j.id and a.kind = 'SYSTEM'
                   and a.system_kind = 'INVESTMENT_PRINCIPAL_PAYABLE'
                   and e.direction = 'DEBIT'
                   and e.amount_minor = v_inv.principal_minor)
        and exists (select 1 from public.ledger_entries e
                     join public.ledger_accounts a on a.id = e.account_id
                     where e.journal_id = v_j.id and a.kind = 'SYSTEM'
                       and a.system_kind = 'INVESTMENT_PROFIT_PAYABLE'
                       and e.direction = 'DEBIT'
                       and e.amount_minor = v_inv.expected_profit_minor)
        and exists (select 1 from public.ledger_entries e
                     join public.ledger_accounts a on a.id = e.account_id
                     where e.journal_id = v_j.id and a.kind = 'USER'
                       and a.owner_user_id = v_inv.user_id
                       and a.bucket = 'AVAILABLE' and e.direction = 'CREDIT'
                       and e.amount_minor = v_inv.maturity_value_minor);
      if v_ok then
        perform public.apply_investment_transition(
          v_inv.id, 'COMPLETED', 'SYSTEM', null, p_request_id,
          'settlement repaired from existing journal ' || v_j.reference);
        perform public.emit_investment_outbound(
          v_inv.id, 'investment.settled', p_request_id,
          jsonb_build_object('journal', v_j.reference, 'repaired', true));
      else
        perform public.apply_investment_transition(
          v_inv.id, 'REVIEW_REQUIRED', 'SYSTEM', null, p_request_id,
          'settlement journal ' || v_j.reference ||
          ' legs do not match investment snapshot');
        perform public.emit_investment_outbound(
          v_inv.id, 'investment.settlement_review', p_request_id,
          jsonb_build_object('journal', v_j.reference,
                             'reason', 'JOURNAL_SNAPSHOT_MISMATCH'));
      end if;
      select * into v_inv from public.investments where id = v_inv.id;
      return v_inv;
    end if;
    -- SETTLING with no journal: a prior attempt rolled back — normal path.
    -- (the claim transition below is a governed no-op when already SETTLING)
  end if;

  if v_inv.status not in ('MATURITY_DUE','SETTLING') then
    raise exception 'ERR_INVESTMENT_NOT_SETTLABLE';
  end if;

  -- ── claim: MATURITY_DUE → SETTLING (governed; SETTLEMENT_STARTED event) ──
  perform public.apply_investment_transition(
    v_inv.id, 'SETTLING', 'SYSTEM', null, p_request_id, 'settlement started');

  -- ── one MATURITY_CREDIT journal: both payables DR → user available CR ──
  -- Amounts come only from the immutable investment snapshot.
  v_j := public.post_journal(
    'MATURITY_CREDIT', v_inv.currency,
    jsonb_build_array(
      jsonb_build_object('account_key', 'system:investment_principal_payable',
                         'direction', 'DEBIT',
                         'amount_minor', v_inv.principal_minor),
      jsonb_build_object('account_key', 'system:investment_profit_payable',
                         'direction', 'DEBIT',
                         'amount_minor', v_inv.expected_profit_minor),
      jsonb_build_object('account_key', 'user:' || v_inv.user_id::text || ':available',
                         'direction', 'CREDIT',
                         'amount_minor', v_inv.maturity_value_minor)),
    null, v_key,
    'investment', v_inv.id::text, 'SYSTEM', v_inv.user_id, p_request_id,
    'Maturity settlement — ' || v_inv.reference,
    jsonb_build_object(
      'principal_minor', v_inv.principal_minor,
      'expected_profit_minor', v_inv.expected_profit_minor,
      'maturity_value_minor', v_inv.maturity_value_minor,
      'matures_at', v_inv.matures_at));

  -- ── SETTLING → COMPLETED (SETTLED event) ──
  perform public.apply_investment_transition(
    v_inv.id, 'COMPLETED', 'SYSTEM', null, p_request_id,
    'journal ' || v_j.reference);

  perform public.emit_investment_outbound(
    v_inv.id, 'investment.settled', p_request_id,
    jsonb_build_object('journal', v_j.reference));

  select * into v_inv from public.investments where id = v_inv.id;
  return v_inv;
end;
$$;

-- ── reconcile_investments: + maturity checks (D-7.10) ───────────────────────
-- Read-only detection; never mutates. Auto-retryable conditions (overdue /
-- stuck states) are distinct from financial anomalies (journal/amount/event).

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
declare
  v_stale interval;
  v_grace interval;
begin
  if auth.uid() is not null and not public.has_admin_role(
       array['FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    raise exception 'not authorized';
  end if;

  v_stale := coalesce(public.config_number('investment.maturity.stale_minutes'), 15)
             * interval '1 minute';
  v_grace := interval '1 hour';  -- detection lag tolerance for the 5-min worker

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

  -- ── Phase 7: maturity checks ────────────────────────────────────────────

  -- past maturity but never marked (worker lag or enabled=false)
  return query
    select 'overdue_active', 'investment', i.id::text,
           'ACTIVE with matures_at past the detection grace window'
      from public.investments i
     where i.status = 'ACTIVE' and i.matures_at < now() - v_grace;

  -- due but never claimed
  return query
    select 'stuck_maturity_due', 'investment', i.id::text,
           'MATURITY_DUE older than the stale threshold'
      from public.investments i
     where i.status = 'MATURITY_DUE' and i.updated_at < now() - v_stale;

  -- settling longer than the stale threshold
  return query
    select 'stuck_settling', 'investment', i.id::text,
           'SETTLING older than the stale threshold'
      from public.investments i
     where i.status = 'SETTLING' and i.updated_at < now() - v_stale;

  -- completed without its settlement journal
  return query
    select 'completed_without_settlement', 'investment', i.id::text,
           'COMPLETED investment has no MATURITY_CREDIT journal'
      from public.investments i
     where i.status = 'COMPLETED'
       and not exists (
         select 1 from public.journal_entries j
          where j.idempotency_key = 'inv:mature:' || i.id::text);

  -- settlement journal exists but investment never completed
  return query
    select 'settlement_incomplete', 'investment', i.id::text,
           'MATURITY_CREDIT journal exists but status is not COMPLETED'
      from public.investments i
      join public.journal_entries j
        on j.idempotency_key = 'inv:mature:' || i.id::text
     where i.status not in ('COMPLETED', 'REVIEW_REQUIRED', 'REFUNDED');

  -- more than one settlement journal per investment
  return query
    select 'duplicate_settlement_journal', 'investment', j.entity_id,
           'multiple MATURITY_CREDIT journals for one investment'
      from public.journal_entries j
     where j.entity_type = 'investment' and j.journal_type = 'MATURITY_CREDIT'
     group by j.entity_id having count(*) > 1;

  -- settlement legs vs the immutable snapshot
  return query
    select 'maturity_amount_mismatch', 'investment', i.id::text,
           'MATURITY_CREDIT legs differ from principal/profit/maturity snapshot'
      from public.investments i
      join public.journal_entries j
        on j.idempotency_key = 'inv:mature:' || i.id::text
     where not (
       exists (select 1 from public.ledger_entries e
                join public.ledger_accounts a on a.id = e.account_id
                where e.journal_id = j.id and a.kind = 'SYSTEM'
                  and a.system_kind = 'INVESTMENT_PRINCIPAL_PAYABLE'
                  and e.direction = 'DEBIT'
                  and e.amount_minor = i.principal_minor)
       and exists (select 1 from public.ledger_entries e
                    join public.ledger_accounts a on a.id = e.account_id
                    where e.journal_id = j.id and a.kind = 'SYSTEM'
                      and a.system_kind = 'INVESTMENT_PROFIT_PAYABLE'
                      and e.direction = 'DEBIT'
                      and e.amount_minor = i.expected_profit_minor)
       and exists (select 1 from public.ledger_entries e
                    join public.ledger_accounts a on a.id = e.account_id
                    where e.journal_id = j.id and a.kind = 'USER'
                      and a.owner_user_id = i.user_id and a.bucket = 'AVAILABLE'
                      and e.direction = 'CREDIT'
                      and e.amount_minor = i.maturity_value_minor));

  -- settlement journal posted in a different currency than the snapshot
  return query
    select 'settlement_currency_mismatch', 'investment', i.id::text,
           'MATURITY_CREDIT currency differs from investment currency'
      from public.investments i
      join public.journal_entries j
        on j.idempotency_key = 'inv:mature:' || i.id::text
     where j.currency <> i.currency;

  -- COMPLETED without a SETTLED event
  return query
    select 'missing_settled_event', 'investment', i.id::text,
           'COMPLETED investment has no SETTLED event'
      from public.investments i
     where i.status = 'COMPLETED'
       and not exists (
         select 1 from public.investment_events e
          where e.investment_id = i.id and e.event_type = 'SETTLED');

  -- MATURITY_DUE+ without a MATURED event
  return query
    select 'matured_event_missing', 'investment', i.id::text,
           'post-ACTIVE investment has no MATURED event'
      from public.investments i
     where i.status in ('MATURITY_DUE','SETTLING','COMPLETED')
       and not exists (
         select 1 from public.investment_events e
          where e.investment_id = i.id and e.event_type = 'MATURED');

  -- global payable drift: principal payable balance must equal outstanding
  -- principal of open investments (per currency)
  return query
    select 'principal_payable_drift', 'ledger_account', a.key,
           'investment_principal_payable balance != outstanding principal'
      from public.ledger_accounts a
     where a.system_kind = 'INVESTMENT_PRINCIPAL_PAYABLE'
       and coalesce((
             select coalesce(sum(e.amount_minor) filter (where e.direction = 'CREDIT'), 0)
                  - coalesce(sum(e.amount_minor) filter (where e.direction = 'DEBIT'), 0)
               from public.ledger_entries e where e.account_id = a.id), 0)
         <> coalesce((
             select sum(i.principal_minor) from public.investments i
              where i.currency = a.currency
                and i.status in ('ACTIVE','MATURITY_DUE','SETTLING')), 0);
end;
$$;

-- ── Privileges ──────────────────────────────────────────────────────────────
-- Worker/sweep RPCs are service-only; no authenticated/anonymous execution.

revoke execute on function public.emit_investment_outbound(uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.mark_due_investments(int, text) from public, anon, authenticated;
revoke execute on function public.claim_due_investments(int) from public, anon, authenticated;
revoke execute on function public.settle_investment(uuid, text) from public, anon, authenticated;

grant execute on function public.mark_due_investments(int, text) to service_role;
grant execute on function public.claim_due_investments(int) to service_role;
grant execute on function public.settle_investment(uuid, text) to service_role;
