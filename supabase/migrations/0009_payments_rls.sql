-- RentBrown V2 — Phase 5B payments RLS / grants / admin reads
--
-- Mirrors the Phase 4 posture:
--   * investors read only their own deposits/withdrawals (+ their event logs)
--   * finance roles read operational tables for reconciliation
--   * NO direct table writes for anyone — all mutations via definer RPCs
--   * provider intake + outbound outbox are admin-visible only (never expose
--     provider payloads or outbound URLs to investors)

-- ── RLS enable + policies ──────────────────────────────────────────────────

alter table public.deposits               enable row level security;
alter table public.deposit_events         enable row level security;
alter table public.payment_provider_events enable row level security;
alter table public.withdrawals            enable row level security;
alter table public.withdrawal_events      enable row level security;
alter table public.outbound_events        enable row level security;

-- deposits: owner read + finance read
create policy deposits_owner_read on public.deposits
  for select to authenticated using (user_id = auth.uid());
create policy deposits_finance_read on public.deposits
  for select to authenticated using (
    public.has_admin_role(array['SUPPORT','OPERATIONS_ADMIN','FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]));

-- deposit_events: owner read (via parent) + finance read
create policy deposit_events_owner_read on public.deposit_events
  for select to authenticated using (
    exists (select 1 from public.deposits d
             where d.id = deposit_id and d.user_id = auth.uid()));
create policy deposit_events_finance_read on public.deposit_events
  for select to authenticated using (
    public.has_admin_role(array['SUPPORT','OPERATIONS_ADMIN','FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]));

-- payment_provider_events: finance/ops only — provider payloads stay internal
create policy ppe_finance_read on public.payment_provider_events
  for select to authenticated using (
    public.has_admin_role(array['OPERATIONS_ADMIN','FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]));

-- withdrawals: owner read + finance read
create policy withdrawals_owner_read on public.withdrawals
  for select to authenticated using (user_id = auth.uid());
create policy withdrawals_finance_read on public.withdrawals
  for select to authenticated using (
    public.has_admin_role(array['SUPPORT','OPERATIONS_ADMIN','FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]));

-- withdrawal_events: owner read (via parent) + finance read
create policy withdrawal_events_owner_read on public.withdrawal_events
  for select to authenticated using (
    exists (select 1 from public.withdrawals w
             where w.id = withdrawal_id and w.user_id = auth.uid()));
create policy withdrawal_events_finance_read on public.withdrawal_events
  for select to authenticated using (
    public.has_admin_role(array['SUPPORT','OPERATIONS_ADMIN','FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]));

-- outbound_events: ops/finance only (outbound URLs + delivery metadata)
create policy outbound_finance_read on public.outbound_events
  for select to authenticated using (
    public.has_admin_role(array['OPERATIONS_ADMIN','FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]));

-- ── Table grants ────────────────────────────────────────────────────────────
-- Default privileges grant authenticated broad CRUD — strip it back to read
-- only. Financial writes happen inside definer functions (flag-gated).

revoke insert, update, delete on public.deposits                from authenticated, anon;
revoke insert, update, delete on public.deposit_events         from authenticated, anon;
revoke insert, update, delete on public.payment_provider_events from authenticated, anon;
revoke insert, update, delete on public.withdrawals            from authenticated, anon;
revoke insert, update, delete on public.withdrawal_events      from authenticated, anon;
revoke insert, update, delete on public.outbound_events        from authenticated, anon;

grant select on public.deposits                to authenticated;
grant select on public.deposit_events          to authenticated;
grant select on public.payment_provider_events to authenticated;
grant select on public.withdrawals             to authenticated;
grant select on public.withdrawal_events       to authenticated;
grant select on public.outbound_events         to authenticated;
grant usage  on sequence public.deposit_events_id_seq    to authenticated;
grant usage  on sequence public.withdrawal_events_id_seq to authenticated;

-- service_role needs select for RPC internals (definer functions don't need
-- table grants, but the service client reading results does).
grant select on public.deposits, public.deposit_events,
               public.payment_provider_events, public.withdrawals,
               public.withdrawal_events, public.outbound_events to service_role;

-- ── Function grants ─────────────────────────────────────────────────────────
-- Investor-facing:
revoke execute on function public.request_deposit(bigint, public.payment_provider, text, text) from public, anon;
grant  execute on function public.request_deposit(bigint, public.payment_provider, text, text) to authenticated;
revoke execute on function public.request_withdrawal(bigint, jsonb, text, text) from public, anon;
grant  execute on function public.request_withdrawal(bigint, jsonb, text, text) to authenticated;
revoke execute on function public.cancel_deposit(uuid, text) from public, anon;
grant  execute on function public.cancel_deposit(uuid, text) to authenticated;

-- Admin-facing (internal gates enforce role):
grant execute on function public.decide_withdrawal(uuid, text, text, text) to authenticated;
grant execute on function public.admin_resolve_deposit(uuid, text, text, text) to authenticated;

-- Service-only internals (edge functions / workers):
revoke execute on function public.apply_deposit_transition(uuid, public.deposit_status, public.domain_event_source, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.apply_withdrawal_transition(uuid, public.withdrawal_status, public.domain_event_source, text, text) from public, anon, authenticated;
revoke execute on function public.complete_deposit_init(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.fail_deposit_init(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.ingest_provider_event(public.payment_provider, text, text, boolean, text, uuid, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.mark_provider_event(uuid, public.provider_event_status, uuid, text) from public, anon, authenticated;
revoke execute on function public.confirm_deposit(uuid, bigint, public.currency_code, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.refund_deposit(uuid, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.expire_due_deposits() from public, anon, authenticated;
revoke execute on function public.claim_outbound_batch(int) from public, anon, authenticated;
revoke execute on function public.finish_outbound_attempt(uuid, boolean, int, text) from public, anon, authenticated;

grant execute on function public.apply_deposit_transition(uuid, public.deposit_status, public.domain_event_source, uuid, text, text) to service_role;
grant execute on function public.apply_withdrawal_transition(uuid, public.withdrawal_status, public.domain_event_source, text, text) to service_role;
grant execute on function public.complete_deposit_init(uuid, text, text, text, text) to service_role;
grant execute on function public.fail_deposit_init(uuid, text, text) to service_role;
grant execute on function public.ingest_provider_event(public.payment_provider, text, text, boolean, text, uuid, text, jsonb, text) to service_role;
grant execute on function public.mark_provider_event(uuid, public.provider_event_status, uuid, text) to service_role;
grant execute on function public.confirm_deposit(uuid, bigint, public.currency_code, text, text, uuid, text) to service_role;
grant execute on function public.refund_deposit(uuid, text, uuid, text) to service_role;
grant execute on function public.expire_due_deposits() to service_role;
grant execute on function public.claim_outbound_batch(int) to service_role;
grant execute on function public.finish_outbound_attempt(uuid, boolean, int, text) to service_role;

-- Config helpers are used internally; no client need.
revoke execute on function public.config_number(text) from public, anon, authenticated;
revoke execute on function public.config_bool(text)   from public, anon, authenticated;
revoke execute on function public.config_text(text)   from public, anon, authenticated;

-- ── admin_payment_overview ──────────────────────────────────────────────────
-- Operational payment summary for the admin control center. Secret VALUES are
-- never returned — only set/last4 metadata from admin_config.

create or replace function public.admin_payment_overview()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cfg  public.admin_config;
  out_ jsonb := '{}'::jsonb;
  k    text;
  v    text;
begin
  if not public.has_admin_role(array['SUPPORT','OPERATIONS_ADMIN','FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    raise exception 'not authorized';
  end if;

  -- pull every payment/withdrawal config into a flat key→value map
  select jsonb_object_agg(key, value #>> '{}') into out_
    from public.admin_config
   where is_active and (key like 'payment.%' or key like 'withdrawal.%');

  return jsonb_build_object(
    'config', coalesce(out_, '{}'::jsonb),
    'deposits', (select jsonb_object_agg(status, n) from
                   (select status::text as status, count(*)::int as n
                      from public.deposits group by status) s),
    'review', jsonb_build_object(
      'deposits_review_required',
        (select count(*)::int from public.deposits where status = 'REVIEW_REQUIRED'),
      'provider_events_unresolved',
        (select count(*)::int from public.payment_provider_events
          where status in ('FAILED','REVIEW','RECEIVED')),
      'withdrawals_open',
        (select count(*)::int from public.withdrawals
          where status in ('REQUESTED','UNDER_REVIEW','APPROVED','PROCESSING')),
      'outbound_pending',
        (select count(*)::int from public.outbound_events where status in ('QUEUED','FAILED'))));
end;
$$;

grant execute on function public.admin_payment_overview() to authenticated;

-- ── reconcile_payments (finance.reconcile) ──────────────────────────────────
-- Detective scan for Phase 5 anomalies. Returns anomaly rows; never mutates.

create or replace function public.reconcile_payments()
returns table (
  kind text,
  deposit_id uuid,
  provider_event_id uuid,
  detail text
)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_admin_role(array['FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    raise exception 'not authorized';
  end if;

  -- provider event that never matched a deposit
  return query
    select 'ORPHAN_EVENT'::text, null::uuid, e.id,
           'provider event ' || e.event_type || ' has no linked deposit'
      from public.payment_provider_events e
     where e.deposit_id is null and e.signature_valid;

  -- confirmed deposit without the funding journal
  return query
    select 'CONFIRMED_NO_JOURNAL', d.id, null::uuid,
           'CONFIRMED but funding_journal_id is null'
      from public.deposits d
     where d.status = 'CONFIRMED' and d.funding_journal_id is null;

  -- refunded deposit without a reversal journal
  return query
    select 'REFUND_NO_REVERSAL', d.id, null::uuid,
           'REFUNDED but reversal_journal_id is null'
      from public.deposits d
     where d.status = 'REFUNDED' and d.reversal_journal_id is null;

  -- confirmed amount mismatch
  return query
    select 'AMOUNT_MISMATCH', d.id, null::uuid,
           'confirmed ' || coalesce(d.confirmed_amount_minor::text,'?') || ' vs requested ' || d.amount_minor
      from public.deposits d
     where d.confirmed_amount_minor is not null
       and d.confirmed_amount_minor <> d.amount_minor;

  -- unresolved provider events
  return query
    select 'UNRESOLVED_EVENT', e.deposit_id, e.id,
           'status=' || e.status::text || ' err=' || coalesce(e.last_error,'-')
      from public.payment_provider_events e
     where e.status in ('FAILED','REVIEW')
        or (e.status = 'RECEIVED' and e.received_at < now() - interval '15 minutes');

  -- withdrawal lifecycle ↔ journal linkage inconsistencies
  return query
    select 'WITHDRAWAL_NO_HOLD', w.id, null::uuid,
           'active withdrawal without hold_journal_id'
      from public.withdrawals w
     where w.status in ('REQUESTED','UNDER_REVIEW','APPROVED','PROCESSING')
       and w.hold_journal_id is null;
end;
$$;

grant execute on function public.reconcile_payments() to authenticated;

-- ── admin list views (read RPCs) ─────────────────────────────────────────────
-- Finance review queue: review-required deposits + their events context.

create or replace function public.admin_list_review_deposits()
returns setof public.deposits
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_admin_role(array['FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    raise exception 'not authorized';
  end if;
  return query
    select * from public.deposits
     where status = 'REVIEW_REQUIRED'
     order by updated_at asc;
end;
$$;

grant execute on function public.admin_list_review_deposits() to authenticated;
