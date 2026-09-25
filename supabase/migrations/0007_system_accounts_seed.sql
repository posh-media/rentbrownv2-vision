-- RentBrown V2 — Phase 4B system ledger accounts seed
-- Platform contra accounts for both supported currencies. Deterministic keys
-- (system:<kind>:<cur>); idempotent via ON CONFLICT. USD is seeded but dormant
-- (D-4.10) — no FX path exists; every journal is single-currency.

insert into public.ledger_accounts (key, kind, system_kind, currency) values
  ('system:deposits_clearing:NGN',            'SYSTEM', 'DEPOSITS_CLEARING',            'NGN'),
  ('system:deposits_clearing:USD',            'SYSTEM', 'DEPOSITS_CLEARING',            'USD'),
  ('system:payouts_clearing:NGN',             'SYSTEM', 'PAYOUTS_CLEARING',             'NGN'),
  ('system:payouts_clearing:USD',             'SYSTEM', 'PAYOUTS_CLEARING',             'USD'),
  ('system:fee_revenue:NGN',                  'SYSTEM', 'FEE_REVENUE',                  'NGN'),
  ('system:fee_revenue:USD',                  'SYSTEM', 'FEE_REVENUE',                  'USD'),
  ('system:investment_principal_payable:NGN', 'SYSTEM', 'INVESTMENT_PRINCIPAL_PAYABLE', 'NGN'),
  ('system:investment_principal_payable:USD', 'SYSTEM', 'INVESTMENT_PRINCIPAL_PAYABLE', 'USD'),
  ('system:investment_profit_payable:NGN',    'SYSTEM', 'INVESTMENT_PROFIT_PAYABLE',    'NGN'),
  ('system:investment_profit_payable:USD',    'SYSTEM', 'INVESTMENT_PROFIT_PAYABLE',    'USD'),
  ('system:reward_expense:NGN',               'SYSTEM', 'REWARD_EXPENSE',               'NGN'),
  ('system:reward_expense:USD',               'SYSTEM', 'REWARD_EXPENSE',               'USD'),
  ('system:adjustments:NGN',                  'SYSTEM', 'ADJUSTMENTS',                  'NGN'),
  ('system:adjustments:USD',                  'SYSTEM', 'ADJUSTMENTS',                  'USD')
on conflict (key) do nothing;
