# Phase 8B — KYC + Manual Withdrawals: Implementation Report

Phase 8B implements the Phase 8A architecture end-to-end: manual KYC review,
transaction PINs, saved bank accounts, and the manual withdrawal lifecycle with
ledger holds, admin payout processing, durable outbox events, and
reconciliation. All financial decisions remain server-side; the UI consumes
server-provided quotes, limits, and statuses.

## Scope delivered

- Manual KYC lifecycle: draft → submit → pending/under review → verified or
  rejected → withdraw-to-draft + resubmit.
- Private `kyc-documents` storage bucket; selfie + proof-of-address uploads at
  `<user-id>/<submission-id>/...`; submitted evidence locked against owner
  updates/deletes; short-lived signed URLs only.
- Six-digit transaction PIN: set/verify server-side with failed-attempt
  locking; required for withdrawals.
- Saved bank accounts: save/archive/default per user with server-side
  ownership validation and audit.
- Withdrawals: server quote (dynamic minimum, fee + cap, KYC gate,
  first-withdrawal exemption), idempotent request gated by a committed PIN
  verification stamp, ledger hold (Available → Reserved), admin
  approve/reject/mark-paid, release (Reserved → Available) on rejection,
  external payout journal on completion.
- Durable outbound events (`withdrawal.requested`/`approved`/`rejected`/
  `completed`) written transactionally for the Make.com → Telegram path.
- Reconciliation: `reconcile_withdrawals` + `reconcile_kyc` detect anomalies;
  no mutations.
- Investor web + mobile wiring and admin KYC/withdrawal/reconciliation UIs
  through the existing `InvestorDataSource` / `AdminDataSource` abstraction.

Explicitly out of scope (per Phase 8A): third-party/automated KYC, automated
payouts, crypto, FX, USD catalogue, general notifications, referrals.

## Migrations, RPCs, functions

| Artifact | Contents |
|---|---|
| `supabase/migrations/0018_kyc_schema.sql` | `kyc_submissions`, `user_pins`, `user_bank_accounts` tables; `kyc_get_own`, `kyc_save_draft`, `kyc_submit`, `kyc_withdraw_to_draft`, `set_transaction_pin`, `verify_transaction_pin`, `save_bank_account`, `archive_bank_account`, `set_default_bank_account`; private `kyc-documents` bucket + storage policies; BVN column-level masking |
| `supabase/migrations/0019_withdrawal_gates.sql` | `withdrawal_requests` extension; `quote_withdrawal`, amended `request_withdrawal` (PIN + bank-account params), amended `decide_withdrawal`; dynamic `min_withdrawal_minor` (cheapest published plan maturity when `withdrawal.min_mode = 'DYNAMIC'`); durable outbox inserts |
| `supabase/migrations/0020_kyc_withdrawal_admin.sql` | `admin_list_kyc_cases`, `admin_get_kyc_case`, `admin_decide_kyc`, `admin_list_withdrawals` (destination label + reviewer), `admin_get_withdrawal`, `reconcile_withdrawals`, `reconcile_kyc` |
| `supabase/migrations/0021_withdrawal_pin_stamp.sql` | PIN verification stamp: `user_pins.verified_until` + `security.pin.verify_window_seconds` config; `verify_transaction_pin` mints the stamp on success (committed call, so wrong-PIN counter increments always persist); `request_withdrawal` signature drops `p_pin` and requires a fresh stamp instead of verifying inside a transaction that can roll back the counter |
| `supabase/functions/kyc-document-url/index.ts` | Deployed Edge Function: `{submission_id, kind}` → 60s signed URL for owners or KYC reviewer roles; audits views; never returns public URLs |

All migrations applied to hosted `aqkynjuypijmlqnpcmza` via MCP
`apply_migration`; `kyc-document-url` deployed and ACTIVE.

## Data-source + type changes

- `packages/types`: richer `KycSummary` (steps, masked BVN, submission state),
  KYC detail/input types, PIN input types, `BankAccount` input/types, richer
  `WithdrawalQuote` (min, fee, net, `kyc_required` incl. exemption) and
  `Withdrawal` (fee/net, destination snapshot, events), `RequestWithdrawalInput.pin`; admin types extended with applicant/document/event detail, secure-document metadata, destination/reviewer/outbound fields, and reconciliation check rows.
- `packages/mock-data`: full demo-mode implementation of the new surface —
  KYC draft/save/submit/resubmit, mock document paths, PIN state, bank
  accounts, pass-through PIN on withdrawal requests, admin KYC detail/events
  and withdrawal detail/outbound data.
- `packages/supabase` investor adapter: real KYC lifecycle calls, private
  storage uploads at the constrained path, `set_transaction_pin`, bank-account
  RPCs + owner RLS reads, `quote_withdrawal` + `request_withdrawal` preceded by
  a committed `verify_transaction_pin` call (the raw PIN never enters the
  request transaction — `0021`), real withdrawal list/detail mapping; mock
  fallback preserved when unauthenticated.
- `packages/supabase` admin adapter: real KYC list/detail/decision, signed
  document URLs via `kyc-document-url`, withdrawal list/detail/decision,
  withdrawal + KYC reconciliation; mock delegation preserved unauthenticated.

## UI changes

- Web: real manual `KycForm` (draft, uploads, submit, rejected resubmit,
  masked BVN + document presence only), reworked `KycStatusPanel`, KYC page
  wiring, real `set_transaction_pin` on the security page, withdraw page with
  server quote/dynamic minimum/fee/net, saved bank-account selection +
  add-account form, PIN pass-through to `request_withdrawal`,
  first-withdrawal/KYC gate messaging; stale "no documents uploaded" copy
  removed.
- Mobile: PIN pad value passed into `requestWithdrawal`; security screen wires
  real PIN set/status; KYC screen updated — document capture points at the web
  app while the status screen stays live.
- Admin: KYC list copy de-mocked; KYC detail shows applicant identity, masked
  BVN by role, document metadata + secure viewer controls, event timeline,
  permission-gated decisions with reasons; withdrawal detail shows amount/fee/
  net, destination snapshot, reviewer, timeline, ledger hold/payout/release
  ids, outbound delivery attempts; reconciliation page adds Phase 8 integrity
  checks with warning styling.

## Verification

| Suite | Result |
|---|---|
| `node scripts/verify-migrations.mjs` (local embedded PG) | **434 passed, 0 failed** |
| `node scripts/verify-hosted-p8.mjs` | **70 passed, 0 failed** |
| `node scripts/verify-hosted-p6.mjs` (regression) | **51 passed, 0 failed** |
| `node scripts/verify-hosted-p7.mjs` phaseA / phaseB (regression) | **34 passed + 10 passed, 0 failed** |
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | clean across all packages + apps |

The post-audit additions specifically assert: `amount < ₦10,000` exempt,
`amount == ₦10,000` requires KYC, `amount > ₦10,000` requires KYC (hosted),
first-ever withdrawal exemption, declined first withdrawal still consumes the
exemption, second withdrawal always requires KYC, concurrent first withdrawals
persist exactly one row (loser gets `ERR_KYC`), `request_withdrawal` and
`quote_withdrawal` expose no client-overridable policy parameters, no-stamp
requests raise `ERR_PIN_VERIFY`, and a failed withdrawal-path PIN attempt
persists its counter increment (`0021`).

## Issues found and fixed during verification

- **PIN lockout rollback bypass (real bug, `0021`):** `request_withdrawal`
  called `verify_transaction_pin` and raised `ERR_PIN` on mismatch inside the
  same transaction, so the failed-attempt increment rolled back too — hosted
  probing showed three wrong-PIN withdrawal attempts left `failed_attempts`
  at 0. Fixed by separating verification from the request: a committed
  `verify_transaction_pin` call mints a short-lived `verified_until` stamp
  (default 120 s, `security.pin.verify_window_seconds`); `request_withdrawal`
  lost its `p_pin` parameter and requires the stamp, so no withdrawal path can
  verify a raw PIN inside a transaction that rolls back. Idempotent replays
  short-circuit before the stamp check, so retries never re-verify.
- **Hosted `post_journal` divergence (real bug):** the hosted copy was missing
  `into v_j` on the idempotent-replay path — replayed journal keys raised
  `42601 query has no destination for result data`. Caught by the Phase 6
  regression (the verifier re-uses a funding key); invisible to Phase 8 tests
  because their keys are run-unique. Re-applied the canonical `0015`
  definition to hosted; replay now returns the committed journal.
- **Local clock skew (~5 h fast):** issued sessions looked already-expired to
  supabase-js → refresh on every `getSession()` → GoTrue 429s → anon
  fallbacks. Fixed in `verify-hosted-p8.mjs` (skew measured from
  `expires_at − expires_in`, stored `expires_at` rebased) and ported to the
  `verify-hosted-p6.mjs` / `verify-hosted-p7.mjs` scripts.
- **Deterministic funding keys:** the P6/P7 verifiers' `p*-verify-fund-*`
  idempotency keys replayed instead of crediting once replay worked; keys now
  carry a `Date.now()` suffix.
- **Reconcile assertions vs. intentional fixtures:** the hosted project
  retains crafted `REVIEW_REQUIRED` mismatch fixtures; P6 now scopes the
  clean-ledger check to anomalies on investments created during the run, and
  P7 asserts every anomaly is the intentional `maturity_amount_mismatch` kind.

## Security notes

- All eligibility, fee, minimum, KYC, PIN, balance, and idempotency decisions
  are made inside `security definer` RPCs; client code never computes
  authoritative financial values.
- KYC document binaries live only in the private `kyc-documents` bucket under
  `<user-id>/<submission-id>/`; access is via 60-second signed URLs audited per
  view; submitted evidence is immutable to its owner.
- Full BVN is never returned to list surfaces — masked everywhere except
  `admin_get_kyc_case` for reviewer roles.
- PINs are stored hashed (`crypt`/`gen_salt`, pgcrypto-qualified) with
  failed-attempt locking; `verify_transaction_pin` is the only RPC that sees a
  raw PIN and it commits its counter increments independently of any
  withdrawal request (`0021`).
- Withdrawal requests are idempotent on `p_idempotency_key`; admin decisions
  carry request ids and are audited.
- Reconciliation is detection-only.

## Known limitations

- Mobile does not capture KYC documents — the status screen is live and
  directs users to the web app for the upload flow.
- Payout execution is manual by design: `MARK_PAID` records the external
  payout reference; no payment-rail integration exists in this phase.
- `withdrawal.min_mode` falls back to the configured fixed minimum when no
  published plan exists.
- The hosted project retains intentional anomaly fixtures used to exercise
  reconciliation; admin reconciliation screens will list them by design.
