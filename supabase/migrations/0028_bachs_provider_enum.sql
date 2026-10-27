-- RentBrown V2 — Bachs payment provider (Phase 10A): provider enum + config.
-- Split from 0029 deliberately: ALTER TYPE ... ADD VALUE runs inside the
-- per-file migration transaction, and a new enum value cannot be referenced
-- (cast/compared) inside that same transaction. 0029 carries the RPC changes.

alter type public.payment_provider add value if not exists 'BACHS';

-- Config seeds — secrets are NEVER stored here (markers only). The provider is
-- seeded DISABLED: it becomes offerable only when BACHS_API_KEY /
-- BACHS_WEBHOOK_SECRET are configured in Edge Function secrets and ops flips
-- this flag (same convention as the deposit cap seeds in 0010).
insert into public.admin_config (key, category, value_type, value, currency, description, is_active) values
  ('payment.provider.bachs.enabled',     'payments', 'BOOLEAN', 'false', null,
   'Bachs deposit provider (USD card + supported crypto corridors). Enable after Edge Function secrets are configured.', false),
  ('payment.provider.bachs.secret_set',   'payments', 'BOOLEAN', 'false', null,
   'Marker: BACHS_API_KEY configured in Edge Function secrets.', true),
  ('payment.provider.bachs.secret_last4', 'payments', 'TEXT', '""', null,
   'Last 4 chars of the configured Bachs API key (rotation observability).', true),
  ('payment.provider.bachs.webhook_secret_set', 'payments', 'BOOLEAN', 'false', null,
   'Marker: BACHS_WEBHOOK_SECRET configured in Edge Function secrets.', true),
  ('payment.endpoint.bachs.webhook',     'payments', 'TEXT', '""', null,
   'Deployed Bachs webhook endpoint (public URL; secured by HMAC signature verification).', true),

  -- USD deposit floor for the Bachs rail. Placeholder pending product sign-off
  -- ($5.00); same convention as deposit.min_minor.NGN.
  ('deposit.min_minor.USD',              'payments', 'MONEY_MINOR', '500', 'USD',
   'Minimum single USD deposit (Bachs). Placeholder value pending product approval.', true)
on conflict (key) do nothing;
