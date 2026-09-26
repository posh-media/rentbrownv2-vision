# Decisions

Append-only log of product/platform decisions. Newest entries at the bottom.

## D-001 Referral signup reward default = ₦1,500 (2026-09)

The authoritative default **signup** referral reward is **₦1,500** (150,000 minor
units), superseding the historical ₦5,000 figure carried in the old repository.

Referral policy distinguishes four separate values — never conflate them:

- **Signup reward** — fixed ₦1,500 credited when a referred user qualifies.
- **Qualifying deposit** — the referred user's first deposit must reach ₦50,000.
- **Deposit-referral rate** — 1% (100 bps) of the referred user's qualifying deposits.
- **Deposit-referral cap** — up to ₦10,000 per referred user.

The deposit-referral rate/cap and qualifying deposit are illustrative mock
defaults pending confirmation. Unrelated ₦5,000 values (minimum withdrawal,
investment limits, deposit amounts) are unchanged.

Status: accepted · Scope: `ReferralPolicy` in `@rentbrown/types`, mock fixtures,
referral surfaces on web and mobile.

## D-002 Backend = Supabase + PostgreSQL (supersedes Firebase) (2026-09)

**Supabase is the official backend direction for RentBrown V2.** The Phase 0/1
plan anticipated Firebase; that direction is superseded — no Firebase code was
ever written, so nothing is removed, only re-pointed.

Concretely:

- **Auth:** Supabase Auth (email+password; email confirmation honoured).
- **Database:** Supabase PostgreSQL. Identity foundation lives in
  `public.profiles` (username, display name, account status, referral code,
  `referred_by`) and `public.admin_roles` (role grants — never an `isAdmin`
  flag). Migrations: `supabase/migrations/*.sql` applied by
  `scripts/migrate.mjs` against `DATABASE_URL`.
- **Authorization:** Row Level Security, least privilege. Users read their own
  profile and may update only `username`, `display_name`, `phone`; status and
  referral fields are server-managed. `admin_roles` is service-role write only;
  clients can read just their own grant.
- **Client architecture:** `@rentbrown/supabase` — `AuthGateway` (identity
  seam), `createSupabaseInvestorDataSource` (real auth + delegated domain
  reads), `resolveAdminActor`. Next.js apps use `@supabase/ssr` cookie
  sessions + `proxy.ts`; mobile uses `supabase-js` + AsyncStorage.
- **Data-source strategy:** `InvestorDataSource`/`AdminDataSource`/`PublicCatalogueSource`
  remain the app-facing interfaces. Auth methods are real; domain reads stay
  mock until the domain phases (Phase 3+) replace them adapter-by-adapter.
- **Deferred:** Supabase Storage (property evidence — Phase 11) and Edge
  Functions (server-authoritative writes — Phases 4+).

Status: accepted · Scope: `packages/supabase`, `supabase/migrations`, env
architecture, auth surfaces on web/mobile/admin.

## D-003 Canonical investment duration = hours; admin config = typed registry (2026-09)

Two Phase 3 decisions, locked by the Phase 3A proposal and implemented in 3B:

1. **Duration is stored as `duration_hours` (integer, elapsed-time semantics).**
   Admins author durations in hours (24 → 1 day, 8760 → 1 year); UI derives
   friendly labels. Maturity will be `activated_at + duration_hours * interval '1 hour'`
   — immune to DST/month-length drift. Calendar-tenor products (same-day-of-month)
   are out of scope; they would need a separate `tenor_months` column later.
2. **Business configuration lives in `admin_config`, a typed key registry** —
   `key + value_type + jsonb value + currency`, not a wide settings table. New
   policy values ship without migrations. Writes go exclusively through
   `set_admin_config()` (SUPER_ADMIN): validate → update → `admin_config_history`
   → `audit_log`, atomically. Reads via `get_admin_config()`. Historical records
   never depend on live config (investments carry snapshots).

Status: accepted · Scope: `supabase/migrations/0002–0004`, Phase 4+ engines.

## D-004 Double-entry ledger is the financial source of truth (2026-09)

Phase 4A proposal (docs/phases/PHASE_4A_LEDGER_WALLET_PROPOSAL.md) approved in
full — D-4.1 through D-4.10. Key decisions:

- `wallets` is a materialized projection, never an independent truth; only
  `post_journal` may write it (trigger-gated via `app.ledger_posting`).
- `post_journal` is service-role only; user-facing flows get narrow definer
  RPCs that authorize then delegate.
- Balanced ≠ valid: `assert_journal_shape` enforces each journal_type's
  permitted account/direction multiset.
- History is append-only; corrections are mirror REVERSAL journals (one per
  journal, enforced by partial unique index).
- BONUS is not directly withdrawable (BONUS_RELEASE → AVAILABLE); PENDING is
  deposit staging; system contra accounts may go negative, user buckets may
  not; `balance_after_minor` is display-only; no journal status column;
  single `INVESTMENT_PRINCIPAL_PAYABLE` with investment-level traceability
  via entity/request/metadata; USD seeded dormant, no FX path.
- Idempotency is a DB invariant (`idempotency_key` unique — replays converge).

Status: accepted · Scope: `supabase/migrations/0005–0007`, Phase 5+ financial
engines.

## D-005 Deposits/payment infrastructure (IMPLEMENTED — Phase 5B)

Phase 5A proposal: docs/phases/PHASE_5A_DEPOSIT_PAYMENT_ARCHITECTURE.md.
Key proposals (D-5.1–D-5.9 in the doc): verified-success → `FUNDING_CREDIT`;
provider reversals are `REVERSAL` journals; secrets live in Edge Function
env secrets (admin_config carries markers only); webhook endpoint URLs are
admin-visible operational config; withdrawals are manual with a durable
outbound outbox to Make; deposits are NGN-only via Paystack/KoraPay with a
provider seam for a future international provider.

Status: accepted · implemented in Phase 5B — see
docs/phases/PHASE_5B_IMPLEMENTATION_REPORT.md · Scope: `0008–0011`,
Edge Functions (init + 2 webhooks + outbox worker), admin payment overview.

## D-006 Investment engine (IMPLEMENTED — Phase 6B)

Phase 6A proposal: docs/phases/PHASE_6A_INVESTMENT_ENGINE_ARCHITECTURE.md.
Approved D-6.1–D-6.7:

- **D-6.1** Wallet-funded only. `funding_source = WALLET`; BANK_TRANSFER/CARD
  stay in the enum but `request_investment` rejects them with
  `ERR_FUNDING_SOURCE`.
- **D-6.2** Immediate activation. `activated_at = now()`,
  `matures_at = activated_at + duration_hours`; the investment is `ACTIVE` on
  commit. Round `projected_*` fields are display-only.
- **D-6.3** `seed_tag` provenance (not `is_test`). Catalogue fixtures carry
  `'p6-catalogue-fixtures'` on properties/plans/rounds; `NULL` = genuine data.
- **D-6.4** `investment_fee_bps = 0` enforced at purchase; a future non-zero
  fee plan rejects with a typed error rather than mis-posting.
- **D-6.5** `NEARING_CAPACITY` is a display concept; authoritative capacity is
  `allocated_slots`/`reserved_slots`/`total_slots` + the capacity invariant.
- **D-6.6** Dashboard composed from existing real reads; no dedicated
  aggregation RPC (evaluated during implementation — composition sufficed).
- **D-6.7** `request_investment` returns the existing `InvestmentSubmission`
  wire shape; frontend contract unchanged.

Consequences recorded during implementation: review-resolution needed its own
audited admin RPC (`admin_resolve_investment_review`) because
`apply_investment_transition` is service-only; `reconcile_investments`
excludes seed-tagged rounds from capacity checks (fixture counters simulate
history without investments); `0015` fixes a hosted-only pg-safeupdate
rejection inside `post_journal`.

Status: accepted · implemented in Phase 6B — see
docs/phases/PHASE_6B_IMPLEMENTATION_REPORT.md · Scope: `0012–0015`,
investor/admin DataSources, admin investments UI.

## D-007 Investment maturity engine (APPROVED — Phase 7A, implemented in 7B)

Phase 7A proposal: docs/phases/PHASE_7A_MATURITY_ENGINE_ARCHITECTURE.md.
Approved D-7.1–D-7.15:

- **D-7.1** Detection: scheduled `maturity-worker` Edge Function →
  `mark_due_investments` RPC; `matures_at <= now()` (database time) is
  authoritative; existing `investments_maturity_idx` bounds the scan.
- **D-7.2** Claim: conditional `UPDATE … WHERE status='MATURITY_DUE'` inside
  `settle_investment` + `FOR UPDATE SKIP LOCKED` batch claim.
- **D-7.3** One `MATURITY_CREDIT` journal, three lines:
  DR principal_payable + DR profit_payable → CR user available.
- **D-7.4** Existing `INVESTMENT_PRINCIPAL_PAYABLE` / `INVESTMENT_PROFIT_PAYABLE`
  system accounts; no new accounts or journal types.
- **D-7.5** Idempotency: claim-on-status + journal key `inv:mature:<id>` +
  transition no-ops + same-transaction events.
- **D-7.6** Settlement is a single transaction — partial settlement is
  impossible; any failure rolls back to a retryable state.
- **D-7.7** Transient failures auto-retry; REVIEW_REQUIRED only for genuine
  anomalies (admin action or reconciliation findings).
- **D-7.8** Batch 25 (config), 5-minute cadence, bounded worker runtime,
  `matures_at ASC` ordering.
- **D-7.9** Stale-SETTLING recovery (15 min) is **journal-aware**: if
  `inv:mature:<id>` journal exists, never re-post — repair state via governed
  transitions (or escalate to REVIEW on leg mismatch); if absent, the normal
  settlement path applies.
- **D-7.10** Eleven maturity reconciliation checks on `reconcile_investments`;
  read-only, never self-correcting.
- **D-7.11** `admin_retry_settlement` (FINANCE_ADMIN/SUPER_ADMIN, audited)
  uses the same settle path; journal corrections use existing
  `reverse_journal`.
- **D-7.12** Durable `outbound_events` (`investment.matured`,
  `investment.settled`, `investment.settlement_review`) in-transaction;
  in-app notifications remain Phase 10.
- **D-7.13** Settlement credits the wallet regardless of account_status —
  owed funds are never trapped; withdrawal stays a separate gate.
- **D-7.14** Currency-generic via `investment.currency`; effectively NGN-only
  (Phase 6 issues NGN investments); no FX.
- **D-7.15** `0016` + `0017` migrations + `maturity-worker`; no new tables,
  enums, journal types, or system accounts.

Status: accepted · implemented in Phase 7B — see
docs/phases/PHASE_7B_IMPLEMENTATION_REPORT.md · Scope: `0016–0017`,
`maturity-worker` Edge Function, reconciliation + admin extensions.
