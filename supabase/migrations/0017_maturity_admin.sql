-- 0017 — Phase 7B: admin maturity operations.
--
--   * admin_retry_settlement — audited FINANCE_ADMIN retry that delegates to
--     the same settle_investment path the worker uses (one code path for
--     automatic and manual settlement; journal idempotency still applies).
--   * admin_mark_investment_review extended: marking a settlement-state
--     investment emits a durable investment.settlement_review outbox row.
--
-- Journal corrections use the existing reverse_journal (0006) — no new
-- correction mechanism.

-- ── admin_retry_settlement ──────────────────────────────────────────────────
-- Retries settlement for MATURITY_DUE / stale-SETTLING rows. Audited. Never
-- posts a second settlement journal — settle_investment is journal-aware and
-- 'inv:mature:<id>' is unique. Any other status is rejected by
-- settle_investment's claim gate.

create or replace function public.admin_retry_settlement(
  p_investment_id uuid,
  p_reason        text,
  p_request_id    text default null
)
returns public.investments
language plpgsql security definer
set search_path = ''
as $$
declare
  v_inv public.investments;
begin
  if not public.has_admin_role(
       array['FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    raise exception 'not authorized to retry settlement';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a retry reason is required';
  end if;

  v_inv := public.settle_investment(p_investment_id, p_request_id);

  insert into public.audit_log
    (actor_id, actor_role, action, entity_type, entity_id, result, request_id, metadata)
  values
    (auth.uid(), 'FINANCE_ADMIN', 'SETTLEMENT_RETRY', 'investment',
     p_investment_id::text, 'SUCCESS', p_request_id,
     jsonb_build_object('reason', p_reason, 'status', v_inv.status));

  return v_inv;
end;
$$;

-- ── admin_mark_investment_review (extended) ─────────────────────────────────
-- Identical behavior to 0014, plus: marking a settlement-state investment
-- (MATURITY_DUE / SETTLING) emits a durable settlement_review outbound event
-- in the same transaction so ops/webhook consumers learn promptly.

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
  v_to     public.investment_status;
  v_prior  public.investment_status;
begin
  if not public.has_admin_role(
       array['FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    raise exception 'not authorized to mark investments for review';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a review reason is required';
  end if;

  select status into v_prior from public.investments where id = p_investment_id;

  v_to := public.apply_investment_transition(
    p_investment_id, 'REVIEW_REQUIRED', 'ADMIN', auth.uid(), p_request_id, p_reason);

  insert into public.audit_log
    (actor_id, actor_role, action, entity_type, entity_id, result, request_id, metadata)
  values
    (auth.uid(), 'FINANCE_ADMIN', 'INVESTMENT_REVIEW', 'investment',
     p_investment_id::text, 'SUCCESS', p_request_id,
     jsonb_build_object('reason', p_reason));

  if v_prior in ('MATURITY_DUE','SETTLING') then
    perform public.emit_investment_outbound(
      p_investment_id, 'investment.settlement_review', p_request_id,
      jsonb_build_object('reason', p_reason, 'prior_status', v_prior));
  end if;

  return v_to;
end;
$$;

-- ── Privileges ──────────────────────────────────────────────────────────────

revoke execute on function public.admin_retry_settlement(uuid, text, text) from public, anon;
grant execute on function public.admin_retry_settlement(uuid, text, text) to authenticated;
