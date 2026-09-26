# Phase 7B — Investment Maturity Engine Implementation Report

**Status:** Implemented, verified locally and against hosted Supabase.
**Scope:** Exactly the Phase 7A-approved maturity engine (`D-007`, decisions D-7.1–D-7.15). No Phase 8+ functionality was implemented.

---

## 1. Implementation summary

Phase 7B adds the full investment maturity lifecycle on top of the Phase 6B purchase engine:

```
ACTIVE  →  MATURITY_DUE  →  SETTLING  →  COMPLETED
            (MATURED)       (SETTLEMENT_STARTED)  (SETTLED)
```

Settlement posts a single `MATURITY_CREDIT` journal — `DR principal_payable`, `DR profit_payable`, `CR user available` — atomically with the state transition, lifecycle events, and durable outbound events. The implementation is a thin orchestration layer over primitives already deployed in Phases 2/4/6: `post_journal()`, `apply_investment_transition()`, the `MATURITY_CREDIT` journal type, both payable system accounts, and the `investments_maturity_idx` partial index.

**Zero new tables, enums, journal types, or system accounts.**

## 2. Migrations

| Migration | Contents |
|---|---|
| `0016_maturity_engine.sql` | `mark_due_investments`, `claim_due_investments`, `settle_investment`; `reconcile_investments` extended with 11 maturity checks; 3 `admin_config` seeds |
| `0017_maturity_admin.sql` | `admin_retry_settlement` (finance-admin wrapper over `settle_investment`) |

Both forward-only; `0001`–`0015` untouched.

### Seeded configuration (`admin_config` typed registry)

- `investment.maturity.enabled` = `true`
- `investment.maturity.batch_limit` = `25`
- `investment.maturity.stale_minutes` = `15`

## 3. RPCs

| Function | Access | Purpose |
|---|---|---|
| `mark_due_investments(p_limit)` | `service_role` only | `FOR UPDATE SKIP LOCKED` claim of `ACTIVE` rows with `matures_at <= now()`; governed transition to `MATURITY_DUE` (emits `MATURED`); `investment.matured` outbox event |
| `claim_due_investments(p_limit)` | `service_role` only | SKIP-LOCKED batch claim returning due + stale-`SETTLING` rows ordered `matures_at ASC` |
| `settle_investment(p_investment_id, p_request_id)` | `service_role` only | Claim → `SETTLING` → `MATURITY_CREDIT` journal → `COMPLETED`, one transaction; journal-aware stale recovery |
| `admin_retry_settlement(p_investment_id, p_reason, p_request_id)` | `FINANCE_ADMIN`/`SUPER_ADMIN` | Audited retry through the identical settle path; emits `investment.settlement_review` outbox event |
| `reconcile_investments()` | finance roles | Extended (below) |

All are `SECURITY DEFINER` with `SET search_path=''`; anon/authenticated execution revoked; worker RPCs granted to `service_role` only.

## 4. Worker

`supabase/functions/maturity-worker/index.ts` — clones the `outbox-worker` pattern:

- Auth: `x-worker-key` (`WORKER_SECRET` env) or service-role bearer.
- Reads `investment.maturity.*` config; exits cleanly when disabled.
- Per run: `mark_due_investments(batch)` → `claim_due_investments(batch)` → per-row `settle_investment`.
- Each investment settles independently — one failure is logged with the request id and does not stop the batch.
- Bounded by batch limit; safe to run repeatedly and concurrently (SKIP-LOCKED + claim-on-status + journal idempotency).
- Returns a structured JSON summary (`marked`, `claimed`, `settled`, `repaired`, `errors[]`).
- Scheduling: Supabase cron, `*/5 * * * *`.

## 5. Ledger settlement

```
DR system:investment_principal_payable:<currency>  principal_minor
DR system:investment_profit_payable:<currency>     expected_profit_minor
CR user:<user_id>:available:<currency>           maturity_value_minor
```

- Amounts come **only** from the immutable investment snapshot — never re-derived from the current plan/property/round.
- Journal `idempotency_key = 'inv:mature:' || investment_id`.
- `post_journal()` performs wallet projection updates and ledger entries; a `MATURITY_CREDIT` source-row records the payload for shape/diagnostics.
- Settlement proceeds regardless of account status (ACTIVE/RESTRICTED/SUSPENDED) — wallet credit is not withdrawal eligibility (D-7.13).
- Currency-generic via `investment.currency`; only NGN is reachable today.

## 6. Idempotency & concurrency

Four layers, verified by tests:

1. **Claim-on-status** — `settle_investment` only proceeds for `MATURITY_DUE` or stale `SETTLING`; `COMPLETED`/`REVIEW_REQUIRED` are safe no-ops.
2. **Journal idempotency key** — `inv:mature:<id>` is unique in `ledger_journals`; a second poster replays the existing journal rather than double-crediting.
3. **Governed transitions** — `apply_investment_transition` rejects illegal jumps and is event-deduplicating by transition.
4. **SKIP-LOCKED batch claims** — concurrent workers partition the due population without locking each other out.

Concurrent settle calls on the same investment: exactly one journal, one wallet credit, one `COMPLETED` row.

## 7. Stale `SETTLING` recovery (journal-aware)

`SETTLING` rows older than `investment.maturity.stale_minutes` (15 min) are re-claimed. `settle_investment` then branches on **journal evidence**, not status alone:

- **No `inv:mature:<id>` journal** → the pre-journal transaction failed and rolled back; the row is returned to the normal settlement path (journal key still protects the retry).
- **Journal exists and validates against the snapshot** (currency, principal leg, profit leg, wallet credit, maturity total) → **no second journal**. The investment is repaired to `COMPLETED` through `apply_investment_transition` (`SETTLED` event + `investment.settled` outbox emitted if missing).
- **Journal exists but mismatches the snapshot** → `REVIEW_REQUIRED` with audit detail; the journal is preserved as the financial source of truth.

## 8. Reconciliation

`reconcile_investments()` extended with 11 maturity checks (all read-only, deterministic, non-mutating):

`overdue_active`, `stuck_maturity_due`, `stuck_settling`, `completed_without_settlement`, `settlement_incomplete`, `duplicate_settlement_journal`, `maturity_amount_mismatch`, `settlement_currency_mismatch`, `missing_settled_event`, `matured_event_missing`, `principal_payable_drift` (global IPP balance vs. outstanding principal).

## 9. Admin operations & UI

- `admin_retry_settlement` — finance roles only, audited via `admin_audit_log`, delegates to `settle_investment` (no direct wallet/investment writes).
- Existing `admin_mark_investment_review` / `admin_resolve_investment_review` reused; `REVIEW_REQUIRED → SETTLING` added to resolvable targets so a repaired review can re-enter settlement.
- Existing `reverse_journal` remains the sole journal-correction primitive — no duplicate mechanism added.
- Admin UI (`apps/admin` investment detail): new **Retry settlement** action on `MATURITY_DUE`/`SETTLING` rows (reason required, finance-gated); SETTLING added to review-resolution options. Data-source contract `retrySettlement` implemented in types, mock adapter, and Supabase adapter.
- Investor UI: no changes required — `INVESTMENT_STATUS` already renders `MATURITY_DUE`/`SETTLING`/`COMPLETED`.

## 10. Notifications / outbox

Durable `outbound_events` written transactionally with the state change, `rentbrown.outbound.v1` envelope, unique idempotency keys:

- `investment.matured` — on `ACTIVE → MATURITY_DUE`
- `investment.settled` — on journal-backed completion (including repaired stale rows)
- `investment.settlement_review` — on admin retry and review escalation

External delivery failures never affect financial state; the existing `outbox-worker` delivers/retries. In-app notification center remains Phase 10.

## 11. Tests & verification

### Local (`node scripts/verify-migrations.mjs`)

**349 passed, 0 failed.** New Phase 7 coverage: pre-maturity stays `ACTIVE`; due detection cutoff; exact ₦100k/₦16.5k/₦116.5k minor-unit arithmetic; exact DR/DR/CR legs; single wallet credit; `SETTLED`/`MATURED` events; idempotent replay; concurrent settle (one journal); rollback leaves no partial effects; stale-SETTLING with no journal re-settles; with valid journal repairs without reposting; with mismatched journal → `REVIEW_REQUIRED`; all new reconciliation checks; batch limit; config seeds; anon/service grants.

### Hosted (`node scripts/verify-hosted-p7.mjs`, real JWTs)

**Phase A: 35 passed, 0 failed** — anon/investor denials, config seeds, audited funding, 5 controlled investments, due-marking, settlement, exact wallet+ledger effects, lifecycle events, `investment.settled` outbox, idempotent + concurrent safety, stale recovery both ways, mismatch → review, admin retry, non-due rejection.

**Phase B: 10 passed, 0 failed** — `mark_due_investments`, backdated detection, `MATURITY_DUE`, `investment.matured` outbox, claiming, post-detection settlement, wallet credit, reconciliation execution, clean wallet reconciliation.

### Workspace

`pnpm typecheck` ✓ (12 packages) · `pnpm lint` ✓ · `pnpm build` ✓ · hosted Phase 6 regression suite 50/50 ✓

## 12. Issues found & fixes

1. **`principal_payable_drift` false positive** — initial formula compared IPP ledger balance to open principal without the directional/settlement model; corrected to account for `INVESTMENT_DEBIT` credits vs. `MATURITY_CREDIT` debits.
2. **Stale-SETTLING-no-journal fell through** — first `settle_investment` revision gated on `MATURITY_DUE` only; fixed to admit the journal-checked stale path per the safety amendment.
3. **`admin_config` count assertion** — verifier's seeded-count expectation updated for the 3 new maturity keys.
4. **Hosted `pg-safeupdate`** (carried from 6B) — `0015` predates this phase; confirmed applied.

## 13. Deviations from Phase 7A

None of substance. Two presentation-level refinements, both within the approved design:

- `claim_due_investments` returns rows (not just ids) so the worker avoids a second round-trip.
- `admin_retry_settlement` reuses `settle_investment` verbatim rather than a parallel path — approved intent, less code.

## 14. Remaining operator actions

- Schedule `maturity-worker` in Supabase cron (`*/5 * * * *`) with `WORKER_SECRET` set, or invoke via service-role bearer.
- Point `outbox-worker` deliveries at production webhook endpoints (payload URL env).
- Retire the two `P7T-*` hosted verification fixtures if desired (they're clearly labeled test investments; wallet effects are real and auditable).

## 15. Deferred (Phase 8+, explicitly not implemented)

Investor notification center, push/email delivery, withdrawal eligibility logic, payout execution, FX, USD catalogue, in-app maturity banners — all remain out of scope per D-7.12/D-7.14 and the phase boundary.
