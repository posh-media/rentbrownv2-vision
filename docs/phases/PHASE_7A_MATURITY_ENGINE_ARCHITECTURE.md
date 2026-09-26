# Phase 7A — Investment Maturity Engine Architecture Proposal

Status: **PROPOSED / AWAITING APPROVAL** · Architecture only. No migrations,
RPCs, Edge Functions, UI, seeds, or deploys are implemented here.

Governing inputs: `PHASE_6A_INVESTMENT_ENGINE_ARCHITECTURE.md`,
`PHASE_6B_IMPLEMENTATION_REPORT.md`, `docs/DECISIONS.md` (D-001–D-006), and the
actual schema in `supabase/migrations/0001`–`0015` + hosted behavior verified
by `scripts/verify-hosted-p6.mjs` (50/50).

---

## 1. Findings: what already exists

Phase 2/4 designed ahead. Almost every primitive Phase 7 needs is already
built and live on hosted Supabase:

| Need | Already exists |
|---|---|
| Maturity states | `investment_status`: `MATURITY_DUE`, `SETTLING`, `COMPLETED`, `FAILED`, `REVIEW_REQUIRED` (0002) |
| Maturity events | `investment_event_type`: `MATURED`, `SETTLEMENT_STARTED`, `SETTLED`, `FAILED`, `REVIEW_REQUIRED` (0002) |
| Governed transitions | `apply_investment_transition()` map already permits `ACTIVE→MATURITY_DUE→SETTLING→{COMPLETED,FAILED,REVIEW_REQUIRED}`; emits the correct event per target state; `FOR UPDATE` row lock; service-role only (0013) |
| Settlement journal | `MATURITY_CREDIT` journal type: shape `system DR ⊆ {INVESTMENT_PRINCIPAL_PAYABLE, INVESTMENT_PROFIT_PAYABLE}` → `user:available CR` — explicitly permits **one journal with both legs** (0005 `assert_journal_shape`) |
| Profit contra account | `system:investment_profit_payable:{NGN,USD}` seeded (0007) |
| Detection index | `investments_maturity_idx` on `(status, matures_at) WHERE status IN ('ACTIVE','MATURITY_DUE')` (0002) |
| Settlement write seam | `app.investment_write` guard pattern; `post_journal` + `app.ledger_posting` (0005/0013) |
| Worker pattern | `outbox-worker` Edge Function: `x-worker-key`/`service_role` auth → `claim_*` batch RPC (`FOR UPDATE SKIP LOCKED`) → `finish_*` RPC (0008) |
| Config registry | `admin_config` + `config_number()` for worker policy (D-003) |
| Reconciliation | `reconcile_investments()`, `reconcile_wallets()` (0014/0006) |
| Review ops | `admin_mark_investment_review`, `admin_resolve_investment_review` (0014) |
| Corrections | `REVERSAL` journal type — direction-mirror enforced, one-per-original (0005) |
| Audit | `audit_log` + `request_id` propagation everywhere |
| Notifications seam | `outbound_events` durable outbox → Make webhook (0008); in-app notifications do not exist yet |

**Consequence: Phase 7B needs zero new journal types, zero new system
accounts, zero new enums, zero new tables for the core flow.** The entire
engine is one batch-mark RPC, one atomic settle RPC, one worker Edge
Function, and reconciliation/admin additions.

## 2. Proposed lifecycle

```
ACTIVE ──(mark_due_investments, matures_at <= now())──▶ MATURITY_DUE
MATURITY_DUE ──(settle_investment: conditional UPDATE claim)──▶ SETTLING
SETTLING ──(MATURITY_CREDIT journal + transition, same txn)──▶ COMPLETED
                SETTLING/MATURITY_DUE ──(admin)──▶ REVIEW_REQUIRED
                REVIEW_REQUIRED ──(admin resolve)──▶ SETTLING / REFUNDED / …
```

`matures_at` is the authoritative trigger; it is set once at
`activated_at + duration_hours` (D-6.2) and never recalculated.

### Snapshot authority

Settlement reads **only** `investments.principal_minor`,
`expected_profit_minor`, `maturity_value_minor`, `currency` — immutable
columns with CHECK invariants (`principal = slots × slot_price`,
`maturity = principal + profit`). The engine never re-reads
`plans.roi_bps`/`slot_price_minor` for an existing investment. A plan edit
after activation cannot change a settlement amount — this is a structural
guarantee, not a convention.

## 3. Ledger settlement design (§6–7 of the brief)

**Recommended: one `MATURITY_CREDIT` journal, three lines (D-7.3/D-7.4).**

`assert_journal_shape` already permits `sys_dr ⊆ {PRINCIPAL_PAYABLE,
PROFIT_PAYABLE}` — the schema authors anticipated combined settlement.

Worked example — ₦100,000 principal, 16.5% ROI, ₦16,500 profit
(all minor units, kobo):

```
Purchase (Phase 6, already exists):
  HOLD             DR user:u:available 10,000,000   CR user:u:reserved 10,000,000
  INVESTMENT_DEBIT DR user:u:reserved  10,000,000   CR system:investment_principal_payable:NGN 10,000,000

Settlement (Phase 7, one journal, idempotency key inv:mature:<inv.id>):
  MATURITY_CREDIT  DR system:investment_principal_payable:NGN 10,000,000
                   DR system:investment_profit_payable:NGN     1,650,000
                   CR user:u:available                       11,650,000
```

Resulting balances:

| Account | After purchase | After settlement |
|---|---|---|
| `user:u:available` | −10,000,000 | +11,650,000 |
| `user:u:reserved` | 0 (net) | 0 |
| `investment_principal_payable` | +10,000,000 (liability) | 0 — **fully settled, no double-count** |
| `investment_profit_payable` | 0 | −1,650,000 (net DR = profit outflow recognized at maturity; system contra may go negative per D-4.4) |

Alternatives considered and rejected:
- **Two journals** (principal, then profit): splits one economic event into
  two atomic units → a crash between them leaves a half-settled investment
  needing bespoke recovery. No benefit; the shape gate already guards a
  combined journal.
- **Profit accrued at purchase** (CR profit_payable at `INVESTMENT_DEBIT`
  time): would require a fourth leg now or a second journal at purchase —
  changes Phase 6 semantics; unnecessary since profit is only owed at
  maturity.
- **New journal types** (`PRINCIPAL_RETURN`, `PROFIT_CREDIT`): redundant —
  `MATURITY_CREDIT` exists precisely for this.

`payment_reference`/journal linkage: journals already carry
`entity_type='investment', entity_id=<inv.id>` (0013 convention) — same for
the settlement journal, plus `journal_type='MATURITY_CREDIT'` and
`metadata.settlement={principal, profit, matures_at}` for audit.

## 4. Idempotency (§8, D-7.5)

All settlement work is pure database state — no external calls — so the
**entire settlement is one transaction**:

```sql
settle_investment(p_investment_id):
  1. UPDATE investments SET status='SETTLING'          -- atomic claim
     WHERE id=$1 AND status='MATURITY_DUE'             -- loser gets 0 rows
     → if 0 rows: return 'already claimed/completed'   -- safe exit
     (+ SETTLEMENT_STARTED event via apply_investment_transition)
  2. post_journal('MATURITY_CREDIT', …,
                  idempotency_key 'inv:mature:'||<inv.id>)
  3. apply_investment_transition(id → 'COMPLETED')     -- SETTLED event
  COMMIT
```

Crash at any point ⇒ whole transaction rolls back ⇒ row remains
`MATURITY_DUE` ⇒ next worker pass retries cleanly. **There is no
half-settled state by construction** — answers Cases A–D in §10.

Idempotency layers:
- **Claim**: conditional UPDATE on `status='MATURITY_DUE'` — a concurrent
  worker's UPDATE blocks on the row lock, then sees 0 matching rows and
  exits. (Equivalent to Phase 6's round-claim pattern.)
- **Journal**: `idempotency_key = 'inv:mature:<inv.id>'` — unique in
  `journal_entries`; a replay returns the committed journal, never
  re-posts lines.
- **Transitions**: `apply_investment_transition` returns early when the
  row is already in the target state.
- **Events**: events are inserted inside the same transaction — a rollback
  removes them; a replay is a no-op because the second call exits at the
  claim.

`SETTLING` is therefore never observable outside the settlement
transaction in the primary design. The state remains in the map for
auditability (the `SETTLEMENT_STARTED` event is still written) and as the
recovery target for `REVIEW_REQUIRED → SETTLING`.

*Alternative considered — committed claim + separate settle (outbox
style): rejected. The outbox pattern holds a committed claim across a
**network call**; settlement has no external I/O, so a committed claim
would only create a new stuck-state surface for no benefit.*

## 5. Concurrency (§9, D-7.2)

- Detection (`mark_due_investments`) and settlement (`settle_investment`)
  both act under `FOR UPDATE` row semantics; two workers marking/claiming
  the same row serialize on the row lock, loser sees the post-lock status
  and no-ops.
- Batch claim: `claim_due_investments(p_limit)` uses
  `FOR UPDATE SKIP LOCKED` (mirrors `claim_outbound_batch`, 0008) so N
  workers partition the due set without blocking each other.
- Lock order stays total: investment row → wallet row inside
  `post_journal`. Settlement touches exactly one user wallet
  (enforced by `assert_journal_shape`'s single-owner rule), so no
  cross-investment deadlock is possible.
- Round rows are never touched — capacity is history by settlement time.

## 6. Worker / batch design (§11, D-7.8)

New Edge Function `maturity-worker` — clones the `outbox-worker` pattern:

- Auth: `x-worker-key` == `WORKER_SECRET` or service-role bearer; invoked by
  scheduled trigger (Supabase scheduled functions / external cron) or
  manual POST. Proposed cadence: **every 5 minutes** (maturity is
  hour-granular; 5-min lag is invisible and cheap).
- Steps per invocation:
  1. `mark_due_investments(p_limit)` — batch ACTIVE→MATURITY_DUE,
     returns marked ids.
  2. `claim_due_investments(p_limit)` — SKIP-LOCKED claim.
  3. For each claimed id: `settle_investment(id)` in its own RPC call —
     **one failing investment never aborts the batch**; error logged with
     `request_id`, loop continues.
  4. Optional final `reconcile_investments()` spot-call (count only) for
     worker logs.
- `batch_limit` from `admin_config` `investment.maturity.batch_limit`
  (proposed default **25**); worker loops until the claim returns empty or
  a time budget (~45 s, below the Edge Function wall clock) expires.
  Bounded memory: only ids in flight.
- Ordering: `matures_at ASC` — oldest-due first, FIFO fairness.

Stale-`SETTLING` recovery (D-7.9): in the primary single-transaction
design a committed `SETTLING` cannot exist. **Defense in depth**:
`claim_due_investments` additionally matches `status='SETTLING' AND
updated_at < now() - interval '15 minutes'` (threshold via config
`investment.maturity.stale_minutes`); `settle_investment` accepts both
`MATURITY_DUE` and `SETTLING` as claimable sources so recovery is just the
normal retry path.

## 7. Failure recovery (§10, D-7.6/D-7.7)

| Case | Outcome |
|---|---|
| A. Txn fails before journal | Rollback; row stays `MATURITY_DUE`; auto-retried next pass. No manual action. |
| B. Journal ok, transition fails | Same transaction → journal rolls back too. Auto-retry. |
| C. Crash in `SETTLING` | Impossible in primary design (SETTLING never commits alone); if it ever occurred, stale-claim re-settles via journal idempotency. |
| D. Principal leg ok, profit leg fails | Impossible — both legs are one journal in one transaction. |
| E. Worker down hours/days | `matures_at` persists; investments queue in `MATURITY_DUE`; next run drains the backlog in batches. `overdue_active`/`stuck_*` reconciliation rows surface the lag. |
| F. Long `SETTLING` | Only reachable via an out-of-band path; caught by `stuck_settling` reconciliation → admin resolves via review RPCs. |

**Retry vs review policy:** settlement failures are always auto-retried
(idempotent, cheap); a settlement is escalated to `REVIEW_REQUIRED` only
by admin action or when reconciliation flags an anomaly (e.g. journal
exists but status isn't COMPLETED — `settlement_incomplete`). No
`FAILED` auto-transition on transient errors — `FAILED` requires admin
review first (`FAILED→REVIEW_REQUIRED` is the only edge out of FAILED in
the existing map).

No compensating journals are needed for retries — rollback is complete.
Corrections to an erroneous completed settlement use the existing
`REVERSAL` journal (exact direction-mirror, one-per-original, already
enforced).

## 8. Maturity detection (§12, D-7.1)

`mark_due_investments(p_limit)` — service-role RPC:

```sql
SELECT id FROM investments
 WHERE status='ACTIVE' AND matures_at <= now()
 ORDER BY matures_at LIMIT p_limit
 FOR UPDATE SKIP LOCKED
→ apply_investment_transition(id → 'MATURITY_DUE') per row
```

The partial index `investments_maturity_idx (status, matures_at)` —
**already exists** — makes this a bounded index scan regardless of table
size. Separating mark from settle keeps the sweep cheap even when
settlement is slow.

## 9. Time semantics (§13)

- `matures_at` is a stored `timestamptz` set at activation from
  `duration_hours` — settlement never recomputes it (D-6.2 preserved).
- All comparisons use `now()` (database server time, UTC) — the same
  authority Phase 6 uses for round windows.
- Clock skew between worker and DB is irrelevant: no worker-side time
  enters the decision; the worker only supplies ids.
- Elapsed-hour semantics retained; no calendar-month logic.

## 10. Events & audit (§14–15)

`apply_investment_transition` already emits: `MATURED` (→MATURITY_DUE),
`SETTLEMENT_STARTED` (→SETTLING), `SETTLED` (→COMPLETED),
`FAILED`, `REVIEW_REQUIRED`. Order per settlement:
`MATURED → SETTLEMENT_STARTED → SETTLED`, all `actor_kind='SYSTEM'` (or
`'ADMIN'` for admin-initiated retry), `request_id` propagated from the
worker invocation. The settlement journal reference goes in
`SETTLED.metadata.journal`. No duplicate events possible (rollback +
claim guard).

**Audit log** (separate purpose — who/what ops did, not lifecycle):
`admin_settlement_retry` adds `SETTLEMENT_RETRY` audit rows;
`admin_mark_investment_review`/`admin_resolve_investment_review` already
audit. Worker-level detection/settlement is recorded via investment events
+ journal metadata, not audit_log (no human actor).

## 11. Reconciliation (§16, D-7.10)

Extend `reconcile_investments()` (detection-only, unchanged contract):

| Check | Detection |
|---|---|
| `overdue_active` | `ACTIVE AND matures_at < now() - grace` (worker lag) |
| `stuck_maturity_due` | `MATURITY_DUE AND updated_at < now() - stale_minutes` |
| `stuck_settling` | `SETTLING AND updated_at < now() - stale_minutes` |
| `completed_without_settlement` | COMPLETED lacking `MATURITY_CREDIT` journal |
| `settlement_incomplete` | `MATURITY_CREDIT` journal exists but status ∉ {COMPLETED} (non-REVIEW) |
| `duplicate_settlement_journal` | >1 `MATURITY_CREDIT` per `entity_id` |
| `maturity_amount_mismatch` | journal legs ≠ `principal_minor`/`expected_profit_minor`/`maturity_value_minor` |
| `settlement_currency_mismatch` | journal currency ≠ investment currency |
| `missing_settled_event` | COMPLETED without `SETTLED` event |
| `principal_payable_drift` | `system:investment_principal_payable:<cur>` balance ≠ Σ `principal_minor` of open (ACTIVE/MATURITY_DUE/SETTLING) investments — global netting check; exempt seed-tagged nothing (investments carry no seed_tag) |
| `matured_event_missing` | `MATURITY_DUE`+ without `MATURED` event |

Auto-retryable: `overdue_active`, `stuck_maturity_due`, `stuck_settling`
(normal worker recovery). Manual review: all amount/duplicate/missing-
journal anomalies (financial facts already diverged — no silent mutation).

## 12. Admin operations (§17, D-7.11)

Reuses 0014: `admin_list_investments` already filters by status
(`MATURITY_DUE`/`SETTLING`/`COMPLETED`/`FAILED`), `admin_investment_detail`
already returns events + all journals for the investment (settlement
journal appears automatically via `entity_type='investment'`).

New:

- `admin_retry_settlement(p_investment_id, p_reason, p_request_id)` —
  FINANCE_ADMIN/SUPER_ADMIN; audited (`SETTLEMENT_RETRY`); delegates to
  the same `settle_investment` internals on a `MATURITY_DUE`/`SETTLING`
  row — one code path for auto and manual settlement.
- Review ops already exist and suffice (`REVIEW_REQUIRED` is reachable
  from `SETTLING`/`MATURITY_DUE`/`COMPLETED` per the existing map).

No direct balance mutation; corrections are `REVERSAL` journals via the
existing audited `admin_post_adjustment` path or a dedicated reversal RPC
if needed (decision: likely reuse — `admin_post_adjustment` doesn't post
reversals today; propose `admin_reverse_journal` evaluation in 7B).

## 13. Notifications (§18, D-7.12)

Financial settlement never depends on notification delivery. Proposed
Phase 7 scope: **write `outbound_events` rows** (`investment.matured`,
`investment.settled`, `investment.settlement_review`) in the same
transaction as the state change — durable, zero-cost, delivered by the
existing outbox-worker to Make when configured. In-app notification
center + emails/push stay Phase 10. If even outbox emission is unwanted
in 7B, it can be dropped — it's additive, not load-bearing.

## 14. Account restrictions (§19, D-7.13)

Maturity credit is a **passive ledger event**, not a withdrawal — the
investor takes no action. Policy proposal: settlement proceeds regardless
of `account_status` (`ACTIVE`/`RESTRICTED`/`SUSPENDED`/`CLOSED`) because
owed money must not be trapped by an unrelated restriction; withdrawal
eligibility is enforced at the withdrawal gate (Phase 9), not here.
`SUSPENDED`/`CLOSED` accounts additionally surface a `note` in
reconciliation detail for ops awareness. No KYC/PIN gates (Phase 8+).

## 15. Currency (§21, D-7.14)

The engine is **currency-generic by construction**: journals post in
`investments.currency`; USD payable accounts are already seeded (0007).
Since Phase 6 only creates NGN investments (catalogue is NGN,
`request_investment` enforces round=plan=wallet currency), USD settlement
is structurally supported but unreachable until a USD catalogue exists —
no USD-specific work, no FX.

## 16. Proposed change inventory (§22, D-7.15) — not implemented

**`supabase/migrations/0016_maturity_engine.sql`**

| Object | Purpose | Security | Txn/rollback |
|---|---|---|---|
| `mark_due_investments(p_limit int default 100)` | ACTIVE→MATURITY_DUE sweep | service_role only | per-row via transition RPC |
| `claim_due_investments(p_limit int)` | SKIP-LOCKED batch claim incl. stale SETTLING | service_role only | claim txn only |
| `settle_investment(p_investment_id, p_request_id)` | atomic claim→journal→complete | service_role only | single txn; full rollback |
| `reconcile_investments()` extension | +11 maturity checks | FINANCE_ADMIN/SUPER_ADMIN/service | read-only |
| Index | none needed — `investments_maturity_idx` exists | — | — |

**`supabase/migrations/0017_maturity_admin.sql`**

| Object | Purpose | Security |
|---|---|---|
| `admin_retry_settlement(uuid, text, text)` | audited manual retry, same settle path | authenticated + `has_admin_role(FINANCE_ADMIN,SUPER_ADMIN)` |
| `admin_reverse_journal` *(evaluate)* | REVERSAL-posting admin RPC if `admin_post_adjustment` can't serve | same role gate |

**`supabase/functions/maturity-worker/index.ts`** — new Edge Function,
`outbox-worker` clone (worker-key auth, batch claim, per-item settle,
time budget, structured logs).

**`admin_config` seeds** (in 0016): `investment.maturity.batch_limit` (25),
`investment.maturity.stale_minutes` (15), `investment.maturity.enabled` (true).

**Admin app**: investments list already filters by status; add
failed/stuck-settlement surfacing + retry button on detail page
(Phase 7B UI task).

**Mobile/web investor UI**: statuses already exist in shared types;
`MATURITY_DUE`/`COMPLETED` states render via existing investment detail —
verify copy only, no structural change expected.

## 17. Security model

Every new RPC is `security definer` + `set search_path=''`, service-role
or role-gated exactly as Phase 5/6 (`revoke … from public, anon` + narrow
grants). Client-callable surface: **zero new investor-facing mutations**.
`settle_investment`/`mark_due_investments`/`claim_due_investments` are
service-only; admin retry goes through the audited RPC. All writes pass
through `app.investment_write` guards and `post_journal` — wallet rows
still can't be touched outside the ledger path. No client-supplied
amounts anywhere: the settle RPC takes only `investment_id` and reads the
immutable snapshot.

## 18. Testing strategy (§24)

Extend `verify-migrations.mjs` + `verify-hosted-p6`-style suite:

- **Unit/db**: create ACTIVE investment (funded wallet via
  `admin_post_adjustment`), force `matures_at` past via a flagged-fixture
  helper, run mark → claim → settle; assert COMPLETED, wallet delta =
  `maturity_value_minor`, payable accounts net to zero, events ordered
  MATURED→SETTLEMENT_STARTED→SETTLED, journal legs match snapshot.
- **Concurrency**: two parallel `claim_due_investments` + settle on the
  same row → exactly one MATURITY_CREDIT journal, one credit, both exit
  cleanly.
- **Failure**: settle a deliberately broken investment (e.g. after admin
  REVIEW mid-claim) → row returns to claimable state; no partial journal.
- **Idempotency**: call `settle_investment` twice directly; replay same
  worker batch.
- **Reconciliation**: `overdue_active` detection by leaving one investment
  unmarked; `completed_without_settlement` via fixture.
- **Hosted**: same flow on hosted with real JWTs — wallet funding only via
  `admin_post_adjustment` (never direct writes).
- **Regression**: existing 305 + 50 assertions stay green.

## 19. Migration plan

Forward-only, `0016` + `0017` (order above). `0001`–`0015` untouched. No
data mutation. No new destructive paths — `SETTLED`/`COMPLETED`
investments keep FK RESTRICT protection on catalogue rows.

## 20. Phase boundaries

Not in Phase 7: maturity→withdrawal coupling, KYC/PIN gates, in-app
notification center, referral rewards, USD catalogue, fee plans
(`ERR_FEE_UNSUPPORTED` still stands), external-funding purchases.

## 21. Decisions requiring approval

| # | Question | Recommendation |
|---|---|---|
| D-7.1 | Maturity detection mechanism | `mark_due_investments` RPC called by scheduled `maturity-worker` Edge Function (existing `investments_maturity_idx` makes it an index-bounded scan; consistent with outbox-worker ops model — no pg_cron dependency) |
| D-7.2 | Claim mechanism preventing concurrent settlement | Conditional `UPDATE … WHERE status='MATURITY_DUE'` inside `settle_investment` + `FOR UPDATE SKIP LOCKED` batch claim — same pattern as Phase 6 capacity claim / 0008 outbox |
| D-7.3 | One journal or two for principal+profit | **One** `MATURITY_CREDIT` journal, 3 lines (DR principal_payable, DR profit_payable, CR available) — atomic; shape gate already permits it |
| D-7.4 | System accounts | Existing `INVESTMENT_PRINCIPAL_PAYABLE` + `INVESTMENT_PROFIT_PAYABLE` (already seeded both currencies); profit payable legitimately nets negative = profit outflow |
| D-7.5 | Idempotency | Claim-on-status + journal key `inv:mature:<inv.id>` + transition no-op + same-txn events; replay is total no-op |
| D-7.6 | Partial/interrupted settlement | Impossible by construction — entire settle is one transaction; crash ⇒ rollback ⇒ auto-retry |
| D-7.7 | Auto-retry vs REVIEW_REQUIRED | Always auto-retry transient failures; REVIEW only via admin or reconciliation anomaly; `FAILED` reached only through review (matches existing transition map) |
| D-7.8 | Batch size & worker model | Config `investment.maturity.batch_limit` default 25; loop batches until empty or ~45s budget; cadence 5 min; SKIP-LOCKED for multi-worker |
| D-7.9 | Stale-SETTLING recovery | Claim RPC also re-claims SETTLING older than `stale_minutes` (15) — settle path is idempotent so re-claim = retry; unreachable in primary design, kept as defense-in-depth |
| D-7.10 | Authoritative maturity reconciliation | The 11 checks in §11; auto-retryable = overdue/stuck, manual = amount/duplicate/missing-journal anomalies |
| D-7.11 | Permitted admin ops | `admin_retry_settlement` (FINANCE_ADMIN+, audited); existing mark/resolve review RPCs; `admin_reverse_journal` if needed; no direct edits |
| D-7.12 | Notifications in Phase 7 | Outbox `outbound_events` rows in the settlement txn only (durable, optional); in-app/push/email deferred to Phase 10 |
| D-7.13 | Restricted/suspended/closed accounts | Settlement always credits the wallet (owed funds aren't trapped); restriction only surfaces in reconciliation detail; withdrawal stays a separate gate |
| D-7.14 | Currencies | Currency-generic via `investments.currency`; effectively NGN-only today since Phase 6 only issues NGN investments; no FX |
| D-7.15 | Schema/RPC/Edge changes | `0016` (mark/claim/settle RPCs, reconcile extension, config seeds), `0017` (admin retry + optional reversal RPC), `maturity-worker` Edge Function; **no new tables, enums, journal types, or system accounts** |

## 22. Files inspected

`0013_investment_engine.sql` (transitions, request_investment, grants) ·
`0014_investment_admin.sql` (admin RPCs, reconcile_investments) ·
`0002_domain_schema.sql` (enums, investments/events/admin_config) ·
`0005_ledger_schema.sql` (journal types, assert_journal_shape incl.
MATURITY_CREDIT, post_journal) · `0006_ledger_rls.sql`
(admin_post_adjustment, reconcile_wallets) · `0007` (system accounts) ·
`0008_payments_schema.sql` (outbox, claim/finish pattern, expire sweep) ·
`0015_post_journal_safeupdate_fix.sql` · `functions/outbox-worker/index.ts`
· `PHASE_6B_IMPLEMENTATION_REPORT.md` · `docs/DECISIONS.md`.

## 23. Files proposed for Phase 7B

`supabase/migrations/0016_maturity_engine.sql` (new),
`supabase/migrations/0017_maturity_admin.sql` (new),
`supabase/functions/maturity-worker/index.ts` (new),
`scripts/verify-migrations.mjs` + `scripts/verify-hosted-p6.mjs`
(extension), `packages/types` + admin app investment pages (minor —
retry/status surfacing), `docs/DECISIONS.md` (D-007 on approval),
`docs/phases/PHASE_7B_IMPLEMENTATION_REPORT.md`.

No production implementation performed in Phase 7A.
