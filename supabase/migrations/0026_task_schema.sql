-- 0026 — Phase 9B part 5: task rewards schema + claim/verification RPCs.
--
-- Task model per 9A §10–11:
--   reward_tasks        — configured task catalogue (DRAFT→PUBLISHED→PAUSED→ARCHIVED)
--   task_requirements   — per-task legs (telegram membership / whatsapp manual /
--                         app action / manual evidence)
--   task_claims         — a user's claim attempt; one open claim per task+user
--   task_claim_legs     — per-requirement verification record
--   task_events         — admin task lifecycle audit
--   task_claim_events   — claim lifecycle audit
--
-- Verification model:
--   TELEGRAM_MEMBERSHIP — automated: telegram-webhook links the identity, the
--                         task-claim-verifier worker calls getChatMember.
--   WHATSAPP_MEMBERSHIP — manual admin review with evidence (no reliable API).
--   APP_ACTION          — evaluated in-SQL at claim time (deposit/investment/KYC).
--   MANUAL_EVIDENCE     — user evidence + admin review.
-- Rewards mint through the same issue_reward_grant engine (kind='TASK').

-- ── Enums ────────────────────────────────────────────────────────────────────

create type public.task_status as enum ('DRAFT','PUBLISHED','PAUSED','ARCHIVED');
create type public.claim_policy as enum ('ONE_TIME','REPEATABLE');
create type public.requirement_kind as enum
  ('TELEGRAM_MEMBERSHIP','WHATSAPP_MEMBERSHIP','APP_ACTION','MANUAL_EVIDENCE','EXTERNAL_WEBHOOK');
create type public.task_claim_status as enum
  ('PENDING','VERIFYING','MANUAL_REVIEW','REWARDED','REJECTED','EXPIRED');
create type public.task_leg_status as enum
  ('PENDING','VERIFYING','MANUAL_REVIEW','VERIFIED','FAILED','EXPIRED');

-- ── Tables ───────────────────────────────────────────────────────────────────

create table public.reward_tasks (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  title               text not null,
  description         text not null default '',
  status              public.task_status not null default 'DRAFT',
  reward_amount_minor bigint not null check (reward_amount_minor > 0),
  reward_currency     public.currency_code not null default 'NGN',
  claim_policy        public.claim_policy not null default 'ONE_TIME',
  max_claims          int not null default 1 check (max_claims > 0),
  eligibility         jsonb not null default '{}'::jsonb,
  starts_at           timestamptz,
  ends_at             timestamptz,
  version             int not null default 1,
  published_at        timestamptz,
  published_by        uuid references auth.users (id),
  created_by          uuid references auth.users (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.reward_tasks is
  'Configurable task catalogue. status DRAFT hides the task entirely;
   reward_amount_minor/reward_currency/claim_policy freeze on publish —
   further edits require pause/unpublish (audited via task_events).';
comment on column public.reward_tasks.eligibility is
  'Server-evaluated gates: {"requires_deposit":true,"requires_investment":true,
   "requires_kyc":true,"min_account_age_hours":N}. Unknown keys are ignored.';

create trigger reward_tasks_updated_at
  before update on public.reward_tasks
  for each row execute function public.touch_updated_at();

create table public.task_requirements (
  id             uuid primary key default gen_random_uuid(),
  task_id        uuid not null references public.reward_tasks (id) on delete cascade,
  kind           public.requirement_kind not null,
  config         jsonb not null default '{}'::jsonb,
  required       boolean not null default true,
  position       int not null default 0,
  created_at     timestamptz not null default now()
);

comment on table public.task_requirements is
  'Per-task verification legs. config is provider-specific:
   TELEGRAM_MEMBERSHIP {chat_id, invite_url, instructions};
   WHATSAPP_MEMBERSHIP {invite_url, instructions} (manual evidence);
   APP_ACTION {check: has_deposit|has_investment|has_kyc|has_referral};
   MANUAL_EVIDENCE {instructions, evidence_fields[]}.';
create index task_requirements_task_idx on public.task_requirements (task_id, position);

create table public.task_claims (
  id               uuid primary key default gen_random_uuid(),
  task_id          uuid not null references public.reward_tasks (id) on delete restrict,
  user_id          uuid not null references public.profiles (id) on delete restrict,
  status           public.task_claim_status not null default 'PENDING',
  attempt_no       int not null default 1,
  evidence         jsonb not null default '{}'::jsonb,
  claim_deadline   timestamptz,
  reward_grant_id  uuid references public.reward_grants (id) on delete restrict,
  idempotency_key  text not null unique,
  resolved_at      timestamptz,
  reviewed_by      uuid references auth.users (id),
  request_id       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.task_claims is
  'A user''s claim attempt on a task. Open statuses are PENDING/VERIFYING/
   MANUAL_REVIEW — the partial unique index serializes one open claim per
   task+user; retries after EXPIRED/REJECTED are new rows.';

-- one open claim per task+user at a time
create unique index task_claims_open_uq
  on public.task_claims (task_id, user_id)
  where status in ('PENDING','VERIFYING','MANUAL_REVIEW');
create index task_claims_user_idx on public.task_claims (user_id, created_at desc);
create index task_claims_status_idx on public.task_claims (status)
  where status in ('PENDING','VERIFYING','MANUAL_REVIEW');
create index task_claims_deadline_idx on public.task_claims (claim_deadline)
  where status in ('PENDING','VERIFYING') and claim_deadline is not null;

create trigger task_claims_updated_at
  before update on public.task_claims
  for each row execute function public.touch_updated_at();

alter table public.reward_grants
  add constraint reward_grants_task_claim_fk
  foreign key (task_claim_id) references public.task_claims (id) on delete restrict;

create table public.task_claim_legs (
  id             uuid primary key default gen_random_uuid(),
  claim_id       uuid not null references public.task_claims (id) on delete cascade,
  requirement_id uuid not null references public.task_requirements (id) on delete restrict,
  status         public.task_leg_status not null default 'PENDING',
  verified_by    uuid references auth.users (id),
  detail         jsonb not null default '{}'::jsonb,
  verified_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (claim_id, requirement_id)
);

create index task_claim_legs_pending_idx on public.task_claim_legs (status)
  where status in ('PENDING','VERIFYING');
create trigger task_claim_legs_updated_at
  before update on public.task_claim_legs
  for each row execute function public.touch_updated_at();

create table public.task_events (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.reward_tasks (id) on delete restrict,
  event_type  text not null,
  actor_kind  text not null default 'SYSTEM'
              check (actor_kind in ('INVESTOR','ADMIN','SYSTEM','PROVIDER')),
  actor_id    uuid,
  request_id  text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index task_events_task_idx on public.task_events (task_id, id);

create table public.task_claim_events (
  id          bigint generated always as identity primary key,
  claim_id    uuid not null references public.task_claims (id) on delete cascade,
  event_type  text not null,
  actor_kind  text not null default 'SYSTEM'
              check (actor_kind in ('INVESTOR','ADMIN','SYSTEM','PROVIDER')),
  actor_id    uuid,
  request_id  text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index task_claim_events_claim_idx on public.task_claim_events (claim_id, id);

-- ── Write guard ──────────────────────────────────────────────────────────────

create or replace function public.assert_task_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.task_write', true) is distinct from '1' then
    raise exception 'task-domain writes must go through the task RPCs';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger reward_tasks_write_guard
  before insert or update or delete on public.reward_tasks
  for each row execute function public.assert_task_write();
create trigger task_requirements_write_guard
  before insert or update or delete on public.task_requirements
  for each row execute function public.assert_task_write();
create trigger task_claims_write_guard
  before insert or update or delete on public.task_claims
  for each row execute function public.assert_task_write();
create trigger task_claim_legs_write_guard
  before insert or update or delete on public.task_claim_legs
  for each row execute function public.assert_task_write();
create trigger task_events_write_guard
  before insert or update or delete on public.task_events
  for each row execute function public.assert_task_write();
create trigger task_claim_events_write_guard
  before insert or update or delete on public.task_claim_events
  for each row execute function public.assert_task_write();

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- task eligibility evaluation — server-side, config-driven.
create or replace function public.task_check_eligibility(
  p_user_id uuid,
  p_eligibility jsonb
)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_reasons text[] := '{}';
begin
  if coalesce((p_eligibility->>'requires_deposit')::boolean, false)
     and not public.has_deposit_history(p_user_id) then
    v_reasons := v_reasons || 'requires_deposit';
  end if;
  if coalesce((p_eligibility->>'requires_investment')::boolean, false)
     and not exists (select 1 from public.investments
                      where user_id = p_user_id
                        and status in ('ACTIVE','MATURITY_DUE','SETTLING','COMPLETED')) then
    v_reasons := v_reasons || 'requires_investment';
  end if;
  if coalesce((p_eligibility->>'requires_kyc')::boolean, false)
     and not exists (select 1 from public.kyc_submissions
                      where user_id = p_user_id and status = 'VERIFIED') then
    v_reasons := v_reasons || 'requires_kyc';
  end if;
  if (p_eligibility->>'min_account_age_hours') is not null
     and (select created_at from public.profiles where id = p_user_id)
         > now() - make_interval(hours => (p_eligibility->>'min_account_age_hours')::int) then
    v_reasons := v_reasons || 'min_account_age';
  end if;
  return jsonb_build_object('eligible', array_length(v_reasons,1) is null,
                            'reasons', v_reasons);
end;
$$;

-- Aggregate claim status from its legs; settles the reward when every required
-- leg is VERIFIED. Single choke point for leg→claim transitions.

create or replace function public.settle_task_claim(
  p_claim_id   uuid,
  p_request_id text default null
)
returns public.task_claim_status
language plpgsql security definer set search_path = '' as $$
declare
  c         public.task_claims;
  t         public.reward_tasks;
  v_grant   uuid;
  v_failed  int;
  v_open    int;
  v_manual  int;
  v_allreq  int;
  v_newst   public.task_claim_status;
begin
  perform set_config('app.task_write', '1', true);
  perform set_config('app.reward_write', '1', true);   -- settle mints grants
  select * into c from public.task_claims where id = p_claim_id for update;
  if not found then
    raise exception 'task claim % not found', p_claim_id;
  end if;
  if c.status in ('REWARDED','REJECTED','EXPIRED') then
    return c.status;                    -- terminal — idempotent
  end if;
  select * into t from public.reward_tasks where id = c.task_id;

  select count(*) filter (where l.status = 'FAILED' and r.required),
         count(*) filter (where l.status in ('PENDING','VERIFYING') and r.required),
         count(*) filter (where l.status = 'MANUAL_REVIEW' and r.required),
         count(*) filter (where r.required)
    into v_failed, v_open, v_manual, v_allreq
    from public.task_claim_legs l
    join public.task_requirements r on r.id = l.requirement_id
   where l.claim_id = c.id;

  if v_failed > 0 then
    v_newst := 'REJECTED';
  elsif v_open = 0 and v_manual = 0 then
    -- every required leg verified → issue the reward
    v_newst := 'REWARDED';
  elsif v_manual > 0 and v_open = 0 then
    v_newst := 'MANUAL_REVIEW';
  else
    v_newst := 'VERIFYING';
  end if;

  if v_newst = 'REWARDED' then
    -- mint through the shared reward engine; unique index on task_claim_id
    -- makes this idempotent across races/retries
    insert into public.reward_grants
      (user_id, kind, status, face_minor, currency, task_claim_id, request_id)
    values (c.user_id, 'TASK', 'PENDING', t.reward_amount_minor, t.reward_currency,
            c.id, p_request_id)
    on conflict (task_claim_id) where kind = 'TASK' do nothing
    returning id into v_grant;
    v_grant := coalesce(v_grant,
      (select id from public.reward_grants
        where task_claim_id = c.id and kind = 'TASK'));
    if public.issue_reward_grant(v_grant, p_request_id) <> 'CREDITED' then
      -- blocked/unconfigured: stay non-terminal for ops replay
      v_newst := 'VERIFYING';
    else
      update public.task_claims set reward_grant_id = v_grant where id = c.id;
    end if;
  end if;

  update public.task_claims set
    status      = v_newst,
    resolved_at = case when v_newst in ('REWARDED','REJECTED') then now() else resolved_at end
  where id = c.id;

  insert into public.task_claim_events (claim_id, event_type, actor_kind, request_id, metadata)
  values (c.id, 'STATUS_' || v_newst::text, 'SYSTEM', p_request_id,
          jsonb_build_object('failed_legs', v_failed, 'open_legs', v_open,
                             'manual_legs', v_manual));

  if v_newst = 'REWARDED' then
    perform public.emit_outbound('task.reward_issued', 'task_claim', c.id,
      jsonb_build_object('claim_id', c.id, 'task_id', c.task_id,
        'user_id', c.user_id, 'grant_id', v_grant,
        'amount_minor', t.reward_amount_minor, 'currency', t.reward_currency),
      'task:rewarded:' || c.id::text, p_request_id);
  elsif v_newst = 'REJECTED' then
    perform public.emit_outbound('task.claim_rejected', 'task_claim', c.id,
      jsonb_build_object('claim_id', c.id, 'task_id', c.task_id, 'user_id', c.user_id),
      'task:rejected:' || c.id::text, p_request_id);
  end if;

  return v_newst;
end;
$$;

-- record_task_leg_result — service/admin leg resolution entry point.

create or replace function public.record_task_leg_result(
  p_claim_id       uuid,
  p_requirement_id uuid,
  p_status         public.task_leg_status,   -- VERIFIED | FAILED
  p_detail         jsonb default '{}'::jsonb,
  p_request_id     text default null
)
returns public.task_claim_status
language plpgsql security definer set search_path = '' as $$
declare
  v_leg public.task_claim_legs;
begin
  if p_status not in ('VERIFIED','FAILED') then
    raise exception 'leg result must be VERIFIED or FAILED';
  end if;
  perform set_config('app.task_write', '1', true);
  select * into v_leg from public.task_claim_legs
   where claim_id = p_claim_id and requirement_id = p_requirement_id
   for update;
  if not found then
    raise exception 'claim leg not found';
  end if;
  if v_leg.status in ('VERIFIED','FAILED','EXPIRED') then
    return public.settle_task_claim(p_claim_id, p_request_id);  -- idempotent
  end if;
  update public.task_claim_legs set
    status = p_status, verified_at = now(),
    verified_by = auth.uid(), detail = v_leg.detail || coalesce(p_detail,'{}'::jsonb)
  where id = v_leg.id;
  insert into public.task_claim_events (claim_id, event_type, actor_kind, actor_id, request_id, metadata)
  values (p_claim_id, 'LEG_' || p_status::text,
          case when auth.uid() is null then 'SYSTEM' else 'ADMIN' end,
          auth.uid(), p_request_id,
          jsonb_build_object('requirement_id', p_requirement_id, 'detail', p_detail));
  return public.settle_task_claim(p_claim_id, p_request_id);
end;
$$;

-- ── Investor RPCs ────────────────────────────────────────────────────────────

create or replace function public.list_reward_tasks()
returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  return query
    select jsonb_build_object(
      'id', t.id, 'slug', t.slug, 'title', t.title, 'description', t.description,
      'status', t.status::text,
      'reward_amount_minor', t.reward_amount_minor,
      'reward_currency', t.reward_currency::text,
      'claim_policy', t.claim_policy::text,
      'starts_at', t.starts_at, 'ends_at', t.ends_at,
      'eligibility', t.eligibility,
      'requirements', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', r.id, 'kind', r.kind, 'config', r.config,
                 'required', r.required) order by r.position, r.created_at)
          from public.task_requirements r where r.task_id = t.id), '[]'::jsonb),
      'my_claim', (select jsonb_build_object('id', c.id, 'status', c.status,
                     'created_at', c.created_at)
                     from public.task_claims c
                    where c.task_id = t.id and c.user_id = v_uid
                    order by c.created_at desc limit 1))
    from public.reward_tasks t
    where t.status = 'PUBLISHED'
      and (t.starts_at is null or t.starts_at <= now())
      and (t.ends_at is null or t.ends_at > now())
    order by t.created_at desc;
end;
$$;

create or replace function public.list_my_task_claims()
returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  return query
    select jsonb_build_object(
      'id', c.id, 'task_id', c.task_id, 'status', c.status::text,
      'task_title', t.title, 'task_slug', t.slug,
      'reward_amount_minor', t.reward_amount_minor,
      'reward_currency', t.reward_currency::text,
      'claim_deadline', c.claim_deadline, 'resolved_at', c.resolved_at,
      'created_at', c.created_at,
      'legs', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'requirement_id', l.requirement_id, 'kind', r.kind,
                 'status', l.status, 'verified_at', l.verified_at,
                 'detail', l.detail) order by r.position)
          from public.task_claim_legs l
          join public.task_requirements r on r.id = l.requirement_id
         where l.claim_id = c.id), '[]'::jsonb))
    from public.task_claims c
    join public.reward_tasks t on t.id = c.task_id
    where c.user_id = v_uid
    order by c.created_at desc;
end;
$$;

-- claim_task — one open claim per task+user; idempotent by key.
create or replace function public.claim_task(
  p_task_id         uuid,
  p_idempotency_key text,
  p_evidence        jsonb default '{}'::jsonb,
  p_request_id      text default null
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := auth.uid();
  t         public.reward_tasks;
  c         public.task_claims;
  v_key     text;
  v_elig    jsonb;
  v_ttl     int;
  v_claim   uuid := gen_random_uuid();
  v_pending_links text[] := '{}';
  v_newst   public.task_claim_status;
  r         record;
  v_status  text;
  v_ok      boolean;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  select account_status into v_status from public.profiles where id = v_uid;
  if v_status is distinct from 'ACTIVE' then
    raise exception 'account is not active';
  end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency_key is required';
  end if;
  v_key := 'task:claim:' || v_uid::text || ':' || p_idempotency_key;

  -- idempotent replay first
  select * into c from public.task_claims where idempotency_key = v_key;
  if c.id is not null then
    return jsonb_build_object('claim_id', c.id, 'status', c.status, 'replayed', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('taskclaim:' || v_uid::text, 0));
  perform set_config('app.task_write', '1', true);

  select * into t from public.reward_tasks where id = p_task_id;
  if not found then
    raise exception 'ERR_TASK_NOT_FOUND';
  end if;
  if t.status <> 'PUBLISHED' then
    raise exception 'ERR_TASK_NOT_AVAILABLE';
  end if;
  if (t.starts_at is not null and t.starts_at > now())
     or (t.ends_at is not null and t.ends_at <= now()) then
    raise exception 'ERR_TASK_NOT_AVAILABLE';
  end if;

  v_elig := public.task_check_eligibility(v_uid, t.eligibility);
  if not (v_elig->>'eligible')::boolean then
    raise exception 'ERR_TASK_NOT_ELIGIBLE: %', v_elig->>'reasons';
  end if;

  -- claim limits
  if t.claim_policy = 'ONE_TIME' then
    if exists (select 1 from public.task_claims
                where task_id = t.id and user_id = v_uid
                  and status in ('PENDING','VERIFYING','MANUAL_REVIEW','REWARDED')) then
      raise exception 'ERR_TASK_ALREADY_CLAIMED';
    end if;
  else
    if (select count(*) from public.task_claims
         where task_id = t.id and user_id = v_uid and status = 'REWARDED') >= t.max_claims then
      raise exception 'ERR_TASK_ALREADY_CLAIMED';
    end if;
  end if;

  v_ttl := coalesce(public.config_number('reward.claim_ttl_seconds')::int, 900);

  insert into public.task_claims
    (id, task_id, user_id, status, evidence, claim_deadline, idempotency_key, request_id,
     attempt_no)
  values (v_claim, t.id, v_uid, 'PENDING', coalesce(p_evidence,'{}'::jsonb),
          now() + make_interval(secs => v_ttl), v_key, p_request_id,
          coalesce((select max(attempt_no) + 1 from public.task_claims
                     where task_id = t.id and user_id = v_uid), 1))
  returning * into c;

  -- create legs from the current requirement set
  for r in
    select * from public.task_requirements where task_id = t.id order by position, created_at
  loop
    if r.kind = 'APP_ACTION' then
      -- SQL-verifiable checks evaluated at claim time
      v_ok := case r.config->>'check'
        when 'has_deposit'     then public.has_deposit_history(v_uid)
        when 'has_investment'  then exists (select 1 from public.investments
                                     where user_id = v_uid
                                       and status in ('ACTIVE','MATURITY_DUE','SETTLING','COMPLETED'))
        when 'has_kyc'         then exists (select 1 from public.kyc_submissions
                                     where user_id = v_uid and status = 'VERIFIED')
        when 'has_referral'    then exists (select 1 from public.referrals
                                     where referrer_id = v_uid)
        else false end;
      insert into public.task_claim_legs (claim_id, requirement_id, status, detail)
      values (v_claim, r.id,
              case when v_ok then 'VERIFIED'::public.task_leg_status
                   else 'FAILED'::public.task_leg_status end,
              jsonb_build_object('check', r.config->>'check', 'result', v_ok));
    elsif r.kind = 'TELEGRAM_MEMBERSHIP' then
      if exists (select 1 from public.user_identities
                  where user_id = v_uid and provider = 'TELEGRAM'
                    and provider_user_id is not null) then
        insert into public.task_claim_legs (claim_id, requirement_id, status)
        values (v_claim, r.id, 'VERIFYING');
      else
        insert into public.task_claim_legs (claim_id, requirement_id, status, detail)
        values (v_claim, r.id, 'PENDING', jsonb_build_object('reason','identity_not_linked'));
        v_pending_links := v_pending_links || array['TELEGRAM'];
      end if;
    else
      -- WHATSAPP_MEMBERSHIP / MANUAL_EVIDENCE / EXTERNAL_WEBHOOK
      insert into public.task_claim_legs (claim_id, requirement_id, status, detail)
      values (v_claim, r.id,
              case when r.kind = 'EXTERNAL_WEBHOOK' then 'VERIFYING'::public.task_leg_status
                   else 'MANUAL_REVIEW'::public.task_leg_status end,
              jsonb_build_object('evidence', p_evidence));
    end if;
  end loop;

  insert into public.task_claim_events (claim_id, event_type, actor_kind, actor_id, request_id, metadata)
  values (v_claim, 'CLAIMED', 'INVESTOR', v_uid, p_request_id,
          jsonb_build_object('task_id', t.id, 'slug', t.slug));

  v_newst := public.settle_task_claim(v_claim, p_request_id);

  perform public.emit_outbound('task.claim_submitted', 'task_claim', v_claim,
    jsonb_build_object('claim_id', v_claim, 'task_id', t.id, 'slug', t.slug,
      'user_id', v_uid, 'status', v_newst, 'pending_links', v_pending_links),
    'task:claimed:' || v_claim::text, p_request_id);

  select * into c from public.task_claims where id = v_claim;
  return jsonb_build_object('claim_id', c.id, 'status', c.status,
                            'deadline', c.claim_deadline,
                            'pending_links', v_pending_links);
exception
  when unique_violation then
    -- concurrent same-key claim — return the winner
    select * into c from public.task_claims where idempotency_key = v_key;
    if c.id is not null then
      return jsonb_build_object('claim_id', c.id, 'status', c.status, 'replayed', true);
    end if;
    -- different key, concurrent open claim — converge to the open claim
    select * into c from public.task_claims
     where task_id = p_task_id and user_id = v_uid
       and status in ('PENDING','VERIFYING','MANUAL_REVIEW')
     limit 1;
    if c.id is not null then
      return jsonb_build_object('claim_id', c.id, 'status', c.status, 'replayed', true);
    end if;
    raise;
end;
$$;

-- ── Identity linking (authenticated → token; webhook → consume) ──────────────

create or replace function public.create_identity_link_token(
  p_provider public.identity_provider,
  p_request_id text default null
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_token text;
  v_exp   timestamptz;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  perform set_config('app.reward_write', '1', true);
  v_token := 'lnk_' || replace(gen_random_uuid()::text, '-', '');
  v_exp   := now() + interval '15 minutes';
  insert into public.user_identities
    (user_id, provider, link_token, token_expires_at, request_id)
  values (v_uid, p_provider, v_token, v_exp, p_request_id)
  on conflict (provider, user_id) do update
    set link_token = excluded.link_token,
        token_expires_at = excluded.token_expires_at,
        request_id = excluded.request_id;
  return jsonb_build_object('token', v_token, 'expires_at', v_exp,
    'provider', p_provider::text,
    'bot_username', public.config_text('telegram.bot_username'));
end;
$$;

-- consume_identity_link — called by the telegram-webhook edge function with a
-- /start token; binds the provider user id atomically (one user per telegram id).
create or replace function public.consume_identity_link(
  p_token             text,
  p_provider          public.identity_provider,
  p_provider_user_id  text,
  p_provider_username text default null,
  p_request_id        text default null
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.user_identities;
begin
  if p_provider_user_id is null or btrim(p_provider_user_id) = '' then
    raise exception 'provider_user_id required';
  end if;
  perform set_config('app.reward_write', '1', true);
  select * into v_row from public.user_identities
   where provider = p_provider and link_token = p_token
     and token_expires_at > now()
   for update;
  if not found then
    raise exception 'invalid or expired link token';
  end if;
  if exists (select 1 from public.user_identities
              where provider = p_provider and provider_user_id = p_provider_user_id
                and user_id <> v_row.user_id) then
    raise exception 'telegram account already linked to another user';
  end if;
  update public.user_identities set
    provider_user_id = p_provider_user_id,
    provider_username = p_provider_username,
    linked_at = now(), link_token = null, token_expires_at = null
  where id = v_row.id;
  return jsonb_build_object('user_id', v_row.user_id, 'linked', true);
end;
$$;

-- task_legs_pending_verification — worker feed for the claim verifier EF.
create or replace function public.task_legs_pending_verification(p_limit int default 25)
returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
    select jsonb_build_object(
      'leg_id', l.id, 'claim_id', l.claim_id, 'requirement_id', l.requirement_id,
      'kind', r.kind, 'config', r.config,
      'user_id', c.user_id,
      'telegram_user_id', (select ui.provider_user_id from public.user_identities ui
                            where ui.user_id = c.user_id and ui.provider = 'TELEGRAM'),
      'claim_deadline', c.claim_deadline)
    from public.task_claim_legs l
    join public.task_requirements r on r.id = l.requirement_id
    join public.task_claims c on c.id = l.claim_id
    where l.status in ('PENDING','VERIFYING')
      and r.kind = 'TELEGRAM_MEMBERSHIP'
      and c.status in ('PENDING','VERIFYING')
      and (c.claim_deadline is null or c.claim_deadline > now())
    order by l.created_at
    limit p_limit;
end;
$$;

-- expire_stale_claims — TTL sweep for claims stuck PENDING/VERIFYING.
create or replace function public.expire_stale_claims(p_now timestamptz default now())
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid; v_n int := 0;
begin
  perform set_config('app.task_write', '1', true);
  for v_id in
    select c.id from public.task_claims c
     where c.status in ('PENDING','VERIFYING','MANUAL_REVIEW')
       and c.claim_deadline is not null and c.claim_deadline <= p_now
     for update of c skip locked
  loop
    update public.task_claim_legs set status = 'EXPIRED'
     where claim_id = v_id and status in ('PENDING','VERIFYING','MANUAL_REVIEW');
    update public.task_claims set status = 'EXPIRED', resolved_at = p_now
     where id = v_id;
    insert into public.task_claim_events (claim_id, event_type, actor_kind, metadata)
    values (v_id, 'EXPIRED', 'SYSTEM', jsonb_build_object('deadline_passed', true));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- ── Admin RPCs ───────────────────────────────────────────────────────────────
-- Task catalogue management: OPERATIONS_ADMIN / SUPER_ADMIN.
-- Claim review (manual legs): KYC_REVIEWER also allowed — they already review
-- identity evidence for withdrawals.

create or replace function public.admin_list_reward_tasks(
  p_status public.task_status default null,
  p_limit  int default 50,
  p_offset int default 0
)
returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_ops_reader() then
    raise exception 'not authorized';
  end if;
  return query
    select jsonb_build_object(
      'id', t.id, 'slug', t.slug, 'title', t.title, 'description', t.description,
      'status', t.status::text,
      'reward_amount_minor', t.reward_amount_minor,
      'reward_currency', t.reward_currency::text,
      'claim_policy', t.claim_policy::text, 'max_claims', t.max_claims,
      'eligibility', t.eligibility, 'starts_at', t.starts_at, 'ends_at', t.ends_at,
      'version', t.version, 'published_at', t.published_at, 'created_at', t.created_at,
      'requirements', coalesce((
        select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind,
                 'config', r.config, 'required', r.required, 'position', r.position)
                 order by r.position, r.created_at)
          from public.task_requirements r where r.task_id = t.id), '[]'::jsonb),
      'claims', (select jsonb_build_object(
                   'total', count(*),
                   'pending', count(*) filter (where status in ('PENDING','VERIFYING','MANUAL_REVIEW')),
                   'rewarded', count(*) filter (where status='REWARDED'),
                   'rejected', count(*) filter (where status='REJECTED'))
                 from public.task_claims c where c.task_id = t.id))
    from public.reward_tasks t
    where (p_status is null or t.status = p_status)
    order by t.created_at desc
    limit p_limit offset p_offset;
end;
$$;

create or replace function public.admin_upsert_reward_task(
  p_id         uuid default null,
  p_fields     jsonb default '{}'::jsonb,
  p_request_id text default null
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := public.current_admin_role()::text;
  t      public.reward_tasks;
  v_new  jsonb;
begin
  if not public.has_admin_role(array['OPERATIONS_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    raise exception 'not authorized to manage tasks';
  end if;
  perform set_config('app.task_write', '1', true);

  if p_id is null then
    -- create (always lands DRAFT)
    insert into public.reward_tasks
      (slug, title, description, status, reward_amount_minor, reward_currency,
       claim_policy, max_claims, eligibility, starts_at, ends_at, created_by)
    values (
      p_fields->>'slug',
      p_fields->>'title',
      coalesce(p_fields->>'description',''),
      'DRAFT',
      coalesce((p_fields->>'reward_amount_minor')::bigint, 0),
      coalesce((p_fields->>'reward_currency')::public.currency_code, 'NGN'),
      coalesce((p_fields->>'claim_policy')::public.claim_policy, 'ONE_TIME'),
      coalesce((p_fields->>'max_claims')::int, 1),
      coalesce(p_fields->'eligibility', '{}'::jsonb),
      nullif(p_fields->>'starts_at','')::timestamptz,
      nullif(p_fields->>'ends_at','')::timestamptz,
      auth.uid())
    returning * into t;
    insert into public.task_events (task_id, event_type, actor_kind, actor_id, request_id, metadata)
    values (t.id, 'CREATED', 'ADMIN', auth.uid(), p_request_id, p_fields);
  else
    select * into t from public.reward_tasks where id = p_id for update;
    if not found then
      raise exception 'task % not found', p_id;
    end if;
    -- frozen fields once published (reward economics + claim policy)
    if t.published_at is not null and (
        (p_fields ? 'reward_amount_minor' and (p_fields->>'reward_amount_minor')::bigint is distinct from t.reward_amount_minor)
        or (p_fields ? 'reward_currency' and (p_fields->>'reward_currency')::public.currency_code is distinct from t.reward_currency)
        or (p_fields ? 'claim_policy' and (p_fields->>'claim_policy')::public.claim_policy is distinct from t.claim_policy)) then
      raise exception 'ERR_TASK_FROZEN: reward amount/currency/claim policy are frozen once published';
    end if;
    update public.reward_tasks set
      title       = coalesce(p_fields->>'title', title),
      description = coalesce(p_fields->>'description', description),
      max_claims  = coalesce((p_fields->>'max_claims')::int, max_claims),
      eligibility = coalesce(p_fields->'eligibility', eligibility),
      starts_at   = case when p_fields ? 'starts_at' then nullif(p_fields->>'starts_at','')::timestamptz else starts_at end,
      ends_at     = case when p_fields ? 'ends_at'   then nullif(p_fields->>'ends_at','')::timestamptz   else ends_at end,
      version     = version + case when t.published_at is not null then 1 else 0 end
    where id = t.id
    returning * into t;
    insert into public.task_events (task_id, event_type, actor_kind, actor_id, request_id, metadata)
    values (t.id, 'UPDATED', 'ADMIN', auth.uid(), p_request_id, p_fields);
  end if;

  insert into public.audit_log (actor_id, actor_role, action, entity_type, entity_id, result, request_id, metadata)
  values (auth.uid(), v_role,
          'reward_task.' || case when p_id is null then 'create' else 'update' end,
          'reward_task', t.id::text, 'SUCCESS', p_request_id, p_fields);

  return to_jsonb(t);
end;
$$;

create or replace function public.admin_set_task_status(
  p_task_id    uuid,
  p_to         public.task_status,
  p_request_id text default null
)
returns public.task_status
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := public.current_admin_role()::text;
  t      public.reward_tasks;
  ok     boolean;
begin
  if not public.has_admin_role(array['OPERATIONS_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    raise exception 'not authorized to manage tasks';
  end if;
  perform set_config('app.task_write', '1', true);
  select * into t from public.reward_tasks where id = p_task_id for update;
  if not found then
    raise exception 'task % not found', p_task_id;
  end if;
  ok := case t.status
    when 'DRAFT'     then p_to in ('PUBLISHED','ARCHIVED')
    when 'PUBLISHED' then p_to in ('PAUSED','ARCHIVED')
    when 'PAUSED'    then p_to in ('PUBLISHED','ARCHIVED')
    else false end;
  if not ok then
    raise exception 'invalid task transition: % → %', t.status, p_to;
  end if;
  if p_to = 'PUBLISHED' then
    if not exists (select 1 from public.task_requirements where task_id = t.id) then
      raise exception 'cannot publish a task with no requirements';
    end if;
    update public.reward_tasks set status = 'PUBLISHED',
           published_at = now(), published_by = auth.uid(), version = version + 1
      where id = t.id;
  else
    update public.reward_tasks set status = p_to where id = t.id;
  end if;
  insert into public.task_events (task_id, event_type, actor_kind, actor_id, request_id)
  values (t.id, 'STATUS_' || p_to::text, 'ADMIN', auth.uid(), p_request_id);
  insert into public.audit_log (actor_id, actor_role, action, entity_type, entity_id, result, request_id)
  values (auth.uid(), v_role, 'reward_task.status_' || lower(p_to::text),
          'reward_task', p_task_id::text, 'SUCCESS', p_request_id);
  return p_to;
end;
$$;

create or replace function public.admin_upsert_task_requirement(
  p_task_id    uuid,
  p_req_id     uuid default null,
  p_fields     jsonb default '{}'::jsonb,
  p_request_id text default null
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := public.current_admin_role()::text;
  t      public.reward_tasks;
  v_id   uuid;
begin
  if not public.has_admin_role(array['OPERATIONS_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    raise exception 'not authorized to manage tasks';
  end if;
  perform set_config('app.task_write', '1', true);
  select * into t from public.reward_tasks where id = p_task_id for update;
  if not found then
    raise exception 'task % not found', p_task_id;
  end if;
  if t.published_at is not null and t.status = 'PUBLISHED' then
    raise exception 'ERR_TASK_FROZEN: pause the task before editing requirements';
  end if;
  if p_req_id is null then
    insert into public.task_requirements (task_id, kind, config, required, position)
    values (t.id,
            coalesce((p_fields->>'kind')::public.requirement_kind, 'MANUAL_EVIDENCE'),
            coalesce(p_fields->'config','{}'::jsonb),
            coalesce((p_fields->>'required')::boolean, true),
            coalesce((p_fields->>'position')::int, 0))
    returning id into v_id;
  else
    update public.task_requirements set
      config   = coalesce(p_fields->'config', config),
      required = coalesce((p_fields->>'required')::boolean, required),
      position = coalesce((p_fields->>'position')::int, position)
     where id = p_req_id and task_id = t.id
    returning id into v_id;
    if v_id is null then
      raise exception 'requirement % not found', p_req_id;
    end if;
  end if;
  insert into public.audit_log (actor_id, actor_role, action, entity_type, entity_id, result, request_id, metadata)
  values (auth.uid(), v_role, 'reward_task.requirement_upsert', 'reward_task',
          t.id::text, 'SUCCESS', p_request_id, p_fields);
  return v_id;
end;
$$;

create or replace function public.admin_list_task_claims(
  p_task_id uuid default null,
  p_status  public.task_claim_status default null,
  p_limit   int default 50,
  p_offset  int default 0
)
returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_ops_reader() then
    raise exception 'not authorized';
  end if;
  return query
    select jsonb_build_object(
      'id', c.id, 'task_id', c.task_id, 'task_title', t.title,
      'user_id', c.user_id, 'user_display_name', p.display_name,
      'status', c.status::text, 'attempt_no', c.attempt_no,
      'evidence', c.evidence, 'claim_deadline', c.claim_deadline,
      'resolved_at', c.resolved_at, 'reviewed_by', c.reviewed_by,
      'created_at', c.created_at,
      'legs', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', l.id, 'requirement_id', l.requirement_id, 'kind', r.kind,
                 'status', l.status, 'verified_at', l.verified_at,
                 'verified_by', l.verified_by, 'detail', l.detail) order by r.position)
          from public.task_claim_legs l
          join public.task_requirements r on r.id = l.requirement_id
         where l.claim_id = c.id), '[]'::jsonb))
    from public.task_claims c
    join public.reward_tasks t on t.id = c.task_id
    join public.profiles p on p.id = c.user_id
    where (p_task_id is null or c.task_id = p_task_id)
      and (p_status is null or c.status = p_status)
    order by c.created_at desc
    limit p_limit offset p_offset;
end;
$$;

-- Manual leg review (WhatsApp evidence etc.) — KYC reviewers + ops/finance.
create or replace function public.admin_review_task_claim(
  p_claim_id   uuid,
  p_leg_id     uuid,
  p_decision   text,           -- APPROVE | REJECT
  p_note       text default null,
  p_request_id text default null
)
returns public.task_claim_status
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := public.current_admin_role()::text;
  v_leg  public.task_claim_legs;
  v_new  public.task_claim_status;
begin
  if not public.has_admin_role(array['KYC_REVIEWER','OPERATIONS_ADMIN','FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    raise exception 'not authorized to review task claims';
  end if;
  if p_decision not in ('APPROVE','REJECT') then
    raise exception 'decision must be APPROVE or REJECT';
  end if;
  perform set_config('app.task_write', '1', true);
  select * into v_leg from public.task_claim_legs where id = p_leg_id and claim_id = p_claim_id;
  if not found then
    raise exception 'claim leg not found';
  end if;
  if v_leg.status not in ('MANUAL_REVIEW','PENDING','VERIFYING') then
    raise exception 'leg already resolved (%)', v_leg.status;
  end if;
  v_new := public.record_task_leg_result(p_claim_id, v_leg.requirement_id,
           case when p_decision = 'APPROVE' then 'VERIFIED'::public.task_leg_status
                else 'FAILED'::public.task_leg_status end,
           jsonb_build_object('admin_note', p_note, 'reviewed_by', auth.uid()),
           p_request_id);
  update public.task_claims set reviewed_by = auth.uid() where id = p_claim_id;
  insert into public.audit_log (actor_id, actor_role, action, entity_type, entity_id, result, request_id, metadata)
  values (auth.uid(), v_role, 'task_claim.review_' || lower(p_decision),
          'task_claim', p_claim_id::text, 'SUCCESS', p_request_id,
          jsonb_build_object('leg_id', p_leg_id, 'note', p_note));
  return v_new;
end;
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.reward_tasks       enable row level security;
alter table public.task_requirements  enable row level security;
alter table public.task_claims        enable row level security;
alter table public.task_claim_legs    enable row level security;
alter table public.task_events        enable row level security;
alter table public.task_claim_events  enable row level security;

-- investors see only published tasks within window (enforced again in RPCs)
create policy reward_tasks_select_published
  on public.reward_tasks for select
  using (status = 'PUBLISHED' or public.is_admin());
create policy task_requirements_select
  on public.task_requirements for select
  using (exists (select 1 from public.reward_tasks t
                  where t.id = task_id and (t.status = 'PUBLISHED' or public.is_admin())));

create policy task_claims_select_own
  on public.task_claims for select using (auth.uid() = user_id);
create policy task_claims_select_admin
  on public.task_claims for select using (public.is_admin());
create policy task_claim_legs_select_own
  on public.task_claim_legs for select
  using (exists (select 1 from public.task_claims c
                  where c.id = claim_id and c.user_id = auth.uid()));
create policy task_claim_legs_select_admin
  on public.task_claim_legs for select using (public.is_admin());
create policy task_events_select_admin
  on public.task_events for select using (public.is_admin());
create policy task_claim_events_select_own
  on public.task_claim_events for select
  using (exists (select 1 from public.task_claims c
                  where c.id = claim_id and c.user_id = auth.uid()));
create policy task_claim_events_select_admin
  on public.task_claim_events for select using (public.is_admin());

-- ── Privileges ───────────────────────────────────────────────────────────────

revoke execute on function public.list_reward_tasks() from public, anon;
grant  execute on function public.list_reward_tasks() to authenticated;
revoke execute on function public.list_my_task_claims() from public, anon;
grant  execute on function public.list_my_task_claims() to authenticated;
revoke execute on function public.claim_task(uuid, text, jsonb, text) from public, anon;
grant  execute on function public.claim_task(uuid, text, jsonb, text) to authenticated;
revoke execute on function public.create_identity_link_token(public.identity_provider, text) from public, anon;
grant  execute on function public.create_identity_link_token(public.identity_provider, text) to authenticated;

grant execute on function public.admin_list_reward_tasks(public.task_status, int, int) to authenticated;
grant execute on function public.admin_upsert_reward_task(uuid, jsonb, text) to authenticated;
grant execute on function public.admin_set_task_status(uuid, public.task_status, text) to authenticated;
grant execute on function public.admin_upsert_task_requirement(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.admin_list_task_claims(uuid, public.task_claim_status, int, int) to authenticated;
grant execute on function public.admin_review_task_claim(uuid, uuid, text, text, text) to authenticated;

-- service-only internals
revoke all on function public.task_check_eligibility(uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.task_check_eligibility(uuid, jsonb) to service_role;
revoke all on function public.settle_task_claim(uuid, text) from public, anon, authenticated;
grant  execute on function public.settle_task_claim(uuid, text) to service_role;
revoke all on function public.record_task_leg_result(uuid, uuid, public.task_leg_status, jsonb, text)
  from public, anon, authenticated;
grant  execute on function public.record_task_leg_result(uuid, uuid, public.task_leg_status, jsonb, text)
  to service_role;
revoke all on function public.consume_identity_link(text, public.identity_provider, text, text, text)
  from public, anon, authenticated;
grant  execute on function public.consume_identity_link(text, public.identity_provider, text, text, text)
  to service_role;
revoke all on function public.task_legs_pending_verification(int) from public, anon, authenticated;
grant  execute on function public.task_legs_pending_verification(int) to service_role;
revoke all on function public.expire_stale_claims(timestamptz) from public, anon, authenticated;
grant  execute on function public.expire_stale_claims(timestamptz) to service_role;
