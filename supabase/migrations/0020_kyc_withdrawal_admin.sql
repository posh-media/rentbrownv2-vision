-- RentBrown V2 — Phase 8B part 3: KYC admin review + withdrawal admin reads
-- + Phase 8 reconciliation. All read paths reuse existing RBAC; financial
-- decisions still flow exclusively through decide_withdrawal (unchanged).

-- ── Role helpers ───────────────────────────────────────────────────────────

create or replace function public.is_kyc_reviewer()
returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_admin_role(
    array['KYC_REVIEWER','FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]);
$$;

create or replace function public.is_ops_reader()
returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_admin_role(
    array['SUPPORT','OPERATIONS_ADMIN','KYC_REVIEWER','FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]);
$$;

-- ── admin_list_kyc_cases ───────────────────────────────────────────────────
-- Queue filter: PENDING = SUBMITTED/UNDER_REVIEW · VERIFIED · REJECTED ·
-- NEEDS_ACTION = DRAFT. BVN is masked for everyone here — full value only via
-- admin_get_kyc_case for reviewer roles.

create or replace function public.admin_list_kyc_cases(
  p_queue  text default null,
  p_limit  int  default 50,
  p_offset int  default 0
)
returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_ops_reader() then
    raise exception 'not authorized to list kyc cases';
  end if;

  return query
    select jsonb_build_object(
      'id', s.id,
      'user_id', s.user_id,
      'user_display_name', p.display_name,
      'status', case s.status::text
                  when 'DRAFT' then 'IN_PROGRESS'
                  when 'SUBMITTED' then 'PENDING_REVIEW'
                  when 'UNDER_REVIEW' then 'PENDING_REVIEW'
                  else s.status::text end,
      'db_status', s.status::text,
      'queue', case s.status::text
                 when 'SUBMITTED' then 'PENDING'
                 when 'UNDER_REVIEW' then 'PENDING'
                 when 'VERIFIED' then 'VERIFIED'
                 when 'REJECTED' then 'REJECTED'
                 else 'NEEDS_ACTION' end,
      'attempt_no', s.attempt_no,
      'document_type', 'BVN',
      'document_number_masked', case when s.bvn is null then null else '***' || right(s.bvn, 4) end,
      'submitted_at', s.submitted_at,
      'updated_at', s.updated_at,
      'reviewer', (select display_name from public.profiles where id = s.reviewed_by),
      'decision_note', coalesce(s.rejection_reason, s.review_note))
    from public.kyc_submissions s
    join public.profiles p on p.id = s.user_id
    where s.status <> 'SUPERSEDED'
      and (p_queue is null or case s.status::text
            when 'SUBMITTED' then 'PENDING'
            when 'UNDER_REVIEW' then 'PENDING'
            when 'VERIFIED' then 'VERIFIED'
            when 'REJECTED' then 'REJECTED'
            else 'NEEDS_ACTION' end = p_queue)
    order by coalesce(s.submitted_at, s.updated_at) asc
    limit p_limit offset p_offset;
end;
$$;

-- ── admin_get_kyc_case — full BVN for reviewer roles only ──────────────────

create or replace function public.admin_get_kyc_case(p_submission_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.kyc_submissions;
begin
  if not public.is_ops_reader() then
    raise exception 'not authorized to view kyc cases';
  end if;
  select * into s from public.kyc_submissions where id = p_submission_id;
  if not found then
    raise exception 'kyc submission not found';
  end if;

  return jsonb_build_object(
    'id', s.id,
    'user_id', s.user_id,
    'user_display_name', (select display_name from public.profiles where id = s.user_id),
    'status', s.status::text,
    'attempt_no', s.attempt_no,
    'full_legal_name', s.full_legal_name,
    'gender', s.gender::text,
    -- full BVN restricted to reviewer roles; ops/support readers get masked
    'bvn', case when public.is_kyc_reviewer() then s.bvn
                else case when s.bvn is null then null else '***' || right(s.bvn, 4) end end,
    'poa_type', s.poa_type::text,
    'selfie_path', s.selfie_path,
    'poa_path', s.poa_path,
    'provider', s.provider::text,
    'provider_reference', s.provider_reference,
    'submitted_at', s.submitted_at,
    'reviewed_by', s.reviewed_by,
    'reviewed_at', s.reviewed_at,
    'review_note', s.review_note,
    'rejection_reason', s.rejection_reason,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'from', e.from_status::text, 'to', e.to_status::text,
               'source', e.source::text, 'note', e.note,
               'at', e.created_at, 'request_id', e.request_id)
             order by e.id)
       from public.kyc_events e where e.submission_id = s.id), '[]'::jsonb));
end;
$$;

-- ── admin_decide_kyc — APPROVE / REJECT (reviewer roles, audited) ──────────

create or replace function public.admin_decide_kyc(
  p_submission_id uuid,
  p_decision      text,          -- APPROVE | REJECT
  p_reason        text default null,
  p_request_id    text default null
)
returns public.kyc_submissions
language plpgsql security definer set search_path = '' as $$
declare
  s     public.kyc_submissions;
  v_uid uuid := auth.uid();
begin
  if not public.is_kyc_reviewer() then
    raise exception 'not authorized to review kyc submissions';
  end if;

  perform set_config('app.kyc_write', '1', true);
  select * into s from public.kyc_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'kyc submission not found';
  end if;

  if p_decision = 'APPROVE' then
    if s.status = 'SUBMITTED' then
      -- claim then verify (UNDER_REVIEW stamps reviewer intent)
      update public.kyc_submissions set reviewed_by = v_uid where id = s.id;
      perform public.apply_kyc_transition(s.id, 'UNDER_REVIEW', 'ADMIN', p_request_id, 'claimed for review');
      s.status := 'UNDER_REVIEW';
    elsif s.status <> 'UNDER_REVIEW' then
      raise exception 'cannot approve a % submission', s.status;
    end if;
    update public.kyc_submissions set
      reviewed_by = v_uid,
      review_note = p_reason,
      provider = 'MANUAL',
      provider_result = jsonb_build_object('method', 'MANUAL_REVIEW', 'reviewer', v_uid, 'decided_at', now())
    where id = s.id;
    perform public.apply_kyc_transition(s.id, 'VERIFIED', 'ADMIN', p_request_id, p_reason);
  elsif p_decision = 'REJECT' then
    if p_reason is null or btrim(p_reason) = '' then
      raise exception 'rejection reason is required';
    end if;
    if s.status = 'SUBMITTED' then
      update public.kyc_submissions set reviewed_by = v_uid where id = s.id;
      perform public.apply_kyc_transition(s.id, 'UNDER_REVIEW', 'ADMIN', p_request_id, 'claimed for review');
    elsif s.status <> 'UNDER_REVIEW' then
      raise exception 'cannot reject a % submission', s.status;
    end if;
    update public.kyc_submissions set
      reviewed_by = v_uid,
      rejection_reason = p_reason,
      provider = 'MANUAL',
      provider_result = jsonb_build_object('method', 'MANUAL_REVIEW', 'reviewer', v_uid, 'decided_at', now())
    where id = s.id;
    perform public.apply_kyc_transition(s.id, 'REJECTED', 'ADMIN', p_request_id, p_reason);
  else
    raise exception 'unknown kyc decision %', p_decision;
  end if;

  insert into public.audit_log (actor_id, actor_role, action, entity_type, entity_id, result, request_id, metadata)
  values (v_uid, public.current_admin_role()::text, 'kyc.' || lower(p_decision),
          'kyc_submission', p_submission_id::text, 'SUCCESS', p_request_id,
          jsonb_build_object('attempt_no', s.attempt_no));

  select * into s from public.kyc_submissions where id = p_submission_id;
  return s;
end;
$$;

-- ── admin_list_withdrawals / admin_get_withdrawal ──────────────────────────

create or replace function public.admin_list_withdrawals(
  p_status public.withdrawal_status default null,
  p_limit  int default 50,
  p_offset int default 0
)
returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_ops_reader() then
    raise exception 'not authorized to list withdrawals';
  end if;
  return query
    select jsonb_build_object(
      'id', w.id,
      'reference', w.reference,
      'user_id', w.user_id,
      'user_display_name', p.display_name,
      'kyc_status', coalesce((
          select case ks.status::text
                   when 'SUBMITTED' then 'PENDING_REVIEW'
                   when 'UNDER_REVIEW' then 'PENDING_REVIEW'
                   when 'DRAFT' then 'IN_PROGRESS'
                   else ks.status::text end
            from public.kyc_submissions ks
           where ks.user_id = w.user_id and ks.status <> 'SUPERSEDED'
           limit 1), 'NOT_STARTED'),
      'currency', w.currency::text,
      'amount_minor', w.amount_minor,
      'fee_minor', w.fee_minor,
      'net_minor', w.net_minor,
      'status', w.status::text,
      'destination_label', case
        when w.destination ->> 'bank_name' is not null
          then w.destination ->> 'bank_name' ||
               case when w.destination ->> 'account_number' is not null
                    then ' ····' || right(w.destination ->> 'account_number', 4) else '' end
        else 'Bank account' end,
      'requested_at', w.requested_at,
      'reviewed_at', w.reviewed_at,
      'reviewer', (select display_name from public.profiles where id = w.reviewed_by),
      'paid_at', w.paid_at,
      'rejected_at', w.rejected_at)
    from public.withdrawals w
    join public.profiles p on p.id = w.user_id
    where (p_status is null or w.status = p_status)
    order by w.requested_at desc
    limit p_limit offset p_offset;
end;
$$;

create or replace function public.admin_get_withdrawal(p_withdrawal_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  w public.withdrawals;
begin
  if not public.is_ops_reader() then
    raise exception 'not authorized to view withdrawals';
  end if;
  select * into w from public.withdrawals where id = p_withdrawal_id;
  if not found then
    raise exception 'withdrawal not found';
  end if;
  return jsonb_build_object(
    'id', w.id,
    'reference', w.reference,
    'user_id', w.user_id,
    'user_display_name', (select display_name from public.profiles where id = w.user_id),
    'currency', w.currency::text,
    'amount_minor', w.amount_minor,
    'fee_minor', w.fee_minor,
    'net_minor', w.net_minor,
    'destination', w.destination,
    'status', w.status::text,
    'hold_journal_id', w.hold_journal_id,
    'payout_journal_id', w.payout_journal_id,
    'release_journal_id', w.release_journal_id,
    'reviewed_by', w.reviewed_by,
    'requested_at', w.requested_at,
    'reviewed_at', w.reviewed_at,
    'paid_at', w.paid_at,
    'rejected_at', w.rejected_at,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'from', e.from_status::text, 'to', e.to_status::text,
               'source', e.source::text, 'note', e.note, 'at', e.created_at)
             order by e.id)
       from public.withdrawal_events e where e.withdrawal_id = w.id), '[]'::jsonb),
    'outbound', coalesce((
      select jsonb_agg(jsonb_build_object(
               'event_type', o.event_type, 'status', o.status::text,
               'attempts', o.attempts, 'delivered_at', o.delivered_at,
               'last_response_code', o.last_response_code) order by o.created_at)
       from public.outbound_events o
      where o.aggregate_type = 'withdrawal' and o.aggregate_id = w.id), '[]'::jsonb));
end;
$$;

-- ── reconcile_withdrawals — read-only anomaly detection ────────────────────

create or replace function public.reconcile_withdrawals()
returns table(check_name text, entity_type text, entity_id text, detail text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_stuck_hours numeric;
begin
  if not public.has_admin_role(array['FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    raise exception 'not authorized to reconcile withdrawals';
  end if;
  v_stuck_hours := coalesce(public.config_number('withdrawal.stuck_processing_hours'), 48);

  -- live withdrawals missing their hold journal
  return query
    select 'requested_without_hold', 'withdrawal', w.id::text,
           'status ' || w.status::text || ' has no hold journal'
      from public.withdrawals w
     where w.status in ('REQUESTED','UNDER_REVIEW','APPROVED','PROCESSING')
       and (w.hold_journal_id is null
            or not exists (select 1 from public.journal_entries j
                            where j.id = w.hold_journal_id and j.journal_type = 'HOLD'));

  -- hold journal not referenced by any withdrawal's hold_journal_id
  return query
    select 'orphan_hold', 'journal', j.id::text,
           'HOLD journal for withdrawal ' || j.entity_id || ' is not linked to a withdrawal'
      from public.journal_entries j
     where j.journal_type = 'HOLD' and j.entity_type = 'withdrawal'
       and not exists (select 1 from public.withdrawals w
                        where w.hold_journal_id = j.id);

  return query
    select 'completed_without_payout', 'withdrawal', w.id::text,
           'COMPLETED but no payout journal'
      from public.withdrawals w
     where w.status = 'COMPLETED'
       and (w.payout_journal_id is null
            or not exists (select 1 from public.journal_entries j
                            where j.id = w.payout_journal_id and j.journal_type = 'EXTERNAL_PAYOUT'));

  return query
    select 'rejected_with_unreleased_hold', 'withdrawal', w.id::text,
           'status ' || w.status::text || ' but hold was never released'
      from public.withdrawals w
     where w.status in ('REJECTED','FAILED') and w.release_journal_id is null;

  return query
    select 'duplicate_settlement', 'withdrawal', w.id::text,
           count(j.id)::text || ' payout journals'
      from public.withdrawals w
      join public.journal_entries j
        on j.entity_type = 'withdrawal' and j.entity_id = w.id::text
       and j.journal_type = 'EXTERNAL_PAYOUT'
     group by w.id having count(j.id) > 1;

  return query
    select 'amount_split_mismatch', 'withdrawal', w.id::text,
           'net ' || w.net_minor || ' + fee ' || w.fee_minor || ' != amount ' || w.amount_minor
      from public.withdrawals w
     where w.net_minor + w.fee_minor <> w.amount_minor;

  return query
    select 'fee_over_cap', 'withdrawal', w.id::text,
           'fee ' || w.fee_minor || ' exceeds cap for ' || w.currency::text
      from public.withdrawals w
     where w.fee_minor > coalesce(
            public.config_number('withdrawal.fee_cap_minor.' || w.currency::text),
            '9007199254740991'::numeric);

  return query
    select 'settlement_currency_mismatch', 'withdrawal', w.id::text,
           'withdrawal ' || w.currency::text || ' vs journal ' || j.currency::text
      from public.withdrawals w
      join public.journal_entries j on j.id = w.payout_journal_id
     where j.currency <> w.currency;

  return query
    select 'missing_outbox_event', 'withdrawal', w.id::text,
           'no withdrawal.requested outbound event'
      from public.withdrawals w
     where not exists (select 1 from public.outbound_events o
                        where o.idempotency_key = 'wd:' || w.id::text || ':requested');

  return query
    select 'stuck_processing', 'withdrawal', w.id::text,
           'PROCESSING for over ' || v_stuck_hours || 'h'
      from public.withdrawals w
     where w.status = 'PROCESSING'
       and w.updated_at < now() - make_interval(hours => v_stuck_hours::int);
end;
$$;

-- ── reconcile_kyc — read-only anomaly detection ─────────────────────────────

create or replace function public.reconcile_kyc()
returns table(check_name text, entity_type text, entity_id text, detail text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_sla numeric;
begin
  if not public.has_admin_role(array['FINANCE_ADMIN','SUPER_ADMIN','KYC_REVIEWER']::public.admin_role[]) then
    raise exception 'not authorized to reconcile kyc';
  end if;
  v_sla := coalesce(public.config_number('kyc.review_sla_hours'), 72);

  return query
    select 'profile_flag_without_verified_submission', 'profile', p.id::text,
           'kyc_verified=true but no VERIFIED submission exists'
      from public.profiles p
     where p.kyc_verified
       and not exists (select 1 from public.kyc_submissions s
                        where s.user_id = p.id and s.status = 'VERIFIED');

  return query
    select 'verified_submission_flag_unset', 'kyc_submission', s.id::text,
           'VERIFIED submission but profile flag is false'
      from public.kyc_submissions s
      join public.profiles p on p.id = s.user_id
     where s.status = 'VERIFIED' and not p.kyc_verified;

  return query
    select 'multiple_live_submissions', 'profile', s.user_id::text,
           count(*)::text || ' non-superseded submissions'
      from public.kyc_submissions s
     where s.status <> 'SUPERSEDED'
     group by s.user_id having count(*) > 1;

  return query
    select 'verified_missing_reviewer', 'kyc_submission', s.id::text,
           'VERIFIED without reviewed_by'
      from public.kyc_submissions s
     where s.status = 'VERIFIED' and s.reviewed_by is null;

  return query
    select 'missing_storage_object', 'kyc_submission', s.id::text,
           'referenced document object not found in storage'
      from public.kyc_submissions s
     where s.status <> 'SUPERSEDED'
       and ((s.selfie_path is not null and not exists (
              select 1 from storage.objects o
               where o.bucket_id = 'kyc-documents' and o.name = s.selfie_path))
         or (s.poa_path is not null and not exists (
              select 1 from storage.objects o
               where o.bucket_id = 'kyc-documents' and o.name = s.poa_path)));

  return query
    select 'orphan_storage_object', 'storage_object', o.name,
           'kyc-documents object not referenced by any submission'
      from storage.objects o
     where o.bucket_id = 'kyc-documents'
       and not exists (select 1 from public.kyc_submissions s
                        where s.selfie_path = o.name or s.poa_path = o.name);

  return query
    select 'stale_under_review', 'kyc_submission', s.id::text,
           'UNDER_REVIEW for over ' || v_sla || 'h'
      from public.kyc_submissions s
     where s.status = 'UNDER_REVIEW'
       and s.updated_at < now() - make_interval(hours => v_sla::int);
end;
$$;

-- ── Config seeds for reconciliation thresholds ─────────────────────────────

insert into public.admin_config (key, category, value_type, value, currency, description, is_active)
values
  ('withdrawal.stuck_processing_hours', 'withdrawals', 'INTEGER', '48', null,
   'Reconciliation threshold: PROCESSING withdrawals older than this are flagged.', true),
  ('kyc.review_sla_hours', 'kyc', 'INTEGER', '72', null,
   'Reconciliation threshold: UNDER_REVIEW submissions older than this are flagged.', true)
on conflict (key) do nothing;

-- ── Privileges ─────────────────────────────────────────────────────────────

revoke execute on function public.is_kyc_reviewer() from public, anon;
revoke execute on function public.is_ops_reader() from public, anon;
grant execute on function public.is_kyc_reviewer() to authenticated;
grant execute on function public.is_ops_reader() to authenticated;

revoke execute on function public.admin_list_kyc_cases(text, int, int) from public, anon;
revoke execute on function public.admin_get_kyc_case(uuid) from public, anon;
revoke execute on function public.admin_decide_kyc(uuid, text, text, text) from public, anon;
grant execute on function public.admin_list_kyc_cases(text, int, int) to authenticated;
grant execute on function public.admin_get_kyc_case(uuid) to authenticated;
grant execute on function public.admin_decide_kyc(uuid, text, text, text) to authenticated;

revoke execute on function public.admin_list_withdrawals(public.withdrawal_status, int, int) from public, anon;
revoke execute on function public.admin_get_withdrawal(uuid) from public, anon;
grant execute on function public.admin_list_withdrawals(public.withdrawal_status, int, int) to authenticated;
grant execute on function public.admin_get_withdrawal(uuid) to authenticated;

revoke execute on function public.reconcile_withdrawals() from public, anon;
revoke execute on function public.reconcile_kyc() from public, anon;
grant execute on function public.reconcile_withdrawals() to authenticated;
grant execute on function public.reconcile_kyc() to authenticated;
