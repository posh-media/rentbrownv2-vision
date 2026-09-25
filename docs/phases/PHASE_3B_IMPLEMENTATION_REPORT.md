# PHASE 3B — Core Domain & PostgreSQL Data Model: Implementation Report

**Status:** implemented and locally verified · hosted apply **blocked** (stale DB credentials, see §8)
**Implements:** `docs/phases/PHASE_3A_SCHEMA_PROPOSAL.md`
**Migrations:** `0002_domain_schema.sql` → `0003_domain_rls.sql` → `0004_admin_config_seed.sql` (forward-only; `0001_foundation.sql` untouched)

---

## 1. Summary

Phase 3B implements the approved PostgreSQL domain model on top of the Phase 2
identity foundation: the `properties → investment_plans → investment_rounds →
investments → investment_events` hierarchy, property evidence and updates, a
typed admin-editable configuration registry with history, an append-only audit
log, profile email/KYC verification fields, least-privilege RLS with
column-level hiding of internals, and server-side RPCs for config writes and
admin reads of restricted columns.

**84/84 migration checks pass** against a clean embedded PostgreSQL with a
stubbed `auth` schema (`scripts/verify-migrations.mjs`).

## 2. Database changes

### New enums (11)

| Enum | Values |
|---|---|
| `currency_code` | NGN, USD |
| `property_publication_status` | DRAFT, IN_REVIEW, PUBLISHED, ARCHIVED |
| `property_document_type` | TITLE, VALUATION, INSPECTION, COST_SCHEDULE, INSURANCE, LEGAL_OPINION, OPERATOR_AGREEMENT |
| `property_document_status` | UPLOADED, IN_REVIEW, VERIFIED, REJECTED, EXPIRED |
| `investment_plan_status` | DRAFT, PUBLISHED, PAUSED, ARCHIVED |
| `investment_round_status` | SCHEDULED, OPEN, NEARING_CAPACITY, SOLD_OUT, CLOSED, SETTLED |
| `investment_status` | PAYMENT_PENDING, ACTIVE, MATURITY_DUE, SETTLING, COMPLETED, FAILED, REFUNDED, REVIEW_REQUIRED |
| `investment_event_type` | CREATED, PAYMENT_PENDING, PAYMENT_CONFIRMED, ACTIVATED, CANCELLED, FAILED, REFUNDED, MATURED, SETTLEMENT_STARTED, SETTLED, REVIEW_REQUIRED, NOTE_ADDED |
| `funding_source` | WALLET, BANK_TRANSFER, CARD |
| `config_value_type` | MONEY_MINOR, BPS, INTEGER, TEXT, BOOLEAN, STRING_LIST |
| `audit_result` | SUCCESS, DENIED, FAILED |

### New tables (10)

- **`properties`** — asset record (slug unique citext, location split into
  public `location_label`/`area`/`city`/`state` vs internal `address`, images,
  operator, highlights, revenue model, `publication_status`). **No economics.**
- **`property_documents`** — evidence; `storage_path`, `review_note`,
  `reviewed_by` are internal-only. Check: `VERIFIED` requires `reviewed_by` +
  `reviewed_at`.
- **`property_updates`** — published property news.
- **`investment_plans`** — economic terms: `currency`, `slot_price_minor`
  (bigint > 0), `roi_bps` (int ≥ 0), **`duration_hours` (int > 0, canonical)**,
  `min_slots`, `max_slots_per_user` (≥ min when set), `eligibility` jsonb,
  `investment_fee_bps`, terms/disclosures, status. Unique `(property_id, name)`.
- **`investment_rounds`** — finite capacity: `total/allocated/reserved` slot
  counters with `allocated + reserved ≤ total`; `slot_price_minor`/`currency`
  snapshots; open/close dates (`closes > opens`); lifecycle timestamps.
  Unique `(plan_id, round_number)`. **No stored `available_slots`** — derived.
- **`investments`** — user contract with all economics frozen at creation:
  `slots`, `slot_price_minor`, `currency`, `principal_minor`
  (`= slots × slot_price`), `roi_bps`, `duration_hours`,
  `expected_profit_minor` (`⌊principal × roi_bps / 10000⌋`),
  `maturity_value_minor` (`= principal + expected_profit`), `reference`,
  `funding_source`, `status`, activation/maturity/completion timestamps,
  `payment_reference`. FKs to user/round/plan/property are `RESTRICT` — no
  cascade of financial history.
- **`investment_events`** — append-only lifecycle (`event_type`, `actor_id`,
  `actor_kind` ∈ INVESTOR/ADMIN/SYSTEM, `request_id`, `metadata`).
- **`admin_config`** — typed registry: `key` PK, `category`, `value_type`,
  `value` jsonb, `currency`, `description`, `is_active`, `updated_by`,
  timestamps.
- **`admin_config_history`** — `key`, `old_value`, `new_value`, `changed_by`,
  `reason`, `request_id`, `created_at` (bigint identity PK).
- **`audit_log`** — `actor_id`, `actor_role` (snapshot text), `action`,
  `entity_type`, `entity_id`, `result`, `request_id`, `metadata` (diffs, no
  secrets), `created_at`.

### New functions / triggers

- `has_admin_role(admin_role[])` — SECURITY DEFINER role-membership check.
- `sync_email_verified()` + trigger `on_auth_user_email_confirmed` on
  `auth.users` — copies `email_confirmed_at` state into `profiles`.
- `assert_config_value(type, value, currency)` — server-side config validation.
- `set_admin_config(key, value, reason, request_id)` — SUPER_ADMIN-only write
  path: validates, updates, writes history + audit **in one transaction**.
- `get_admin_config(keys[])` — typed read for engines (authenticated only).
- `admin_get_property(id)`, `admin_get_property_documents(property_id)` —
  SECURITY DEFINER reads returning internal columns, gated by
  `has_admin_role` (PL/pgSQL explicit guards, not WHERE predicates — see §9).
- `touch_updated_at()` (Phase 2 helper) reused on all mutable domain tables.

### Indexes

`properties_published_idx` (partial), `property_documents_property_idx`,
`property_updates_property_idx`, `investment_plans_property_idx`,
`investment_plans_public_idx` (partial), `investment_rounds_plan_idx`,
`investment_rounds_status_idx (status, closes_at)`, `investments_user_idx`,
`investments_round_idx`, `investments_property_idx`,
`investments_maturity_idx` (partial on ACTIVE/MATURITY_DUE — the Phase 7
due-scan), `investment_events_investment_idx`, `admin_config_category_idx`,
`admin_config_history_key_idx`, `audit_log_entity_idx`, `audit_log_actor_idx`,
`audit_log_created_idx`.

## 3. Profile changes

```sql
profiles + email_verified   boolean not null default false
         + email_verified_at timestamptz
         + kyc_verified      boolean not null default false
         + kyc_verified_at   timestamptz
```

- **Sync:** `on_auth_user_email_confirmed` trigger keeps `email_verified*`
  aligned with `auth.users.email_confirmed_at`. The app still prefers the live
  auth value at read time (`toAppProfile`); the column exists for RLS/joins.
- **Client-locked:** the Phase 2 column grant (`username, display_name,
  phone`) is unchanged — the new columns are not in it, so clients cannot set
  them. Verified: client `UPDATE email_verified`/`kyc_verified` → denied.
- **Login not gated:** sign-in still blocks only SUSPENDED/CLOSED. Email
  verification gates investing in Phase 6, not sign-in.
- **`kyc_verified`:** server-managed gate flag; the Phase 8 workflow flips it.
  No provider/case tables exist yet.

## 4. Admin config

### Seeded keys (10, idempotent `ON CONFLICT DO NOTHING`)

| key | value | meaning |
|---|---|---|
| `referral.signup_reward_minor` | 150000 NGN | ₦1,500 signup reward (D-001) |
| `referral.qualifying_deposit_minor` | 5000000 NGN | ₦50,000 qualifying deposit |
| `referral.deposit_referral_bps` | 100 | 1% of qualifying deposits |
| `referral.deposit_referral_cap_minor` | 1000000 NGN | ₦10,000 cap per transaction |
| `withdrawal.fee_bps` | 500 | 5% |
| `withdrawal.fee_cap_minor.NGN` | 1000000 | ₦10,000 |
| `withdrawal.fee_cap_minor.USD` | 1000 | $10 |
| `withdrawal.min_minor.NGN` | 500000 | ₦5,000 |
| `deposit.min_minor.NGN` | 100000 | ₦1,000 |
| `platform.supported_currencies` | `["NGN","USD"]` | launch currencies |

### Write path

`set_admin_config` — SUPER_ADMIN only → `assert_config_value` (MONEY_MINOR:
integer ≥ 0 + currency; BPS: 0–10000; INTEGER/TEXT/BOOLEAN/STRING_LIST type
checks) → update → `admin_config_history` → `audit_log` — atomic. No direct
client writes exist (no grants/policies).

## 5. RLS model

| Table | anon/investor | admin | writes |
|---|---|---|---|
| `properties` | published only; **`address` column not granted** | SUPPORT/OPS/SUPER read all; full row via `admin_get_property` | none (RPC only, future) |
| `property_documents` | IN_REVIEW/VERIFIED on published properties; **`storage_path`, `review_note`, `reviewed_by` not granted** | same roles via `admin_get_property_documents` | none |
| `property_updates` | published parents | same roles | none |
| `investment_plans` | published | same roles | none |
| `investment_rounds` | rounds of published plans | same roles | none |
| `investments` | own rows only | SUPPORT/OPS/FINANCE/SUPER | none |
| `investment_events` | events on own investments | same | none |
| `admin_config` / `_history` | — | policies.read roles (not KYC_REVIEWER) | `set_admin_config` RPC only |
| `audit_log` | — | audit.read roles (SUPPORT/FINANCE/SUPER) | none — inside engine txns |

## 6. Verification

`node scripts/verify-migrations.mjs` — **84/84 passed**, including:

- structure: all 10 tables, 11 enums, bigint money / int roi / int duration
- capacity: over-allocation, overflow, negative, zero-total, bad dates,
  duplicate round number — all rejected
- investment invariants: principal ≠ slots×price rejected; maturity ≠
  principal+profit rejected; zero duration/negative price/max<min rejected
- documents: VERIFIED without reviewer rejected; with reviewer accepted
- verification fields: defaults false; email sync trigger; client cannot
  update either flag
- RLS: anon sees published only, no `address`/`storage_path`; investor own-
  row only, cannot write anything domain; admin role boundaries
- admin_config: 10 seeds present; SUPER_ADMIN update → value + history +
  audit; OPS_ADMIN denied atomically (value untouched, no history); all
  `value_type` validations reject bad payloads; unknown key rejected; anon
  cannot call the RPC
- append-only: client UPDATE/DELETE on `audit_log` and `investment_events`
  denied
- `admin_get_property` returns internal columns to OPS/SUPER, empty to
  investors (guarded by explicit PL/pgSQL role check)

Builds: `pnpm typecheck` 11/11 · `pnpm lint` 11/11 zero warnings ·
`turbo run build` — site 25 routes, web 40, admin 28 — all pass.

## 7. Browser smoke test (production `next start` + headless Chromium)

| App | Routes checked | 404 | Console | Result |
|---|---|---|---|---|
| site :3003 | `/` `/explore` detail `/about` `/trust` `/learn` `/faq` `/legal/terms` @1440+390px | 404 branded | 0 errors | PASS |
| web :3000 | `/` `/explore` detail `/login` `/signup` `/forgot-password` `/how-it-works` `/faq` | branded | 0 errors | PASS |
| admin :3002 | `/login`; protected routes redirect to `/login` unauthenticated | branded | 0 errors | PASS |

No functional/UI regression — domain reads remain mock-backed, as intended.

## 8. Hosted Supabase status

**Blocked — not applied.** Both `DATABASE_URL` and `WORKER_DATABASE_URL` fail
with PostgreSQL `28P01` (password authentication failed for `postgres`),
unchanged from Phase 2. The pooler host resolves; the stored password is
stale. Required fix (outside the repo): rotate/copy the current DB password
from the Supabase project settings and update `.env` — no code change needed.
Until then `scripts/migrate.mjs` applies `0002–0004` exactly as verified
locally; nothing was faked or bypassed.

## 9. Notable implementation finding

The initial `admin_get_property` used a WHERE-clause role predicate inside a
`language sql` SECURITY DEFINER function — under nested SECURITY DEFINER +
`set local role` the predicate did **not** filter (the definer scan returned
rows to a non-admin). Caught by the verifier (`investor gets nothing from
admin RPC` failed), then rewritten as an explicit PL/pgSQL `if not
has_admin_role(...) then return` guard and confirmed filtering correctly.
Same correction applied to `admin_get_property_documents`.

Similarly, auditing *denied* config writes inside `set_admin_config` was
dropped: the raise that denies also aborts the transaction, so a `DENIED`
audit row could never persist. Denial auditing belongs at the app layer.
`audit_result` keeps `DENIED` for that future use.

## 10. Files

- `supabase/migrations/0002_domain_schema.sql` — enums, tables, constraints,
  indexes, triggers, helpers, config RPCs
- `supabase/migrations/0003_domain_rls.sql` — RLS, column grants, admin read
  RPCs, function EXECUTE privileges
- `supabase/migrations/0004_admin_config_seed.sql` — 10 idempotent defaults
- `scripts/verify-migrations.mjs` — +68 Phase 3 checks (84 total)
- `docs/phases/PHASE_3B_IMPLEMENTATION_REPORT.md` — this report
- `docs/DECISIONS.md` — D-003 logged
- `docs/ROADMAP.md` — Phase 3 status line
- `apps/web/e2e/verify-prod.mjs` — lint warning fix

## 11. Deferred (explicitly NOT implemented)

Wallets, double-entry ledger, deposits, payment providers/webhooks, investment
purchase/checkout, capacity reservation engine, maturity engine, withdrawals,
KYC provider/case workflow, referral payout engine, notifications, FX, tax,
production financial mutations, and full domain adapter replacement — all
Phase 4+. `investments.id`, `request_id`, `funding_source`, and the
`investments_maturity_idx` are the designed anchor points.

## 12. Git

Committed on `main` and pushed to `posh-media/rentbrownv2-vision`
(see `git log` — `feat(db): implement phase 3 core domain schema`).
