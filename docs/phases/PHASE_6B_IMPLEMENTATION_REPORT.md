# Phase 6B — Investment Engine Implementation + Real Catalogue Data

Status: **COMPLETE** · Implemented per `PHASE_6A_INVESTMENT_ENGINE_ARCHITECTURE.md`
and the approved D-6.1–D-6.7 decisions (see `docs/DECISIONS.md` D-006).

Scope delivered: atomic wallet-funded investment purchase RPC, governed
lifecycle transitions, write guards, admin read/review/reconciliation RPCs,
the six-item mock catalogue seeded as real Supabase rows (`seed_tag =
'p6-catalogue-fixtures'`), and investor/admin DataSource wiring to real
Supabase. Mock data remains as an explicit fallback (`packages/mock-data`
unchanged; providers fall back when Supabase is not configured).

## 1. Migrations

| File | Contents |
|---|---|
| `supabase/migrations/0012_catalogue_seed.sql` | `seed_tag` column on `properties`, `investment_plans`, `investment_rounds` (all `p6-catalogue-fixtures`); six properties/plans/rounds seeded idempotently; no users/wallets/ledger/investment rows |
| `supabase/migrations/0013_investment_engine.sql` | `investments.idempotency_key` + unique partial index; write guards on `investments`, `investment_events`, `investment_rounds` (require `app.investment_write='1'`); `apply_investment_transition()` (service-only, transition map); `request_investment()`; `investment_quote()`; `list_opportunities()`; grants tuned |
| `supabase/migrations/0014_investment_admin.sql` | `admin_list_investments`, `admin_investment_detail` (events + journals + seed provenance), `admin_mark_investment_review`, `admin_resolve_investment_review` (audited), `reconcile_investments` |
| `supabase/migrations/0015_post_journal_safeupdate_fix.sql` | `create or replace post_journal` — identical body; `delete from pg_temp.ledger_post_lines` → `... where true` for hosted `pg-safeupdate` |

All migrations are forward-only; `0001`–`0011` untouched.

## 2. `request_investment()` — atomic purchase flow

Single transaction, in order:

1. Auth gate: `auth.uid()`, `account_status='ACTIVE'`, `email_verified`
   (existing Phase 3A typed errors).
2. Validate request: wallet funding only (`ERR_FUNDING_SOURCE` for
   BANK_TRANSFER/CARD — D-6.1); slots integer.
3. Idempotency replay: same user + key + same round/slots → return the
   existing investment; same key + different params →
   `ERR_IDEMPOTENCY_CONFLICT`. Concurrent same-key inserts hit
   `unique_violation` and converge to the winner.
4. Catalogue validation (before locking): published property + plan,
   plan↔round relationship, currency agreement, `investment_fee_bps = 0`
   (D-6.4 — non-zero fee rejects rather than silently mis-posting).
5. Atomic conditional capacity claim — one UPDATE with
   `status='OPEN'`, `opens_at <= now() < closes_at`,
   `allocated + reserved + requested <= total`; only a single-row match
   proceeds (no client-side capacity trust). Loser gets
   `ERR_ROUND_NOT_OPEN` / `ERR_ROUND_CAPACITY_EXCEEDED`.
6. Per-user cumulative cap check (`min/max_slots_per_user`).
7. `post_journal('HOLD', …)`: `user:uid:available → user:uid:reserved`
   — CHECK-violation mapped to `ERR_INSUFFICIENT_BALANCE` (whole txn
   rolls back, including the capacity claim).
8. `post_journal('INVESTMENT_DEBIT', …)`:
   `user:uid:reserved → system:investment_principal_payable`.
9. Investment snapshot row (`ACTIVE`; `activated_at = now()`,
   `matures_at = activated_at + duration_hours` — D-6.2) + 3 events
   (`CREATED`, `PAYMENT_CONFIRMED`, `ACTIVATED`), under
   `app.investment_write='1'`.
10. Returns `InvestmentSubmission` wire shape (D-6.7).

All economics are server-derived: `principal = slots ×
round.slot_price_minor`, `expected_profit = floor(principal × roi_bps /
10000)`, `maturity = principal + profit` — bigint minor units, no floats.

## 3. Catalogue seed (0012)

Six properties → six plans → six rounds, mirroring the mock data with
`seed_tag='p6-catalogue-fixtures'` on every row:

| Slug | Plan | Round state |
|---|---|---|
| the-terraces-ikoyi | ₦10,000,000/slot · 16.5% · 8760h | R2 OPEN 500/332/8 |
| palm-court-lekki | ₦5,000,000 · 14% · 6570h | R2 NEARING_CAPACITY 1200/1086/6 |
| wuse-square-residences | ₦1,000,000 · 12.5% · 4380h | R3 SOLD_OUT 2000/2000/0 |
| harbour-view-suites | ₦2,500,000 · 15% · 5840h | R1 OPEN 1000/322/18 |
| bodija-gardens | ₦1,000,000 · 13% · 4380h | R1 OPEN 3000/340/20 |
| maitama-heights | ₦25,000,000 · 17% · 13140h | R1 SCHEDULED 200/0/0 |

All NGN, `investment_fee_bps=0`, `status='PUBLISHED'`; fictional/test
markers preserved; durations are the approved elapsed-hours conversions
(30-day month = 720h). No financial fixtures seeded. `seed_tag` makes the
set enumerable/auditable and deliberately keeps it out of genuine-data
reconciliation paths.

## 4. Admin RPCs (0014)

- `admin_list_investments` — filters: status, property, plan, round,
  user; returns property/plan/round, funding source, snapshot economics,
  seed provenance, user display name (profiles join).
- `admin_investment_detail` — full row + ordered `investment_events` +
  funding journal references.
- `admin_mark_investment_review` / `admin_resolve_investment_review` —
  audited (`audit_log`) review transitions via the governed transition
  map; admin-specific RPCs (not the service-only
  `apply_investment_transition`).
- `reconcile_investments` — missing/mismatched funding journals,
  capacity drift, duplicate idempotency keys, duplicate funding journals,
  currency inconsistencies, orphan events. Seed-tagged rounds are
  excluded from the capacity check (their counters simulate historical
  allocation without backing investments by design).

All gated by the existing admin-role bundles; `authenticated` EXECUTE
with in-function role checks.

## 5. DataSource wiring

**Investor** (`packages/supabase/src/investor-data-source.ts`): real
implementations for `listOpportunities`/`getOpportunity`
(`list_opportunities` + catalogue detail), `quoteInvestment`
(`investment_quote`), `submitInvestment` (`request_investment`),
`getSubmission`, `listInvestments`, `getInvestment` (row + events),
`getWallet`, `listTransactions`/`getTransaction`, dashboard composed from
the real reads (D-6.6 — no dedicated aggregation RPC was required).
snake_case → camelCase mapping into shared types; UI unchanged.

**Admin** (`packages/supabase/src/admin-data-source.ts` + hooks/pages):
list/detail/review/reconciliation wired to the 0014 RPCs; investment
detail shows real event timeline, seed tag, and funding journal refs;
list page shows the reconciliation panel to authorized finance roles.
Mock/demo fallback preserved where Supabase is unconfigured.

## 6. Hosted verification — `scripts/verify-hosted-p6.mjs`

Real JWTs (`ada.investor@` investor, `tunde.admin@` FINANCE_ADMIN).
**50 passed, 0 failed.** Coverage: anon denials; all six seeded
opportunities; quote arithmetic (2 × ₦10,000 @13% → profit 260,000 kobo,
maturity 2,260,000); investor→admin denial; direct INSERT blocked;
`ERR_FUNDING_SOURCE` (BANK_TRANSFER), `ERR_ROUND_NOT_OPEN` (SOLD_OUT,
SCHEDULED); audited `admin_post_adjustment` funding; happy path ACTIVE
with correct snapshots/maturity/capacity(+2)/exact wallet debit/3
events/HOLD+INVESTMENT_DEBIT; idempotent replay (no double debit/journal)
+ `ERR_IDEMPOTENCY_CONFLICT`; `ERR_INSUFFICIENT_BALANCE` with no capacity
leak; `ERR_INVESTMENT_LIMIT_EXCEEDED`; admin list/detail/reconcile;
`reconcile_investments` and `reconcile_wallets` clean.

## 7. Issue found & fixed during hosted verification

**pg-safeupdate hosted-only failure.** `post_journal` ends with
`delete from pg_temp.ledger_post_lines;` — hosted Supabase enables
pg-safeupdate, which rejects unconditional DELETE; local embedded PG
doesn't, so it never surfaced locally. Fixed forward-only in
`0015_post_journal_safeupdate_fix.sql` (`create or replace`, identical
body, `where true`). This also un-broke hosted wallet funding
(`admin_post_adjustment` → `post_journal`) generally, not just tests.

## 8. Deviations from Phase 6A

- `admin_resolve_investment_review` added (service-only transition RPC
  can't be called by authenticated admins) — audited, admin-gated.
- `reconcile_investments` capacity check excludes seed-tagged rounds.
- `0015` migration added (hosted pg-safeupdate).
- `NEARING_CAPACITY` kept as stored mock state on the seeded Palm Court
  row for UI coverage; engine treats it as non-buyable unless OPEN
  (D-6.5 derived- concept stance holds for new rounds).

## 9. Test-catalogue cleanup procedure

All fixture rows carry `seed_tag='p6-catalogue-fixtures'` on
`investment_rounds`, `investment_plans`, `properties`. Deletion order
(dependency-safe): rounds → plans → properties. **FK guard:**
`investments.round_id`/`plan_id`/`property_id` are `ON DELETE RESTRICT`
— once a real investment references a seeded round, that round (and its
plan/property) **cannot be deleted** without deleting investments, which
write guards block. Replace-with-real procedure: seed genuine catalogue
rows with `seed_tag IS NULL`, publish them, then delete unreferenced
fixture rounds/plans/properties; leave any fixture row that has real
investments (it is now historical provenance).

## 10. Deferred to Phase 7+

Maturity detection/settlement, `MATURITY_CREDIT`, profit payout,
settlement sweeps/notifications; non-zero `investment_fee_bps` journal
shape (currently rejects); BANK_TRANSFER/CARD funding checkout; KYC/PIN/
referral gates; USD.

## 11. Verification summary

| Check | Result |
|---|---|
| `scripts/verify-migrations.mjs` (local embedded PG) | 305 / 0 |
| `scripts/verify-hosted-p6.mjs` (hosted, real JWTs) | 50 / 0 |
| `pnpm typecheck` | clean (workspace) |
| `pnpm lint` | clean (11 tasks) |
| `pnpm build` | web + admin + site all green |
