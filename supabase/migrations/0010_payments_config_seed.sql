-- RentBrown V2 — Phase 5B payment configuration seed
-- Idempotent (ON CONFLICT DO NOTHING). Secrets are NEVER stored here —
-- only set/last4 markers. payment.deposit.max_minor and
-- payment.deposit.expiry_minutes are seeded DISABLED with null values:
-- no production cap/expiry has been approved, so none is invented.

insert into public.admin_config (key, category, value_type, value, currency, description, is_active) values

  -- Provider enablement (NGN deposits; D-5.8)
  ('payment.provider.paystack.enabled',  'payments', 'BOOLEAN', 'true', null,
   'Paystack deposit provider enabled (NGN only).', true),
  ('payment.provider.korapay.enabled',   'payments', 'BOOLEAN', 'true', null,
   'KoraPay deposit provider enabled (NGN only).', true),

  -- Public payment endpoint registry (operational URLs — not secrets).
  -- Populated with the project''s deployed Edge Function addresses.
  ('payment.endpoint.paystack.webhook',  'payments', 'TEXT',
   '"https://aqkynjuypijmlqnpcmza.supabase.co/functions/v1/payment-webhook-paystack"', null,
   'Deployed Paystack webhook endpoint (public URL; secured by signature verification).', true),
  ('payment.endpoint.korapay.webhook',   'payments', 'TEXT',
   '"https://aqkynjuypijmlqnpcmza.supabase.co/functions/v1/payment-webhook-korapay"', null,
   'Deployed KoraPay webhook endpoint (public URL; secured by signature verification).', true),
  ('payment.endpoint.environment',       'payments', 'TEXT', '"production"', null,
   'Payment environment the hosted functions serve.', true),

  -- Optional deposit policy — DISABLED until an approved production value exists
  ('payment.deposit.max_minor',          'payments', 'MONEY_MINOR', 'null', 'NGN',
   'Optional maximum single deposit (minor units). Inactive — no approved cap.', false),
  ('payment.deposit.expiry_minutes',     'payments', 'INTEGER', 'null', null,
   'Optional pending-deposit expiry window. Inactive — no approved expiry.', false),

  -- Provider secret markers only (real secrets live in Edge Function env)
  ('payment.provider.paystack.secret_set',   'payments', 'BOOLEAN', 'false', null,
   'Marker: PAYSTACK_SECRET_KEY configured in Edge Function secrets.', true),
  ('payment.provider.paystack.secret_last4', 'payments', 'TEXT', '""', null,
   'Last 4 chars of the configured Paystack secret (rotation observability).', true),
  ('payment.provider.korapay.secret_set',    'payments', 'BOOLEAN', 'false', null,
   'Marker: KORAPAY_SECRET_KEY configured in Edge Function secrets.', true),
  ('payment.provider.korapay.secret_last4',  'payments', 'TEXT', '""', null,
   'Last 4 chars of the configured KoraPay secret (rotation observability).', true),
  ('payment.provider.korapay.public_key',    'payments', 'TEXT', '""', null,
   'KoraPay public key (client-safe) when checkout requires it.', true),

  -- Outbound withdrawal notification (Make automation)
  ('withdrawal.webhook.url',      'withdrawals', 'TEXT',
   '"https://hook.eu2.make.com/8ml25nlbpsoirix0kjk46k13byrlt5n2"', null,
   'Outbound webhook target for withdrawal.requested notifications.', true),
  ('withdrawal.webhook.enabled',  'withdrawals', 'BOOLEAN', 'true', null,
   'Enable outbound withdrawal webhook delivery via the outbox worker.', true),

  -- Outbound delivery policy
  ('payment.outbound.max_attempts',        'payments', 'INTEGER', '8',  null,
   'Outbound delivery attempts before DEAD.', true),
  ('payment.outbound.base_backoff_seconds','payments', 'INTEGER', '60', null,
   'Base delay for exponential outbound retry backoff.', true)

on conflict (key) do nothing;
