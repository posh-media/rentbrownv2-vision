-- 0013 — Phase 6B: investment engine (wallet-funded purchases).
--
-- Implements docs/phases/PHASE_6A_INVESTMENT_ENGINE_ARCHITECTURE.md:
--   * investments.idempotency_key — scoped retry dedup
--   * write guards (app.investment_write) on investments / investment_events /
--     investment_rounds — no client or out-of-band writes
--   * apply_investment_transition() — governed status map (Phase 7 seam)
--   * request_investment() — the atomic wallet-funded purchase transaction
--   * investment_quote() — server-authoritative quote incl. wallet eligibility
--   * list_opportunities() — published catalogue read model for Explore
--
-- Lock order is total: round row (conditional UPDATE) → own wallet row
-- (inside post_journal). No two shared resources → no deadlock cycle.

-- ── Idempotency column ──────────────────────────────────────────────────────

alter table public.investments
  add column if not exists idempotency_key text;

create unique index if not exists investments_idempotency_key_uq
  on public.investments (idempotency_key)
  where idempotency_key is not null;

comment on column public.investments.idempotency_key is
  'Scoped retry key inv:create:<uid>:<client-key>. UNIQUE enforces one
   investment per logical request; replay returns the committed row.';

-- ── Write guard ─────────────────────────────────────────────────────────────
-- Mirrors assert_deposit_write (0008): every write to investment-domain tables
-- must come through a definer RPC that sets app.investment_write.

create or replace function public.assert_investment_write()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if current_setting('app.investment_write', true) is distinct from '1' then
    raise exception 'investment-domain writes must go through the investment RPCs';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger investments_write_guard
  before insert or update or delete on public.investments
  for each row execute function public.assert_investment_write();

create trigger investment_events_write_guard
  before insert or update or delete on public.investment_events
  for each row execute function public.assert_investment_write();

-- Round counter/status mutation is part of the same trust boundary.
create trigger investment_rounds_write_guard
  before insert or update or delete on public.investment_rounds
  for each row execute function public.assert_investment_write();

-- ── apply_investment_transition ─────────────────────────────────────────────
-- Governed status map. Phase 6 uses ACTIVE→REVIEW_REQUIRED only; the map is
-- the seam Phase 7's settlement engine drives.

create or replace function public.apply_investment_transition(
  p_investment_id uuid,
  p_to            public.investment_status,
  p_actor_kind    text,
  p_actor_id      uuid default null,
  p_request_id    text default null,
  p_note          text default null
)
returns public.investment_status
language plpgsql security definer
set search_path = ''
as $$
declare
  v   public.investments;
  ok  boolean;
  v_ev public.investment_event_type;
begin
  perform set_config('app.investment_write', '1', true);
  select * into v from public.investments where id = p_investment_id for update;
  if not found then
    raise exception 'investment % not found', p_investment_id;
  end if;
  if v.status = p_to then
    return v.status;  -- idempotent no-op
  end if;

  ok := case v.status
    when 'PAYMENT_PENDING' then p_to in ('ACTIVE','FAILED','REVIEW_REQUIRED')
    when 'ACTIVE'          then p_to in ('MATURITY_DUE','REVIEW_REQUIRED')
    when 'MATURITY_DUE'    then p_to in ('SETTLING','REVIEW_REQUIRED')
    when 'SETTLING'        then p_to in ('COMPLETED','FAILED','REVIEW_REQUIRED')
    when 'REVIEW_REQUIRED' then p_to in ('ACTIVE','SETTLING','FAILED','REFUNDED','COMPLETED')
    when 'FAILED'          then p_to = 'REVIEW_REQUIRED'
    when 'COMPLETED'       then p_to = 'REVIEW_REQUIRED'
    when 'REFUNDED'        then p_to = 'REVIEW_REQUIRED'
    else false
  end;

  if not ok then
    raise exception 'invalid investment transition: % → %', v.status, p_to;
  end if;

  update public.investments set
    status       = p_to,
    completed_at = case when p_to = 'COMPLETED' then now() else completed_at end
  where id = p_investment_id;

  v_ev := case p_to
    when 'PAYMENT_PENDING' then 'PAYMENT_PENDING'
    when 'ACTIVE'          then 'ACTIVATED'
    when 'MATURITY_DUE'    then 'MATURED'
    when 'SETTLING'        then 'SETTLEMENT_STARTED'
    when 'COMPLETED'       then 'SETTLED'
    when 'FAILED'          then 'FAILED'
    when 'REFUNDED'        then 'REFUNDED'
    when 'REVIEW_REQUIRED' then 'REVIEW_REQUIRED'
    else 'NOTE_ADDED'
  end;

  insert into public.investment_events
    (investment_id, event_type, actor_id, actor_kind, request_id, metadata)
  values
    (p_investment_id, v_ev, p_actor_id, p_actor_kind, p_request_id,
     case when p_note is null then '{}'::jsonb
          else jsonb_build_object('note', p_note) end);

  return p_to;
end;
$$;

-- ── request_investment ──────────────────────────────────────────────────────
-- Wallet-funded purchase, single atomic transaction. Ordering:
--   gates → idempotency → catalogue/slot validation → atomic capacity claim
--   (round row lock; WHERE re-checks status/window/capacity under READ
--   COMMITTED) → economics → HOLD → INVESTMENT_DEBIT → events → ACTIVE.

create or replace function public.request_investment(
  p_round_id        uuid,
  p_slots           int,
  p_idempotency_key text,
  p_funding_source  public.funding_source default 'WALLET',
  p_request_id      text default null
)
returns public.investments
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid       uuid;
  v_prof      public.profiles%rowtype;
  v_key       text;
  v_inv       public.investments;
  v_round     public.investment_rounds%rowtype;
  v_plan      public.investment_plans%rowtype;
  v_prop      public.properties%rowtype;
  v_used      int;
  v_principal bigint;
  v_profit    bigint;
  v_j         public.journal_entries;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  -- ── account gates (Phase 3A: ACTIVE + email_verified; no KYC/PIN here) ──
  select * into v_prof from public.profiles where id = v_uid;
  if v_prof.id is null or v_prof.account_status <> 'ACTIVE' then
    raise exception 'ERR_ACCOUNT_NOT_ACTIVE';
  end if;
  if not v_prof.email_verified then
    raise exception 'ERR_EMAIL_VERIFICATION_REQUIRED';
  end if;

  -- ── inputs ──
  if p_slots is null or p_slots <= 0 then
    raise exception 'ERR_INVALID_SLOTS';
  end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency_key is required';
  end if;
  if p_funding_source is distinct from 'WALLET' then
    raise exception 'ERR_FUNDING_SOURCE';
  end if;

  v_key := 'inv:create:' || v_uid::text || ':' || p_idempotency_key;

  -- ── idempotent replay ──
  select * into v_inv from public.investments where idempotency_key = v_key;
  if v_inv.id is not null then
    if v_inv.round_id = p_round_id and v_inv.slots = p_slots then
      return v_inv;  -- same logical request: committed row, no side effects
    end if;
    raise exception 'ERR_IDEMPOTENCY_CONFLICT';
  end if;

  -- ── cheap validations first — fail before taking the round lock ──
  select * into v_round from public.investment_rounds where id = p_round_id;
  if v_round.id is null then
    raise exception 'ERR_ROUND_NOT_FOUND';
  elsif v_round.status not in ('OPEN','NEARING_CAPACITY')
     or v_round.opens_at > now()
     or v_round.closes_at <= now() then
    raise exception 'ERR_ROUND_NOT_OPEN';
  end if;

  select * into v_plan from public.investment_plans where id = v_round.plan_id;
  select * into v_prop from public.properties where id = v_plan.property_id;
  if v_plan.id is null or v_plan.status <> 'PUBLISHED'
     or v_prop.id is null or v_prop.publication_status <> 'PUBLISHED' then
    raise exception 'ERR_PLAN_NOT_AVAILABLE';
  end if;
  if v_plan.investment_fee_bps <> 0 then
    -- D-6.4: fee-funded purchases are a future design; never silently process.
    raise exception 'ERR_FEE_UNSUPPORTED';
  end if;
  if v_round.currency <> v_plan.currency then
    raise exception 'ERR_CURRENCY';
  end if;

  if p_slots < v_plan.min_slots then
    raise exception 'ERR_INVALID_SLOTS';
  end if;
  if v_plan.max_slots_per_user is not null then
    -- limit is per-plan lifetime exposure (all statuses that consumed slots)
    select coalesce(sum(slots), 0) into v_used
      from public.investments
     where user_id = v_uid and plan_id = v_plan.id
       and status in ('PAYMENT_PENDING','ACTIVE','MATURITY_DUE','SETTLING','COMPLETED');
    if v_used + p_slots > v_plan.max_slots_per_user then
      raise exception 'ERR_INVESTMENT_LIMIT_EXCEEDED';
    end if;
  end if;

  -- Writes below (round counters, investment, events) all require this flag.
  perform set_config('app.investment_write', '1', true);

  -- ── atomic capacity claim — serializes all buyers on the round row ──
  update public.investment_rounds
     set allocated_slots = allocated_slots + p_slots,
         status = case
           when allocated_slots + reserved_slots + p_slots >= total_slots
             then 'SOLD_OUT'::public.investment_round_status else status end,
         closed_at = case
           when allocated_slots + reserved_slots + p_slots >= total_slots
             then now() else closed_at end
   where id = p_round_id
     and status in ('OPEN','NEARING_CAPACITY')
     and opens_at <= now()
     and closes_at > now()
     and allocated_slots + reserved_slots + p_slots <= total_slots
  returning * into v_round;

  if v_round.id is null then
    -- race loser or a status/window change since the pre-check
    select * into v_round from public.investment_rounds where id = p_round_id;
    if v_round.status in ('OPEN','NEARING_CAPACITY')
       and v_round.opens_at <= now() and v_round.closes_at > now() then
      raise exception 'ERR_ROUND_CAPACITY_EXCEEDED';
    else
      raise exception 'ERR_ROUND_NOT_OPEN';
    end if;
  end if;

  -- ── authoritative economics — integer minor units, floor truncation ──
  v_principal := p_slots::bigint * v_round.slot_price_minor;
  v_profit    := (v_principal * v_plan.roi_bps) / 10000;

  insert into public.investments (
    reference, user_id, round_id, plan_id, property_id, funding_source,
    slots, slot_price_minor, currency, principal_minor, roi_bps,
    duration_hours, expected_profit_minor, maturity_value_minor,
    status, activated_at, matures_at, idempotency_key
  ) values (
    'INV-' || upper(substr(md5(gen_random_uuid()::text), 1, 12)),
    v_uid, v_round.id, v_plan.id, v_prop.id, 'WALLET',
    p_slots, v_round.slot_price_minor, v_round.currency, v_principal,
    v_plan.roi_bps, v_plan.duration_hours, v_profit,
    v_principal + v_profit,
    'ACTIVE', now(), now() + v_plan.duration_hours * interval '1 hour',
    v_key
  ) returning * into v_inv;

  -- ── funding journals — wallet CHECK rejects insufficient funds ──
  -- Scoped handler: only the journal posts; a check_violation here is the
  -- wallet >= 0 guard, i.e. insufficient balance.
  begin
    v_j := public.post_journal(
      'HOLD', v_round.currency,
      jsonb_build_array(
        jsonb_build_object('account_key', 'user:' || v_uid::text || ':available',
                           'direction', 'DEBIT', 'amount_minor', v_principal),
        jsonb_build_object('account_key', 'user:' || v_uid::text || ':reserved',
                           'direction', 'CREDIT', 'amount_minor', v_principal)),
      null, 'inv:hold:' || v_inv.id::text,
      'investment', v_inv.id::text, 'SYSTEM', v_uid, p_request_id,
      'Investment hold — ' || v_inv.reference);

    v_j := public.post_journal(
      'INVESTMENT_DEBIT', v_round.currency,
      jsonb_build_array(
        jsonb_build_object('account_key', 'user:' || v_uid::text || ':reserved',
                           'direction', 'DEBIT', 'amount_minor', v_principal),
        jsonb_build_object('account_key', 'system:investment_principal_payable',
                           'direction', 'CREDIT', 'amount_minor', v_principal)),
      null, 'inv:fund:' || v_inv.id::text,
      'investment', v_inv.id::text, 'SYSTEM', v_uid, p_request_id,
      'Investment principal — ' || v_inv.reference);
  exception
    when check_violation then
      raise exception 'ERR_INSUFFICIENT_BALANCE';
  end;

  update public.investments set payment_reference = v_j.reference
   where id = v_inv.id
  returning * into v_inv;

  insert into public.investment_events
    (investment_id, event_type, actor_id, actor_kind, request_id, metadata)
  values
    (v_inv.id, 'CREATED', v_uid, 'INVESTOR', p_request_id,
     jsonb_build_object('slots', p_slots)),
    (v_inv.id, 'PAYMENT_CONFIRMED', null, 'SYSTEM', p_request_id,
     jsonb_build_object('journal', v_j.reference)),
    (v_inv.id, 'ACTIVATED', null, 'SYSTEM', p_request_id,
     jsonb_build_object('matures_at', v_inv.matures_at));

  return v_inv;
exception
  when unique_violation then
    -- Concurrent duplicate: a same-key request committed between our
    -- idempotency check and the INSERT. All our work (incl. the capacity
    -- increment) rolls back; return the winner's committed row.
    select * into v_inv from public.investments where idempotency_key = v_key;
    if v_inv.id is not null then
      if v_inv.round_id = p_round_id and v_inv.slots = p_slots then
        return v_inv;
      end if;
      raise exception 'ERR_IDEMPOTENCY_CONFLICT';
    end if;
    raise;  -- some other unique constraint — surface the original error
end;
$$;

-- ── investment_quote ────────────────────────────────────────────────────────
-- Server-authoritative quote. UI never multiplies money.

create or replace function public.investment_quote(
  p_round_id uuid,
  p_slots    int
)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid   uuid;
  v_round public.investment_rounds%rowtype;
  v_plan  public.investment_plans%rowtype;
  v_principal bigint;
  v_profit    bigint;
  v_avail_slots int;
  v_wallet bigint;
  v_open  boolean;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select * into v_round from public.investment_rounds where id = p_round_id;
  if v_round.id is null then
    raise exception 'ERR_ROUND_NOT_FOUND';
  end if;
  select * into v_plan from public.investment_plans where id = v_round.plan_id;
  if v_plan.id is null or v_plan.status <> 'PUBLISHED' then
    raise exception 'ERR_PLAN_NOT_AVAILABLE';
  end if;

  v_avail_slots := v_round.total_slots - v_round.allocated_slots - v_round.reserved_slots;
  v_open := v_round.status in ('OPEN','NEARING_CAPACITY')
        and v_round.opens_at <= now() and v_round.closes_at > now();
  v_principal := greatest(coalesce(p_slots, 0), 0)::bigint * v_round.slot_price_minor;
  v_profit := (v_principal * v_plan.roi_bps) / 10000;

  select coalesce(available_minor, 0) into v_wallet
    from public.wallets where user_id = v_uid and currency = v_round.currency;
  v_wallet := coalesce(v_wallet, 0);

  return jsonb_build_object(
    'round_id', v_round.id,
    'slots', p_slots,
    'slot_price_minor', v_round.slot_price_minor,
    'principal_minor', v_principal,
    'roi_bps', v_plan.roi_bps,
    'expected_profit_minor', v_profit,
    'maturity_value_minor', v_principal + v_profit,
    'fee_minor', (v_principal * v_plan.investment_fee_bps) / 10000,
    'currency', v_round.currency,
    'duration_hours', v_plan.duration_hours,
    'min_slots', v_plan.min_slots,
    'max_slots', coalesce(v_plan.max_slots_per_user, v_avail_slots),
    'available_slots', v_avail_slots,
    'round_status', v_round.status,
    'round_open', v_open,
    'projected_start_at', v_round.projected_start_at,
    'projected_maturity_at', v_round.projected_maturity_at,
    'funding_options', jsonb_build_array(
      jsonb_build_object(
        'source', 'WALLET',
        'available', v_open and v_wallet >= v_principal
                     and v_plan.investment_fee_bps = 0,
        'wallet_available_minor', v_wallet),
      jsonb_build_object('source', 'BANK_TRANSFER', 'available', false,
                         'reason', 'COMING_SOON'),
      jsonb_build_object('source', 'CARD', 'available', false,
                         'reason', 'COMING_SOON')),
    'quoted_at', now(),
    'expires_at', now() + interval '5 minutes');
end;
$$;

-- ── list_opportunities ──────────────────────────────────────────────────────
-- Composite read model for Explore/detail: published property + plan + any
-- non-archived round. Server computes derived fields (perSlot, availableSlots).

create or replace function public.list_opportunities()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  return (
    select coalesce(
      jsonb_agg(
      jsonb_build_object(
        'property', jsonb_build_object(
          'id', p.id, 'slug', p.slug, 'name', p.name, 'property_type', p.property_type,
          'summary', p.summary, 'description', p.description,
          'area', p.area, 'city', p.city, 'state', p.state,
          'location_label', p.location_label, 'images', p.images,
          'operator_name', p.operator_name,
          'operator_description', p.operator_description,
          'highlights', p.highlights, 'revenue_model', p.revenue_model,
          'publication_status', p.publication_status,
          'documents', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'id', d.id, 'document_type', d.document_type,
                     'title', d.title, 'summary', d.summary,
                     'status', d.status, 'version', d.version,
                     'reviewed_at', d.reviewed_at)
                   order by d.reviewed_at)
              from public.property_documents d where d.property_id = p.id), '[]'::jsonb),
          'updates', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'id', u.id, 'title', u.title, 'body', u.body,
                     'published_at', u.published_at)
                   order by u.published_at desc)
              from public.property_updates u where u.property_id = p.id), '[]'::jsonb)),
        'plan', jsonb_build_object(
          'id', pl.id, 'name', pl.name, 'description', pl.description,
          'currency', pl.currency, 'slot_price_minor', pl.slot_price_minor,
          'roi_bps', pl.roi_bps, 'duration_hours', pl.duration_hours,
          'min_slots', pl.min_slots, 'max_slots_per_user', pl.max_slots_per_user,
          'investment_fee_bps', pl.investment_fee_bps,
          'terms', pl.terms, 'risk_disclosures', pl.risk_disclosures,
          'status', pl.status),
        'round', jsonb_build_object(
          'id', r.id, 'round_number', r.round_number, 'status', r.status,
          'total_slots', r.total_slots, 'allocated_slots', r.allocated_slots,
          'reserved_slots', r.reserved_slots,
          'available_slots', r.total_slots - r.allocated_slots - r.reserved_slots,
          'allocated_pct', round(((r.allocated_slots + r.reserved_slots)::numeric
                                  / r.total_slots) * 100),
          'opens_at', r.opens_at, 'closes_at', r.closes_at,
          'projected_start_at', r.projected_start_at,
          'projected_maturity_at', r.projected_maturity_at),
        'per_slot', jsonb_build_object(
          'principal_minor', r.slot_price_minor,
          'expected_profit_minor', (r.slot_price_minor * pl.roi_bps) / 10000,
          'maturity_value_minor',
            r.slot_price_minor + (r.slot_price_minor * pl.roi_bps) / 10000))
      order by r.opens_at desc),
      '[]'::jsonb)
    from public.properties p
    join public.investment_plans pl
      on pl.property_id = p.id and pl.status = 'PUBLISHED'
    join public.investment_rounds r
      on r.plan_id = pl.id
     and r.status in ('SCHEDULED','OPEN','NEARING_CAPACITY','SOLD_OUT')
   where p.publication_status = 'PUBLISHED');
end;
$$;

revoke execute on function public.assert_investment_write() from public, anon, authenticated;
revoke execute on function public.apply_investment_transition(uuid, public.investment_status, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.request_investment(uuid, int, text, public.funding_source, text) from public, anon;
revoke execute on function public.investment_quote(uuid, int) from public, anon;
revoke execute on function public.list_opportunities() from public, anon;

grant execute on function public.apply_investment_transition(uuid, public.investment_status, text, uuid, text, text) to service_role;
grant execute on function public.request_investment(uuid, int, text, public.funding_source, text) to authenticated;
grant execute on function public.investment_quote(uuid, int) to authenticated;
grant execute on function public.list_opportunities() to authenticated;
