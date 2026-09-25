# Phase 4B — Double-Entry Ledger + Wallet Implementation Report

**Status: COMPLETE — applied and verified on hosted Supabase** ·
Project `aqkynjuypijmlqnpcmza` · Migrations `0005–0007` in
`public.schema_migrations`.

## Schema (0005_ledger_schema.sql)

**Enums (5):** `ledger_account_kind` (USER/SYSTEM), `wallet_bucket`
(AVAILABLE/RESERVED/BONUS/PENDING), `entry_direction` (DEBIT/CREDIT),
`system_account_kind` (7 platform contra accounts), `journal_type` (15 types).

**Tables (4):**

- `journal_entries` — immutable balanced transaction header. Unique
  `reference` + `idempotency_key`; `reverses_journal_id` with a partial unique
  index (at most one reversal per journal); `entity_type`/`entity_id`/
  `request_id`/`initiated_by`/`actor_kind`/`metadata` for end-to-end
  traceability (e.g. a specific investment through `INVESTMENT_DEBIT` →
  `MATURITY_CREDIT`).
- `ledger_entries` — append-only DR/CR lines; `amount_minor bigint > 0`;
  `balance_after_minor` is a display snapshot only — never authoritative.
- `ledger_accounts` — chart of accounts. USER accounts
  (`user:<uid>:<bucket>:<cur>`, unique per owner/bucket/currency) are lazily
  provisioned inside `post_journal`; SYSTEM accounts
  (`system:<kind>:<cur>`) are seeded and must pre-exist.
- `wallets` — per (user, currency) materialized projection, all four buckets
  `check >= 0`. Writable **only** while `app.ledger_posting=1`, a flag set
  transaction-locally inside `post_journal` — enforced by a trigger that
  blocks even superuser INSERT/UPDATE/DELETE.

**Guards:** `assert_immutable` triggers make `journal_entries`,
`ledger_entries`, `ledger_accounts` insert-only (UPDATE/DELETE rejected even
for superusers). Deferred constraint triggers re-verify at COMMIT that every
journal has ≥2 lines, ΣDR=ΣCR, and no cross-currency line — so direct table
inserts cannot bypass `post_journal`'s invariants.

## post_journal() — the single write path

Atomic sequence inside one transaction: require `idempotency_key` →
idempotent header insert (`on conflict do nothing`; a replay returns the
originally committed journal — never a second effect) → resolve/provision
accounts (lazy, rolls back on failure) → early ΣDR=ΣCR check →
`assert_journal_shape` (journal-type whitelist: e.g. HOLD = DR AVAILABLE/CR
RESERVED only; a *balanced but invalid* journal is rejected) → wallet row
upsert + `FOR UPDATE` lock (serializes concurrent postings per
user+currency) → ordered bucket updates (`check >= 0` rejects insufficient
funds) + line inserts with `balance_after` snapshots → deferred commit-time
re-verification.

`post_journal` EXECUTE is revoked from `public`/`anon`/`authenticated` and
granted only to `service_role` — clients cannot post journals directly
(D-4.2).

## RLS + RPCs (0006_ledger_rls.sql)

- RLS enabled on all four tables; SELECT-only grants for `authenticated`;
  **zero client write policies**.
- Owner policies: wallets by `user_id`, accounts by `owner_user_id`, journals
  and lines via "touches one of my accounts".
- Admin read policies: `has_admin_role(SUPPORT, FINANCE_ADMIN, SUPER_ADMIN)`
  (the `finance.read` permission map).
- `admin_post_adjustment()` — FINANCE_ADMIN/SUPER_ADMIN only; mandatory
  reason + positive amount; posts a balanced ADMIN_ADJUSTMENT journal
  (user bucket ↔ system ADJUSTMENTS contra) and an `audit_log` row in the
  same transaction.
- `reverse_journal()` — finance roles (or service); posts an exact mirror
  REVERSAL journal; rejects re-reversals, REVERSAL-of-REVERSAL, blank reason.
- `reconcile_wallets()` — recomputes every bucket from ledger lines and FULL
  JOINs against stored balances; returns only mismatches (empty = clean);
  visible to finance roles / service only.
- `get_wallet_transactions(limit, before_id)` — keyset-paginated feed of the
  caller's own ledger lines, newest first.

## Seeds (0007_system_accounts_seed.sql)

14 deterministic contra accounts — 7 `system_account_kind` × NGN/USD
(`system:<kind>:<cur>`), idempotent via `on conflict (key) do nothing`.
USD is seeded but dormant (D-4.10 — no FX path).

## Verification

### Local — `scripts/verify-migrations.mjs` (embedded PostgreSQL)

**155/155 checks pass** on a clean database applying `0001–0007` in order.
Phase 4 coverage: lazy wallet provisioning, funding/hold/release flows,
idempotent replay convergence, unbalanced & wrong-shape & single-line &
non-positive & unknown-account rejections, failed-posting rollback
(leaves no wallet/accounts/journal), overdraft rejection, NGN/USD isolation,
cross-currency commit rejection, immutability triggers, wallet write guard,
reversal mirror + duplicate-reversal + reverse-of-reversal rejection,
admin adjustment authorization/reason/audit/atomicity, reconciliation
zero-diff, concurrent competing holds serializing to exactly one winner,
RLS owner/admin/anon boundaries, transaction feed, seed count, and
migration-tracking exclusivity.

### Hosted — Supabase MCP (`aqkynjuypijmlqnpcmza`)

All three migrations applied verbatim, each in one transaction, tracked in
`public.schema_migrations` (no second tracker). Structural inventory: 18
public tables, 18 enums, 8 ledger policies, RLS on all 4 tables, all 7
functions, 14 system accounts, 7/7 migrations.

Live behavioral probes (real `authenticated`/`anon` roles + JWT claims):

| Probe | Result |
|---|---|
| FUNDING_CREDIT → lazy wallet, avail=100000 | pass |
| Idempotent replay → same journal, no second effect | pass |
| HOLD 40000 → HOLD_RELEASE restore | pass |
| USD funding isolated to USD wallet | pass |
| Overdraft hold rejected (CHECK ≥0) | pass |
| Unbalanced / wrong-shape / non-positive / single-line journals rejected | pass |
| Cross-currency journal rejected at commit | pass |
| Journal/ledger/account immutability; direct wallet write blocked | pass |
| Reversal posted; duplicate reversal rejected | pass |
| Investor: sees only own wallets/journals/lines; feed works; all writes + `post_journal` + `admin_post_adjustment` + `reverse_journal` denied | pass |
| Other user sees zero | pass |
| FINANCE_ADMIN: reads all; `admin_post_adjustment` posts journal + audit row atomically | pass |
| Anon: all ledger reads/feed/reconcile denied | pass |
| `reconcile_wallets()` → 0 diffs | pass |

Fixtures fully removed afterward (zero residual users/profiles/wallets/
accounts/journals/lines/audit rows; 14 system accounts intact).

## Issues found & fixed

1. **`assert_journal_shape` self-match** — the reversal duplicate check ran
   after the new header was inserted and matched itself. Fixed by passing
   `p_self` and excluding it.
2. **Deferred-trigger ACL (hosted-only)** — `trg_assert_journal_balanced` /
   `trg_assert_line_balanced` call `assert_journal_balanced`, whose EXECUTE is
   revoked from `authenticated`; deferred triggers fire under the invoking
   role at COMMIT, so `admin_post_adjustment` failed hosted-side with 42501.
   The embedded verifier could not catch this (its `authenticated` stub is
   privileged). Fixed: both trigger functions are now `security definer`
   (repo `0005` updated and applied hosted).
3. **Embedded `auth.uid()` stub** — `''::jsonb` on empty claims; stub fixed
   (harness-only change).
4. **Hosted seed typo** — `investment_profit_payable:NGN` was applied with
   currency USD during the manual `0007` apply; corrected in one transaction
   (bad row removed via temporary trigger disable, both rows re-seeded).
   Verified: 14/14 accounts correct.

## Rules held

Ledger is the source of truth; wallets are a mutable-in-place projection only
inside `post_journal`; no client balance mutation; bigint minor units only;
no floats; NGN/USD isolation enforced; append-only history with reversal-only
corrections; atomic financial mutations; concurrency serialized per
(user,currency); idempotency as a DB invariant; provider-agnostic ledger.
Migrations `0001–0004` untouched; no unrelated app/UI changes.

## Deferred (Phase 5+)

Deposits/providers (Paystack/KoraPay), withdrawals (HOLD → HOLD_DEBIT /
HOLD_RELEASE → EXTERNAL_PAYOUT with fee split), investment purchase
(INVESTMENT_DEBIT), maturity (MATURITY_CREDIT principal+profit legs),
referral rewards (REWARD_CREDIT → BONUS_RELEASE), PENDING_CREDIT /
PENDING_CONFIRM staging, FX, notifications.
