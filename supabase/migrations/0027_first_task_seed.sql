-- 0027 — Phase 9B part 6: first reward task seed (DRAFT).
--
-- "join-community": join the RentBrown communities. Two required legs:
--   TELEGRAM_MEMBERSHIP — automated once ops configures telegram.bot_token +
--     requirement.config.chat_id and adds the bot as group admin. Until then
--     telegram legs sit PENDING/VERIFYING and expire on the claim TTL (no
--     fake verification — an unverifiable leg can never approve).
--   WHATSAPP_MEMBERSHIP — manual admin review of evidence (the submitted
--     phone number), because reliable arbitrary-group membership lookup does
--     not exist on the WhatsApp Business API.
--
-- The task ships as DRAFT: invisible to investors until ops publishes it via
-- admin_set_task_status after wiring the Telegram provider config.
--
-- Reward: ₦500 (50000 minor) — TEST/DEFAULT value pending product approval,
-- documented as such in the Phase 9B report.

select set_config('app.task_write', '1', true);

insert into public.reward_tasks
  (slug, title, description, status, reward_amount_minor, reward_currency,
   claim_policy, max_claims, eligibility)
values (
  'join-community',
  'Join the RentBrown community',
  'Join our official Telegram and WhatsApp communities to earn a reward.',
  'DRAFT',
  50000,          -- TEST/DEFAULT — not yet an approved business value
  'NGN',
  'ONE_TIME',
  1,
  '{}'::jsonb)
on conflict (slug) do nothing;

insert into public.task_requirements (task_id, kind, config, required, position)
select t.id, x.kind, x.config, true, x.position
  from public.reward_tasks t
  join (values
    ('TELEGRAM_MEMBERSHIP'::public.requirement_kind,
     '{"chat_id": null, "invite_url": null, "instructions": "Link your Telegram account and join the RentBrown community group. Verification is automatic once ops configures the community bot."}'::jsonb,
     0),
    ('WHATSAPP_MEMBERSHIP'::public.requirement_kind,
     '{"invite_url": null, "instructions": "Join the RentBrown WhatsApp community, then submit the phone number you joined with for review.", "evidence_fields": ["phone_number"]}'::jsonb,
     1)
  ) as x(kind, config, position) on true
where t.slug = 'join-community'
  and not exists (select 1 from public.task_requirements r
                   where r.task_id = t.id and r.kind = x.kind);

insert into public.task_events (task_id, event_type, actor_kind, metadata)
select id, 'SEEDED_DRAFT', 'SYSTEM',
       jsonb_build_object('note', 'initial Phase 9B seed — publish after Telegram bot config')
  from public.reward_tasks where slug = 'join-community'
  and not exists (select 1 from public.task_events e
                   where e.task_id = reward_tasks.id and e.event_type = 'SEEDED_DRAFT');
