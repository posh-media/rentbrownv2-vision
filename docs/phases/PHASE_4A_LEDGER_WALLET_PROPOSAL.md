# PHASE 4A — Double-Entry Ledger + Wallet: Architecture & Schema Proposal

**Status:** proposal for review — **no Phase 4 schema, SQL, or code is implemented.**
**Repository:** `posh-media/rentbrownv2-vision` · branch `main`
**Scope:** financial foundation architecture only. Nothing here implements
deposits, withdrawals, investment purchases, maturity, referral payouts,
payment providers, or FX execution — those are Phases 5–9 and consume this
foundation.

---

## 1. Executive summary

Phase 4A proposes a classical double-entry ledger as the **single financial
source of truth**, with user wallets as a **materialized, lockable projection**
of ledger state:

```
journal_entries (transaction header — balanced, immutable, idempotent)
  → ledger_entries (debit/credit lines — append-only)
      → ledger_accounts (user bucket accounts + platform system accounts)
wallets (per user×currency: available/reserved/bonus/pending — updated only
         inside post_journal under row lock; reconcilable against the ledger)
```

Headline decisions:

- **Every financial fact is a balanced journal.** Each journal has ≥2 lines;
  Σ debits = Σ credits, all lines one currency, all lines reference accounts.
- **Corrections are reversals, never edits.** `journal_entries` and
  `ledger_entries` are insert-only; a trigger blocks UPDATE/DELETE.
- **Wallet balances are derived, never authoritative-input.** `wallets` rows
  are updated only inside `post_journal()` in the same transaction that
  inserts the journal — under `SELECT … FOR UPDATE` on the wallet row.
- **Idempotency is structural.** `journal_entries.idempotency_key` is unique;
  a retried posting returns the already-committed journal instead of
  double-posting.
- **Currency is an invariant, not a field you can mix.** One journal = one
  currency; every line's account must match it. There is no FX path at all —
  Phase 9+ would add explicit conversion journals between currency-isolated
  accounts.
- **Provider logic never enters the ledger.** Paystack/KoraPay references are
  metadata/idempotency inputs on journals; the ledger knows nothing about
  providers.

---

## 2. What exists today (Phase 3B truth)

Verified against `supabase/migrations/0002–0004` (applied to hosted project
`aqkynjuypijmlqnpcmza`, tracked in `public.schema_migrations`).

| Existing element | Phase 4 relevance |
|---|---|
| `public.profiles` (`id` FK → `auth.users`) | wallet owner key |
| `public.admin_roles` + `has_admin_role(roles[])` | finance-read/write gates |
| `public.currency_code` (`NGN`,`USD`) | reused for all money columns |
| `public.investments` (snapshot economics) | gains `funding_journal_id` linkage in Phase 6 — not now |
| `public.investment_events` (`request_id` dedup field) | same convention reused on journals |
| `public.admin_config` + `set_admin_config()` | fee/minimum policy already seeded |
| `public.audit_log` | admin adjustments must write audit rows atomically |
| `touch_updated_at()` | reused for `wallets.updated_at` |

Client contract already fixed in `@rentbrown/types` (Phase 1):
`WalletAccountType = AVAILABLE | RESERVED | BONUS | PENDING`, `WalletSummary`,
`Transaction`/`TransactionType`, money = integer minor units, ROI = bps.
The DB design below is built to serve exactly these projections.

---

## 3. Proposed schema

### A. New tables

| Table | Purpose |
|---|---|
| `ledger_accounts` | Chart of accounts: per-user bucket accounts + platform system accounts |
| `journal_entries` | Transaction header: type, currency, reference, idempotency, entity link, reversal link |
| `ledger_entries` | Journal lines: account × direction × amount_minor |
| `wallets` | Materialized per-(user, currency) bucket balances; lockable row |

No new columns on `profiles`, `investments`, or other Phase 3B tables in this
phase. Future phases add their own tables (`deposits`, `withdrawals`, …) with
`journal_id`/`request_id` columns pointing here.

### B/C/D/E. Columns, keys, uniques, checks

#### `ledger_accounts`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK `gen_random_uuid()` | |
| `key` | `text` UNIQUE NOT NULL | deterministic, e.g. `user:<uid>:available:NGN`, `system:deposits_clearing:USD` |
| `kind` | `ledger_account_kind` NOT NULL | `USER` / `SYSTEM` |
| `owner_user_id` | `uuid` FK → `profiles(id)` ON DELETE RESTRICT | NULL for system; required for USER |
| `bucket` | `wallet_bucket` | required iff kind=USER; NULL for SYSTEM |
| `system_kind` | `system_account_kind` | required iff kind=SYSTEM |
| `currency` | `currency_code` NOT NULL | |
| `created_at` | `timestamptz` default now() | |

Checks: `kind='USER'` ⇔ (`owner_user_id` NOT NULL AND `bucket` NOT NULL AND
`system_kind` IS NULL); symmetric for `SYSTEM`.
Unique: `key`; and partial unique `(owner_user_id, bucket, currency)` where
`kind='USER'`; `(system_kind, currency)` where `kind='SYSTEM'`.

#### `journal_entries`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `reference` | `text` UNIQUE NOT NULL | human-facing, prefixed per type (`JRN-…`, `RVS-…`) |
| `idempotency_key` | `text` UNIQUE NOT NULL | caller-supplied (`dep:<ref>`, `wd:<uuid>`, `adj:<uuid>`); retried posts return existing row |
| `journal_type` | `journal_type` NOT NULL | enum below |
| `currency` | `currency_code` NOT NULL | all lines must match |
| `status` | — none — | journals are final once committed; correction = reversal journal |
| `reverses_journal_id` | `uuid` FK → `journal_entries(id)` | set iff `journal_type='REVERSAL'` |
| `entity_type` | `text` | `deposit`, `withdrawal`, `investment`, `reward`, `adjustment` |
| `entity_id` | `text` | entity PK/reference; text like `audit_log.entity_id` |
| `initiated_by` | `uuid` FK → `auth.users` | actor (null = system) |
| `actor_kind` | `text` check in (`INVESTOR`,`ADMIN`,`SYSTEM`) | mirrors `investment_events` |
| `request_id` | `text` | client/caller correlation id |
| `description` | `text` NOT NULL | |
| `metadata` | `jsonb` default `'{}'` | provider refs, never secrets |
| `created_at` | `timestamptz` default now() | |

Index on `(entity_type, entity_id)`, `created_at desc`, `initiated_by`.
Unique partial index on `reverses_journal_id` where not null → **a journal
can be reversed at most once.**

#### `ledger_entries`

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` generated always as identity PK | monotonic global order |
| `journal_id` | `uuid` FK → `journal_entries` ON DELETE RESTRICT | |
| `account_id` | `uuid` FK → `ledger_accounts` ON DELETE RESTRICT | |
| `direction` | `entry_direction` NOT NULL | `DEBIT`/`CREDIT` |
| `amount_minor` | `bigint` NOT NULL CHECK `> 0` | |
| `balance_after_minor` | `bigint` | for USER accounts: bucket balance after this posting (set by `post_journal`); NULL for system accounts. Feeds `Transaction.balanceAfter`. |
| `created_at` | `timestamptz` default now() | |

Index `(account_id, id)`, `(journal_id)`.
No currency column — currency lives on journal + account; `post_journal`
rejects any account whose currency ≠ journal currency (cross-currency is
structurally impossible).

#### `wallets`

| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid` FK → `profiles(id)` ON DELETE RESTRICT | |
| `currency` | `currency_code` NOT NULL | |
| `available_minor` | `bigint` NOT NULL default 0 CHECK `>= 0` | |
| `reserved_minor` | `bigint` NOT NULL default 0 CHECK `>= 0` | |
| `bonus_minor` | `bigint` NOT NULL default 0 CHECK `>= 0` | |
| `pending_minor` | `bigint` NOT NULL default 0 CHECK `>= 0` | |
| `updated_at` | `timestamptz` default now() | `touch_updated_at` |

PK `(user_id, currency)`. **The four CHECKs are the "never negative"
invariant** — the wallet row is locked before mutation, so a concurrent
posting serializes and sees the committed balance.

### G. Enums

```sql
ledger_account_kind   = USER | SYSTEM
wallet_bucket         = AVAILABLE | RESERVED | BONUS | PENDING   -- mirrors WalletAccountType
entry_direction       = DEBIT | CREDIT
system_account_kind   = DEPOSITS_CLEARING | PAYOUTS_CLEARING | FEE_REVENUE
                      | INVESTMENT_PRINCIPAL_PAYABLE | REWARD_EXPENSE | ADJUSTMENTS
journal_type          = FUNDING_CREDIT | PENDING_CREDIT | PENDING_CONFIRM
                      | HOLD | HOLD_RELEASE | HOLD_DEBIT
                      | REFUND | ADMIN_ADJUSTMENT | REVERSAL
                      | INVESTMENT_DEBIT | MATURITY_CREDIT | EXTERNAL_PAYOUT
                      | REWARD_CREDIT | BONUS_RELEASE | FEE_DEBIT
```

`journal_type` values beyond Phase 4's active flows (`INVESTMENT_DEBIT`,
`MATURITY_CREDIT`, `EXTERNAL_PAYOUT`, `REWARD_CREDIT`, `BONUS_RELEASE`) are
declared now so later phases add **no enum migrations** — they only add
caller RPCs.

### System accounts (seeded, both currencies)

| `system_kind` | Economic meaning |
|---|---|
| `DEPOSITS_CLEARING` | Funds arrived from outside; contra to user credits |
| `PAYOUTS_CLEARING` | Funds left the platform; contra to user debits |
| `FEE_REVENUE` | Platform fees (withdrawal fee leg) |
| `INVESTMENT_PRINCIPAL_PAYABLE` | User principal committed to investments; released to operator/settlement later |
| `REWARD_EXPENSE` | Referral/reward cost |
| `ADJUSTMENTS` | Admin/manual correction contra |

Each seeded as `system:<kind>:<NGN|USD>` — 12 rows, `ON CONFLICT DO NOTHING`,
no user data.

---

## 4. Sign convention & journal flows (N)

Convention: **CREDIT increases a user bucket; DEBIT decreases it.** System
accounts are bookkeeping contra (they may carry net negative balances — the
non-negativity invariant applies to user buckets only).

| # | Flow | Journal type | Lines (DEBIT → CREDIT) | Wallet effect |
|---|---|---|---|---|
| 1 | Deposit confirmed → wallet funding | `FUNDING_CREDIT` | DR `system:deposits_clearing` → CR `user:available` | available +amt |
| 2 | Deposit pending (awaiting confirm) | `PENDING_CREDIT` | DR `system:deposits_clearing` → CR `user:pending` | pending +amt |
| 3 | Pending confirms | `PENDING_CONFIRM` | DR `user:pending` → CR `user:available` | pending −amt, available +amt |
| 4 | Reservation (withdrawal request / wallet-funded purchase) | `HOLD` | DR `user:available` → CR `user:reserved` | available −amt, reserved +amt |
| 5 | Release (withdrawal rejected / purchase aborted) | `HOLD_RELEASE` | DR `user:reserved` → CR `user:available` | reserved −amt, available +amt |
| 6 | Completed debit (payout executed / investment activated) | `HOLD_DEBIT` or `EXTERNAL_PAYOUT` | DR `user:reserved` → CR `system:payouts_clearing` (and for withdrawals a second CR `system:fee_revenue` for the fee leg) | reserved −amt |
| 7 | Refund of a deposit | `REFUND` | DR `system:deposits_clearing` → CR `user:available` | available +amt |
| 8 | Admin credit adjustment | `ADMIN_ADJUSTMENT` | DR `system:adjustments` → CR `user:<bucket>` | bucket +amt |
| 8b | Admin debit adjustment | `ADMIN_ADJUSTMENT` | DR `user:<bucket>` → CR `system:adjustments` | bucket −amt (fails if insufficient) |
| 9 | Wallet-funded investment (Phase 6) | `HOLD` then `INVESTMENT_DEBIT` | DR available → CR reserved; then DR `user:reserved` → CR `system:investment_principal_payable` | moves committed principal out of wallet into the payable |
| 10 | Maturity settlement (Phase 7) | `MATURITY_CREDIT` | DR `system:investment_principal_payable` → CR `user:available` (principal leg) + DR `system:reward_expense`-class profit account → CR `user:available` (profit leg) | available += maturity_value |
| 11 | Withdrawal (Phase 8) | `HOLD` → `EXTERNAL_PAYOUT` | DR available → CR reserved (gross); on payout: DR `user:reserved` (gross) → CR `system:payouts_clearing` (net) + CR `system:fee_revenue` (fee) | available/reserved move, then reserved drains |
| 12 | Referral reward (Phase 9) | `REWARD_CREDIT` → `BONUS_RELEASE` | DR `system:reward_expense` → CR `user:bonus`; when eligible to spend/withdraw: DR `user:bonus` → CR `user:available` | bonus +amt → later available +amt |

Multi-line journals (fee split, principal+profit) are why `post_journal`
takes a **lines array**, not a debit/credit pair.

Reversal of any journal `J`: new journal `type=REVERSAL`,
`reverses_journal_id=J.id`, lines = J's lines with directions swapped.
Original row untouched; the reversal itself is balanced and idempotent.

---

## 5. Core write path — `post_journal` (I)

```
post_journal(
  p_journal_type, p_currency, p_lines jsonb,
  p_reference, p_idempotency_key,
  p_entity_type, p_entity_id, p_actor_kind, p_request_id, p_description, p_metadata
) returns journal_entries
```

Atomic sequence (single transaction, SECURITY DEFINER):

1. **Idempotent replay:** `INSERT journal … ON CONFLICT (idempotency_key)
   DO NOTHING RETURNING id`; if nothing returned, `SELECT` the existing
   journal by key and return it — duplicate calls converge, never double-post.
2. **Resolve accounts** from `p_lines` keys (`user:<uid>:<bucket>:<cur>` /
   `system:<kind>:<cur>`); create missing user accounts lazily. Reject any
   account whose currency ≠ journal currency.
3. **Validate:** ≥2 lines; amounts `> 0`; Σ debits = Σ credits; journal type
   whitelist vs account kinds (e.g. `HOLD` must touch only the owner's
   AVAILABLE+RESERVED buckets — encoded per type).
4. **Lock:** `SELECT … FOR UPDATE` the `wallets` row (INSERT … ON CONFLICT
   create with zeros first). One wallet per journal — a single journal never
   mutates two users' wallets.
5. **Apply bucket deltas** (CR +amt / DR −amt per user line), update wallet
   columns — the `>= 0` CHECK rejects insufficient funds.
6. **Insert lines** with computed `balance_after_minor` per user account.
7. **Deferred constraint trigger** re-verifies Σ DR = Σ CR and line-account
   currency match at COMMIT — belt-and-suspenders even if a future caller
   bypasses the RPC.

Other RPCs:

| Function | Caller | Behaviour |
|---|---|---|
| `admin_post_adjustment(user, currency, bucket, amount, direction, reason, request_id)` | authenticated, gated `has_admin_role(FINANCE_ADMIN, SUPER_ADMIN)` | wraps `post_journal` for `ADJUSTMENTS` contra + writes `audit_log` (`config.update`-style) in the same txn; `reason` required |
| `reverse_journal(journal_id, reason, request_id)` | service role / admin-gated | mirror journal; refuses if already reversed or journal type not reversible (e.g. you reverse a `FUNDING_CREDIT`, not a `HOLD` — you `HOLD_RELEASE` it) |
| `reconcile_wallets(p_user_id default null)` | `finance.reconcile` roles (FINANCE_ADMIN, SUPER_ADMIN) | recomputes bucket balances from `ledger_entries` vs `wallets`; returns diff rows (empty = clean) |
| `get_wallet_transactions(user, cursor, limit)` | owner via RLS-safe read | user-facing transaction feed projected from `journal_entries`+`ledger_entries` filtered to their accounts — feeds `Transaction` view model |

**Privilege boundary:** `post_journal` itself is **service-role only** — never
granted to `authenticated`. User-facing mutations (Phase 6 hold, Phase 8
withdrawal request) arrive as separate narrow definer RPCs in their own
phases, which call posting internally. Phase 4 exposes to clients only reads.

### J. Triggers

| Trigger | Purpose |
|---|---|
| `journal_balance_check` | deferred constraint trigger on `ledger_entries` — Σ DR = Σ CR per journal + currency consistency at commit |
| `ledger_immutable` | `BEFORE UPDATE OR DELETE` on `journal_entries`, `ledger_entries`, `ledger_accounts` → `raise exception 'financial records are immutable'` (protects even against superuser mistakes) |
| `wallets_updated_at` | existing `touch_updated_at` |
| No trigger updates balances | balance mutation lives only inside `post_journal` — never trigger magic |

### H. RLS (least privilege, unchanged posture)

- `revoke all … from anon, authenticated` on all four tables; then:
- `wallets`: `SELECT` policy `auth.uid() = user_id`; admin read policy
  `has_admin_role(SUPPORT, FINANCE_ADMIN, SUPER_ADMIN)` (= `finance.read`).
- `journal_entries`/`ledger_entries`: owner read — user sees journals/lines
  touching their own accounts (`exists` through `ledger_accounts.owner_user_id`);
  admin read same role set.
- `ledger_accounts`: owner sees own account rows; admin read.
- No client INSERT/UPDATE/DELETE anywhere. RPCs granted `EXECUTE` to
  `authenticated` only where user-meaningful (`get_wallet_transactions`); the
  admin definer gates itself with `has_admin_role`.

---

## 6. K/L/M — Idempotency, invariants, reconciliation

**Idempotency**
- `journal_entries.idempotency_key` UNIQUE; conventions: `dep:<provider_ref>`,
  `wd:<withdrawal_id>`, `hold:<request_id>`, `adj:<uuid>`, `mat:<investment_id>`,
  `rwd:<reward_id>`. Retried webhook/cron/client calls return the first
  committed journal.
- `request_id` carried for end-to-end tracing alongside (not unique — retries
  share it).
- Reversal dedup: unique partial index on `reverses_journal_id`.
- Safe retry semantics: callers always "post or get" — a 500 mid-call means
  the txn rolled back fully (atomic), so the client retries cleanly and hits
  the idempotency branch if the post actually landed.

**Ledger invariants (DB-enforced)**
1. Σ DR = Σ CR per journal (RPC check + deferred trigger).
2. One currency per journal; line accounts match (RPC + trigger).
3. User bucket balances `>= 0` (CHECK on `wallets`).
4. `amount_minor > 0` on every line.
5. One wallet per (user, currency) — PK.
6. Journal once per idempotency key — UNIQUE.
7. At most one reversal per journal — partial UNIQUE.
8. No UPDATE/DELETE on financial tables — immutability trigger.
9. A journal mutates at most one user's wallet — RPC contract.
10. Wallet row mutation only inside `post_journal` (single code path + row lock).

**Reconciliation (operational)**
- `reconcile_wallets()` — per (user,currency): derived bucket balance
  (Σ CR−DR over that user's accounts per bucket) vs stored column. Any diff =
  alert; empty result = consistent. Runs on demand + scheduled in Phase 10.
- Platform-level sanity: `Σ user bucket liabilities == −Σ matching system
  contra` per currency (e.g. total AVAILABLE+PENDING across users =
  `−DEPOSITS_CLEARING` balance adjustments…); shipped as an admin report query
  in the verifier and used by the Phase 12 reconciliation checklist.
- `audit_log` already records admin adjustments (same transaction as the
  journal) — reconciliation diffs cross-checkable against audit.

---

## 7. Failure/retry scenarios

| Scenario | Behaviour |
|---|---|
| Webhook retried (provider double-delivers) | same `idempotency_key` → returns original journal; wallet unchanged |
| Client timeout after successful post | retry hits idempotent branch; `request_id` links both attempts |
| Concurrent holds on same wallet | wallet row `FOR UPDATE` serializes; second sees post-first balance, fails on `>= 0` if insufficient |
| Crash mid-`post_journal` | single txn → journal, lines, wallet, audit all roll back together; retry is safe |
| Bug discovered in a posted journal | `reverse_journal` posts a mirror; original immutable |
| Duplicate reversal attempt | partial unique index rejects the second |
| Admin adjustment without reason / wrong role | RPC raises; nothing written (in-txn denial — no orphan audit row, same semantics as `set_admin_config`) |

---

## 8. Migration strategy (forward-only; `0001–0004` untouched)

| File | Contents |
|---|---|
| `0005_ledger_schema.sql` | 4 enums, `ledger_accounts`, `journal_entries`, `ledger_entries`, `wallets`, checks, indexes, immutability + deferred-balance triggers, `post_journal` + helpers |
| `0006_ledger_rls.sql` | RLS enable, revokes/grants, policies, RPC EXECUTE grants, `admin_post_adjustment`, `reverse_journal`, `reconcile_wallets`, `get_wallet_transactions` |
| `0007_system_accounts_seed.sql` | 12 deterministic system-account rows (`system:<kind>:<cur>`), `ON CONFLICT DO NOTHING` |

Verification: extend `scripts/verify-migrations.mjs` — balance conservation,
negative-balance rejection, idempotent replay, reversal mirror + single-reversal
uniqueness, cross-currency rejection, RLS boundaries, concurrent-hold
serialization, wallet-vs-ledger reconciliation clean. Hosted apply via the
established Supabase MCP path (`public.schema_migrations` tracking preserved).

---

## 9. Decisions requiring your approval

| # | Decision | Recommendation |
|---|---|---|
| D-4.1 | **Wallet rows provisioned lazily** (first posting creates user accounts + wallet row) vs eagerly at signup | **Lazy** — zero migration to 0001's signup trigger; wallets materialize on first funded action |
| D-4.2 | **`post_journal` is service-role only**; client-visible writes arrive later as narrow RPCs | **Agree** — keeps one audited write path; Phase 6/8 expose `wallet_request_hold`-style definers that call it internally |
| D-4.3 | **Admin adjustment role** — `FINANCE_ADMIN` + `SUPER_ADMIN`, reason mandatory, audit atomically. No four-eyes approval yet | **Agree** (dual-control is a Phase 10 policy-proposal feature) |
| D-4.4 | **BONUS bucket is not directly withdrawable** — rewards land in BONUS; eligibility moves them BONUS→AVAILABLE via `BONUS_RELEASE` | **Agree** — matches `WalletAccountType` semantics; Phase 9 sets eligibility rules |
| D-4.5 | **PENDING bucket** used for deposit-staging (`PENDING_CREDIT`/`PENDING_CONFIRM`) | **Agree** — gives the Phase 1 UI's pending state a real ledger anchor |
| D-4.6 | **System contra accounts may run negative** — non-negativity applies to user buckets only | **Agree** (accounting-correct) |
| D-4.7 | **`balance_after_minor` recorded on user lines** (denormalized snapshot per entry — powers `Transaction.balanceAfter`) | **Agree** |
| D-4.8 | **No `journal_entries.status`** — committed journals are final; "void" = reversal | **Agree** (simpler than status lifecycle; matches append-only ethos) |
| D-4.9 | **`INVESTMENT_PRINCIPAL_PAYABLE` single account** vs per-round payable | **Single account now**; per-round granularity lives in `entity_id`+metadata and Phase 6 tables |
| D-4.10 | **USD seeded but dormant** — all flows currency-agnostic; no FX conversion journals exist | **Agree** — FX is explicitly out of scope; a future `FX_CONVERSION` journal type would debit one currency and credit another across two linked journals |

---

## 10. Explicitly not in this phase

Deposits table/provider integration, withdrawals table, purchase RPCs,
maturity posting, reward engine, notifications, storage, FX, per-round
payables, dual-control admin workflows, and any client/UI changes. Phase 4B
implementation should start only on approval of this proposal.
