# PHASE 5B — Deposits + Payment Infrastructure: Implementation Report

**Status: PHASE 5B COMPLETE**
**Implements:** `docs/phases/PHASE_5A_DEPOSIT_PAYMENT_ARCHITECTURE.md`
**Repository:** `posh-media/rentbrownv2-vision` · branch `main`
**Hosted Supabase:** `aqkynjuypijmlqnpcmza`
**Migrations:** `0008_payments_schema.sql` → `0009_payments_rls.sql` → `0010_payments_config_seed.sql` → `0011_deposit_options.sql` (forward-only; `0001–0007` untouched)

---

## 1. Executive summary

Phase 5B delivers the approved deposit/payment infrastructure on top of the
Phase 4 ledger. The financial hierarchy is preserved end-to-end:

```
Provider → verified domain event → controlled business operation
        → post_journal() → ledger → wallet projection
```

and for withdrawals:

```
Withdrawal financial fact → durable outbox → external webhook
```

Delivered:

- NGN deposits via **Paystack** and **KoraPay** through a provider-agnostic
  domain model (provider is a table enum + adapter at the Edge boundary; the
  domain never sees provider-specific shapes).
- Public provider **webhook Edge Functions** with signature verification,
  persisted idempotent event intake, and server-side provider verification
  before any credit.
- Full **deposit state machine** (`INITIATED → PENDING → CONFIRMED` plus
  `FAILED / EXPIRED / CANCELLED / REVIEW_REQUIRED / REFUNDED`) enforced
  transactionally in the database with append-only audit events.
- **Manual withdrawals** with `HOLD → decide → EXTERNAL_PAYOUT / HOLD_RELEASE`
  ledger integration and a durable `outbound_events` outbox to Make.
- **Admin payment overview** (provider status, secret markers only, endpoint
  registry, review counts), finance review queue, and detective
  `reconcile_payments()`.
- RLS on all six Phase-5 tables; every financial write goes through vetted
  RPCs — direct table mutation is blocked even for `service_role` outside
  the domain functions.
- Minimal client wiring only (per §54 of the brief): provider-driven deposit
  UI, hosted-checkout continuation, admin Payment Infrastructure page.

Deferred by design: international/crypto provider, USD deposits, FX, KYC
engine, referral rewards, notifications, future withdrawal status webhooks.

---

## 2. Migrations

| File | Contents |
|---|---|
| `0008_payments_schema.sql` | Enums, six domain tables, constraints, indexes, transition engine, all domain RPCs, write guards |
| `0009_payments_rls.sql` | RLS policies, table grants/revokes, RPC grants, admin overview/reconciliation/review RPCs |
| `0010_payments_config_seed.sql` | Payment config seed — enabled flags, endpoint registry keys, secret markers, Make URL, outbox policy; optional max/expiry seeded **disabled/null** |
| `0011_deposit_options.sql` | `deposit_options()` — non-secret init options for the investor UI (added during client wiring) |

Migration tracking remains `public.schema_migrations`; hosted tracking shows
`0001–0011` applied. No competing tracker, no `supabase_migrations` schema.

### Enums

`payment_provider` (`PAYSTACK`, `KORAPAY` — extendable without redesign),
`deposit_status`, `provider_event_status`, `domain_event_source`,
`withdrawal_status`, `outbound_status`.

### Tables (all RLS-enabled, all write-guarded)

| Table | Purpose |
|---|---|
| `deposits` | Provider-agnostic deposit intents; unique `reference`, unique `idempotency_key`, unique `(provider, provider_reference)`, unique `funding_journal_id` |
| `deposit_events` | Append-only transition/audit log (SYSTEM/PROVIDER/ADMIN/USER) |
| `payment_provider_events` | Minimized persisted webhook intake + signature-valid flag + dedup key |
| `withdrawals` | Manual payout requests; snapshots fee/net, links hold/payout journals |
| `withdrawal_events` | Append-only withdrawal audit log |
| `outbound_events` | Durable outbound webhook queue (QUEUED/DELIVERED/FAILED/DEAD + backoff) |

### RPCs

Investor (`authenticated`): `request_deposit`, `request_withdrawal`,
`cancel_deposit`, `deposit_options`.
Admin (`has_admin_role`-gated): `decide_withdrawal`, `admin_resolve_deposit`,
`admin_payment_overview`, `admin_list_review_deposits`, `reconcile_payments`.
Service (`service_role` only): `complete_deposit_init`, `fail_deposit_init`,
`ingest_provider_event`, `mark_provider_event`, `confirm_deposit`,
`refund_deposit`, `expire_due_deposits`, `claim_outbound_batch`,
`finish_outbound_attempt`, `apply_deposit_transition`,
`apply_withdrawal_transition`.

---

## 3. Edge Functions (deployed, ACTIVE)

| Function | JWT | Role |
|---|---|---|
| `initialize-deposit` | verified | `request_deposit` under caller JWT → provider init via secret → `complete_deposit_init` |
| `payment-webhook-paystack` | public | `x-paystack-signature` (HMAC-SHA512 over **raw body**) → ingest → verify-then-confirm |
| `payment-webhook-korapay` | public | `x-korapay-signature` (HMAC-SHA256 over the serialized `data` object only) → ingest → verify-then-confirm |
| `outbox-worker` | worker key / service | `expire_due_deposits` + claim queue → POST → `finish_outbound_attempt` |

Endpoints (seeded into `payment.endpoint.*` admin_config):

- `https://aqkynjuypijmlqnpcmza.supabase.co/functions/v1/payment-webhook-paystack`
- `https://aqkynjuypijmlqnpcmza.supabase.co/functions/v1/payment-webhook-korapay`

Public visibility is intentional — security comes from signature
verification + provider verification + idempotency, not URL secrecy.
Smoke probe: unsigned requests → 500 `provider not configured` (fail-closed
until secrets are set); unauthenticated `initialize-deposit`/`outbox-worker`
→ 401.

---

## 4. Provider adapters

### Paystack

- Init: `POST api.paystack.co/transaction/initialize` with RentBrown
  `DEP-…` reference as merchant reference; returns `authorization_url`.
- Verify: `GET /transaction/verify/:reference`; checks status, amount
  (minor units), currency, merchant reference, txn id.
- Webhook: `x-paystack-signature` = HMAC-SHA512(**raw body**, secret).
  Raw body is read **before** JSON parsing.
- No provider event id → deterministic dedup key = SHA-256(
  `event|reference|amount|status|txn_id`).

### KoraPay

- Init: `POST api.korapay.com/merchant/api/v1/charges/initialize` with
  `payment_reference` = RentBrown reference; returns `checkout_url`.
- Verify: `GET /charges/:payment_reference`; checks status, amount
  (major→minor conversion), currency, reference.
- Webhook: `x-korapay-signature` = HMAC-SHA256(JSON.stringify(**data
  object only**), secret) — materially different from Paystack; the
  adapter does not apply whole-body signing.
- `charge.success` is processed; other events are persisted then `IGNORED`.
- `reversed`/`refunded` statuses route to `refund_deposit()`.

---

## 5. Webhook pipeline

```
RAW BODY → signature verify → normalize → persist event (dedup key)
→ correlate deposit by merchant reference → row lock
→ server-side provider verify → amount/currency/reference checks
→ confirm_deposit() → post_journal(FUNDING_CREDIT) → mark PROCESSED
```

- Invalid signature → event persisted with `signature_valid=false`,
  `REVIEW` status, **no deposit mutation**, HTTP 401.
- Unknown reference → `REVIEW` (forensic retention, no credit).
- Verification unavailable → `FAILED`, HTTP 500 → provider retries;
  dedup key makes retries single-effect.
- Duplicate delivery → same dedup key → replay-safe (`PROCESSED` short-circuit).
- Late success on FAILED/CANCELLED deposit → `REVIEW_REQUIRED`, no credit.
- Minimized payloads only — no card data, PII, signature headers, or
  credentials are persisted.

## 6. Ledger integration

| Operation | Journal | Shape | Idempotency |
|---|---|---|---|
| Verified deposit | `FUNDING_CREDIT` | DR `system:DEPOSITS_CLEARING:NGN` / CR `user:AVAILABLE` | `dep:fund:<deposit_id>` |
| Provider reversal | `REVERSAL` | exact mirror of original funding journal | `dep:rev:<deposit_id>` |
| Withdrawal request | `HOLD` | DR `user:AVAILABLE` / CR `user:RESERVED` | `wd:hold:<withdrawal_id>` |
| Reject/failed payout | `HOLD_RELEASE` | DR `user:RESERVED` / CR `user:AVAILABLE` | `wd:rel:<withdrawal_id>` |
| Admin-marked payout | `EXTERNAL_PAYOUT` | DR `user:RESERVED` (amount) / CR `system:PAYOUTS_CLEARING` (net) + `FEE_REVENUE` (fee, only when > 0) | `wd:out:<withdrawal_id>` |

`PENDING_CREDIT`/`PENDING_CONFIRM` were intentionally **not** used — neither
provider stages funds before settlement in this integration.

Insufficient-cover reversal never goes negative and never partially debits —
the deposit moves to `REVIEW_REQUIRED` for finance.

## 7. Withdrawals + outbox

- `request_withdrawal` validates auth, ACTIVE account, min, available
  balance, destination, and posts `HOLD` in the same transaction as the
  withdrawal row + `withdrawal.requested` outbox event (atomic).
- Idempotency key is resolved **before** posting the hold — retries
  converge without compensating releases.
- `decide_withdrawal` (finance.review_withdrawals): reject → `HOLD_RELEASE`
  + `REJECTED`; complete → `EXTERNAL_PAYOUT` + `COMPLETED` (only when the
  admin attests the external payout was made).
- Outbox: `claim_outbound_batch` uses `FOR UPDATE SKIP LOCKED`;
  `finish_outbound_attempt` marks DELIVERED or schedules `QUEUED` with
  exponential backoff (`payment.outbound.base_backoff_seconds`, max
  `payment.outbound.max_attempts` → `DEAD`). Delivery failure **never**
  alters financial state.
- V1 payload = `rentbrown.outbound.v1`, `withdrawal.requested` only,
  destination bank details included for the manual-payout automation.
- Make URL configured via `withdrawal.webhook.url`; the worker was **not**
  pointed at the real Make hook during verification.

## 8. Admin surface

- `admin_payment_overview()` — config map (non-secret), deposit status
  counts, review counters. `SUPPORT`+ roles.
- `/finance/payments` admin page renders: environment, per-provider
  Enabled / Secret configured / Secret ending / Webhook endpoint (copyable)
  / Provider status, withdrawal automation (enabled, endpoint, delivery
  health), deposit policy.
- `admin_list_review_deposits()` + `admin_resolve_deposit()` — finance
  review queue + controlled resolution into terminal states.
- `reconcile_payments()` — detective scan: orphan events, confirmed w/o
  journal, refund w/o reversal, amount mismatches, unresolved events,
  withdrawal w/o hold.
- Endpoint registry + provider status are admin-only; investors cannot
  read `admin_config`.

## 9. Secret management

- `PAYSTACK_SECRET_KEY`, `KORAPAY_SECRET_KEY`, `WORKER_SECRET` live in
  **Edge Function secrets** — never in `admin_config`, never in git,
  never returned to clients, never logged.
- `admin_config` carries only `secret_set` / `secret_last4` markers —
  currently `false`/`""` until the operator sets the function secrets and
  records the marker through `set_admin_config()`.
- **Operator step required (by design):**
  `supabase secrets set PAYSTACK_SECRET_KEY=… KORAPAY_SECRET_KEY=… WORKER_SECRET=…`
  then update the markers + webhook URLs in each provider dashboard.

## 10. Verification

### Local — `node scripts/verify-migrations.mjs`

**233 passed, 0 failed** (all migrations `0001–0011` on embedded PG).
Coverage: deposit auth/min/max/disabled-provider/currency; idempotent init;
provider-ref uniqueness; transitions + invalid transitions + expiry +
review; event signature/dup/concurrency/orphan/mismatch/late/reversal;
funding credit, no double-credit, idempotent retry, insufficient-cover
reversal, journal linkage; withdrawal min/fee/insufficient/HOLD/release/
payout/outbox atomicity; outbox claim/retry/DEAD; RLS isolation, admin
RBAC, anon denial, direct-write denial, `post_journal` inaccessible.

### Hosted — real permission model

Full lifecycle exercised end-to-end: authenticated `request_deposit` →
event ingest → `confirm_deposit` → `FUNDING_CREDIT` journal; `request_withdrawal`
→ `HOLD` journal + queued `rentbrown.outbound.v1` event → finance `decide` →
`COMPLETED` + `EXTERNAL_PAYOUT`. Denial probes all rejected correctly:
investor `decide_withdrawal`/`confirm_deposit`/`post_journal`/`admin_payment_overview`
→ permission denied; investor direct insert → denied; provider/outbound
events invisible to investors; `service_role` direct table write → blocked
by guard. `admin_payment_overview` + `reconcile_payments` reachable for
finance roles. `deposit_options` returns
`{currency:NGN, min:100000, max:null, expiry:null, providers:{PAYSTACK:true,KORAPAY:true}}`.
0 anomalies after cleanup.

### Repo

`pnpm typecheck` ✅ (12 packages) · `pnpm lint` ✅ · `pnpm build` ✅
(web/admin/site). `pnpm format:check` reports 340 pre-existing failures —
whole-repo CRLF working tree vs Prettier LF expectation under
`core.autocrlf=true` with no `.gitattributes`; predates Phase 5B, blobs
commit as LF.

## 11. Issues found & fixed during implementation

| # | Issue | Fix |
|---|---|---|
| 1 | `refund_deposit` insufficient-cover path hit `CONFIRMED → REVIEW_REQUIRED`, not in the transition map | Added the safe-hold edge to the map |
| 2 | `EXTERNAL_PAYOUT` wrote a zero-amount `FEE_REVENUE` line when fee=0 (violates `amount > 0`) | Fee line appended only when `fee_minor > 0` |
| 3 | Provider success on an un-initialized deposit could bypass verification | Simplified so init-not-complete cannot confirm |
| 4 | `{"checkout_url": null}` written into metadata on null merge | Merge now gated on non-null |
| 5 | `request_withdrawal` posted HOLD before idempotency check | Idempotency lookup moved ahead of the hold |
| 6 | `config_bool` returned NULL on missing/inactive row — `if not null` skipped the provider-enabled check | `select coalesce((select …), false)` |
| 7 | Hosted `admin_payment_overview` initially listed a stale endpoint | Re-seeded `payment.endpoint.*` with deployed URLs |

## 12. Fixture cleanup

Hosted verification fixtures (investor + finance users, deposit, provider
event, withdrawal, journals, ledger lines, wallet, outbox, audit rows) were
deleted via `execute_sql` with user triggers temporarily disabled; a final
count probe showed **all fixture categories at 0**, triggers re-enabled.
Reconciliation post-cleanup: `anomalies: 0`, all counters 0.

## 13. Deferred Phase 5+

- International/crypto provider + USD deposit path + FX — extension seam
  only (`payment_provider` enum + adapter interface; Paystack/KoraPay reject
  non-NGN server-side).
- KYC engine — existing flags preserved; no provider invented.
- Referral rewards, notifications.
- `withdrawal.approved/completed/rejected` outbound events — V1 sends
  `requested` only.
- Outbound webhook HMAC signing — worker payload carries a spec version so
  a signature can be added without redesign.
- Deposit max/expiry production values — keys exist, seeded inactive/null.

## 14. Git

All Phase 5B changes committed to `main` and pushed normally (no force,
no history rewrite). Working tree clean after commit.
