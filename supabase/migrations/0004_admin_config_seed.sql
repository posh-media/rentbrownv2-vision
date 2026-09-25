-- RentBrown V2 — Phase 3B admin_config seed
-- Production-safe business defaults only. Idempotent (ON CONFLICT DO NOTHING)
-- so re-running the seed never clobbers admin edits.
-- NO fictional properties, plans, rounds, investments, users, balances, KYC
-- or payment records are seeded — demo data stays in mock fixtures.

insert into public.admin_config (key, category, value_type, value, currency, description) values

  -- Referral policy (defaults from docs/DECISIONS.md D-001; admin-tunable)
  ('referral.signup_reward_minor',       'referrals',   'MONEY_MINOR', '150000',  'NGN',
   'Fixed reward credited to the referrer when a referred user qualifies (NGN 1,500).'),
  ('referral.qualifying_deposit_minor',  'referrals',   'MONEY_MINOR', '5000000', 'NGN',
   'Referred user''s first deposit must reach this amount to qualify the signup reward (NGN 50,000).'),
  ('referral.deposit_referral_bps',      'referrals',   'BPS',         '100',     null,
   'Share of the referred user''s qualifying deposits paid to the referrer (1%).'),
  ('referral.deposit_referral_cap_minor','referrals',   'MONEY_MINOR', '1000000', 'NGN',
   'Cap on deposit-referral rewards per qualifying transaction (NGN 10,000).'),

  -- Withdrawal policy
  ('withdrawal.fee_bps',                 'withdrawals', 'BPS',         '500',     null,
   'Fee applied to the withdrawal amount (5%).'),
  ('withdrawal.fee_cap_minor.NGN',       'withdrawals', 'MONEY_MINOR', '1000000', 'NGN',
   'Maximum withdrawal fee (NGN 10,000).'),
  ('withdrawal.fee_cap_minor.USD',       'withdrawals', 'MONEY_MINOR', '1000',    'USD',
   'Maximum withdrawal fee (USD 10).'),
  ('withdrawal.min_minor.NGN',           'withdrawals', 'MONEY_MINOR', '500000',  'NGN',
   'Minimum withdrawal amount (NGN 5,000).'),

  -- Deposit policy
  ('deposit.min_minor.NGN',              'deposits',    'MONEY_MINOR', '100000',  'NGN',
   'Minimum deposit amount (NGN 1,000).'),

  -- Platform
  ('platform.supported_currencies',      'platform',    'STRING_LIST', '["NGN","USD"]', null,
   'Currencies the platform accepts at launch. No FX execution.')

on conflict (key) do nothing;
