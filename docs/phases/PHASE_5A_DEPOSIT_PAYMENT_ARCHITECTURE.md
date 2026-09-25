# Phase 5A — Deposits & Payment Infrastructure Architecture

**Status: PROPOSAL — pending approval. No implementation performed.**

Scope: NGN deposits via Paystack + KoraPay, a provider-agnostic seam for a
future international/crypto provider, manually-processed withdrawals with an
outbound operational webhook, payment-function endpoint visibility, secrets
model, and the Phase 5B migration/verification plan.

## 1. Executive summary

Money enters the platform through provider webhooks; it is **credited only
after** (a) webhook authenticity is proven by HMAC signature, (b) the provider
event is durably persisted and deduplicated, (c) the transaction is
re-verified against the provider's server-side API, and (d) the verified
amount/currency match the internal deposit. Crediting is a `post_journal()`
call with a deterministic idempotency key — the ledger stays the single
financial source of truth and there is no second credit path.

Provider payload details differ (Paystack vs KoraPay) but are normalized
behind a `PaymentProvider` adapter contract. A third provider slot is
reserved structurally — nothing is implemented for it.

Withdrawals stay manual (no payout provider). The only automation added is an
**outbound** JSON webhook to a configured endpoint (initially Make.com),
delivered through a durable outbox so withdrawal state never depends on
Make's availability.

Hard rule baked into server logic: **deposits are NGN-only via Paystack or
KoraPay at launch.** USD wallets exist but have no deposit path until a
future provider is approved; this is enforced in the RPC, not the UI.

## 2. Current architecture dependencies (verified against repo)

- Ledger (0005–0007): `post_journal()` is the only balance writer;
  `journal_type` already contains `FUNDING_CREDIT`, `PENDING_CREDIT`,
  `PENDING_CONFIRM`, `REFUND`, `REVERSAL`, `HOLD`, `HOLD_RELEASE`,
  `EXTERNAL_PAYOUT`, `FEE_DEBIT`, `ADMIN_ADJUSTMENT`; system accounts
  `DEPOSITS_CLEARING`, `PAYOUTS_CLEARING`, `FEE_REVENUE`, `ADJUSTMENTS` are
  seeded for NGN and USD. **No Phase-4 blocker found — nothing in
  0001–0007 requires change.**
- `admin_config` (0002–0004): typed key registry (`key, category,
  value_type, jsonb value, currency, is_active`), writes only via
  `set_admin_config()` (SUPER_ADMIN, validated, history + audit). Existing
  keys already include `deposit.min_minor.NGN` and
  `withdrawal.min_minor.NGN` / fee keys — reused, not duplicated.
- RBAC: `admin_roles` (SUPPORT, KYC_REVIEWER, OPERATIONS_ADMIN,
  FINANCE_ADMIN, SUPER_ADMIN) + `has_admin_role()`. Permission vocabulary in
  `@rentbrown/types` already includes `finance.read`,
  `finance.review_withdrawals`, `finance.reconcile`, `policies.read`,
  `audit.read`.
- Audit: `audit_log` append-only; `actor_id/actor_role/action/entity_*`
  shape reused by `admin_post_adjustment`.
- UI contracts already define `DepositStatus`
  (`AWAITING_TRANSFER|CONFIRMING|CREDITED|FAILED|EXPIRED`) and
  `WithdrawalStatus` (`REQUESTED|UNDER_REVIEW|APPROVED|PROCESSING|COMPLETED|
  REJECTED|FAILED`) — the internal state machines below map onto these
  display states; the wire enum is untouched.
- No `supabase/functions` directory or `config.toml` exists yet — Edge
  Functions are introduced by this phase (see §11).
- No provider SDK/credentials anywhere; `.env` DB password remains broken
  (moot — MCP is the apply path).

## 3. Deposit domain model

### 3.1 `deposits` table (proposed, Phase 5B — `0008`)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | internal deposit id |
| `reference` | text unique | human-facing `DEP-XXXXXXXXXXXX` |
| `idempotency_key` | text unique | `dep:init:<user>:<client-key>` — init retries converge |
| `user_id` | uuid FK→profiles | RESTRICT |
| `currency` | currency_code | server-authoritative; NGN-only at launch |
| `amount_minor` | bigint `>0` | server-validated requested amount |
| `confirmed_amount_minor` | bigint | set only after provider verify |
| `provider` | `payment_provider` enum | `PAYSTACK` / `KORAPAY` (extensible) |
| `provider_reference` | text | provider-side transaction reference |
| `provider_txn_id` | text | provider's own txn id when distinct |
| `provider_status` | text | last normalized provider status string |
| `status` | `deposit_status` enum | §4 |
| `review_reason` | text | populated on REVIEW_REQUIRED |
| `init_channel` | text | `CARD`/`BANK_TRANSFER`/… normalized |
| `pending_journal_id` | uuid FK→journal_entries | PENDING_CREDIT if used |
| `funding_journal_id` | uuid FK→journal_entries | the credit journal |
| `reversal_journal_id` | uuid FK→journal_entries | provider reversal path |
| `request_id` | text | correlation id end-to-end |
| `expires_at` | timestamptz | checkout/payment window |
| `initiated_at`/`confirmed_at`/`failed_at`/`cancelled_at`/`refunded_at` | timestamptz | lifecycle timestamps |
| `metadata` | jsonb | minimized, non-sensitive debug data |
| `created_at`/`updated_at` | timestamptz | |

Constraints:

- `unique (provider, provider_reference)` where `provider_reference is not
  null` — **two deposits can never claim the same provider transaction**
  (Case F).
- `funding_journal_id` unique — one credit journal per deposit, ever.
- `check (amount_minor > 0)`, `check (confirmed_amount_minor is null or
  confirmed_amount_minor > 0)`.
- FKs to `profiles` and `journal_entries` are RESTRICT.

### 3.2 `deposit_events` — append-only transition log

`id, deposit_id FK, from_status, to_status, source ('SYSTEM'|'PROVIDER'|
'ADMIN'|'USER'), provider_event_id, request_id, note, created_at`. Every
state change writes a row inside the same transaction; transitions are
**evented and append-only** — no history is rewritten.

### 3.3 `payment_provider_events` — raw webhook intake

| Column | Purpose |
|---|---|
| `id` uuid PK | internal event id |
| `provider` | enum |
| `provider_event_id` | provider's event id when present (Paystack has none — see §8) |
| `event_type` | normalized: `charge.success`, `charge.failed`, `refund.*`… |
| `signature_valid` | bool — invalid events are stored-then-rejected for forensics |
| `idempotency_key` unique | `provider:sha256(normalized key fields)` — dedupes duplicates |
| `deposit_id` FK nullable | set after correlation |
| `payload_hash` | sha256 of raw body — tamper evidence without full retention |
| `payload` jsonb | **minimized**: reference, amount, currency, status, fee, merchant ref, event id/time. Card BIN/last4/customer PII stripped unless needed for disputes |
| `status` | `RECEIVED|PROCESSED|IGNORED|FAILED|REVIEW` |
| `attempts`/`last_error`/`processed_at`/`received_at`/`request_id` | retry + audit |

What we do **not** persist: full card details, authorization objects,
customer phone/IP payloads, signature headers themselves, or anything we
can't justify for dispute/audit. Hash + minimized payload is enough to
re-derive correlation; the provider dashboard remains the system of record
for raw payloads.

## 4. Deposit state machine

```
INITIATED            record created, provider initialize in flight
  └─ PENDING         provider accepted; awaiting payment/webhook
       ├─ CONFIRMED  signature ok → provider verify ok → amount/currency match
       │             → FUNDING_CREDIT posted (terminal for value)
       │                └─ REFUNDED  provider reversal after credit
       │                             (REVERSAL journal; history preserved)
       ├─ FAILED     provider reports failure / verify failed / init failed
       ├─ EXPIRED    payment window elapsed, no confirmed payment
       ├─ CANCELLED  user/admin cancel before payment (PENDING only)
       └─ REVIEW_REQUIRED  hold: mismatch, unknown ref, duplicate claim,
                           verification unreachable, refund w/o balance
REVIEW_REQUIRED      → CONFIRMED | FAILED | REFUNDED | CANCELLED by admin RPC
                     (each forced transition writes deposit_events + journal
                      where value moves, and an audit_log row)
```

Rules:

- A deposit never "moves backward" — `CONFIRMED` only exits to `REFUNDED`
  via a reversal journal, never by editing the deposit or ledger.
- Provider retries of an already-terminal deposit are recorded as provider
  events (`IGNORED`/`REVIEW`) but cannot silently reopen state.
- `FAILED`/`EXPIRED`/`CANCELLED` are terminal **except** a late success
  webhook routes to `REVIEW_REQUIRED` (never auto-credit a deposit we told
  the user failed).
- Transitions are guarded by a definer RPC (`apply_deposit_transition`)
  taking `SELECT … FOR UPDATE` on the deposit row — webhook concurrency
  serializes on the deposit row, exactly like wallets.

## 5. PaymentProvider abstraction (server-side only)

```ts
interface PaymentProvider {
  readonly id: "PAYSTACK" | "KORAPAY" /* | future */;
  supportedCurrencies(): CurrencyCode[];      // launch: ["NGN"]
  initializeDeposit(cmd: InitDepositCommand): Promise<InitDepositResult>;
  verifyTransaction(ref: ProviderRef): Promise<NormalizedTransaction>;
  verifyWebhookSignature(rawBody: string, headers: HeaderMap): boolean;
  normalizeWebhookEvent(rawBody: string): NormalizedProviderEvent;
}
```

- `InitDepositResult` = `{ providerReference, checkoutUrl, accessToken?,
  expiresAt }` — only client-safe fields ever leave the server.
- `NormalizedTransaction` = `{ providerReference, status, amountMinor,
  currency, providerTxnId, paidAt, rawStatus }`.
- `NormalizedProviderEvent` = `{ eventType, providerReference,
  merchantReference, status, amountMinor, currency, providerTxnId,
  occurredAt }`.

Provider adapters live server-side (Edge Function code +
`@rentbrown/supabase` server utilities); nothing provider-shaped crosses
the client boundary. `PaymentProvider` is the only surface a future
international/crypto provider must implement — deposits/events/state
machine/ledger don't change.

## 6. Payment initialization flow

1. Client calls `request_deposit(amount_minor, provider)` — **never** sends
   currency (wallet/account currency is resolved server-side), user id
   (auth.uid()), or provider references.
2. RPC validates: authenticated + account ACTIVE; `provider` enabled in
   `admin_config`; `currency` forced `NGN` while provider ∈ {PAYSTACK,
   KORAPAY}; `amount_minor` ≥ `deposit.min_minor.NGN`, integer, >0.
3. RPC inserts `deposits` (status `INITIATED`, idempotency key
   `dep:init:<uid>:<client_key>` — retry returns existing row) +
   `deposit_events` row. Atomic.
4. Server calls `provider.initializeDeposit` with **merchant reference =
   `deposit.reference`** (never provider-generated refs that we then have to
   trust a client to echo back).
5. On provider success → `PENDING`, store `provider_reference`,
   `checkout_url`/`access_code` returned to client. On provider error →
   `FAILED` + event. On timeout → deposit stays `INITIATED`; a reconcile
   sweep (or user retry which converges on the idempotency key) resolves it.
6. Client completes checkout on the provider's hosted page/inline SDK.

Authoritative values: amount/currency/user — server; provider reference —
server-assigned at init; status — provider webhook **plus** server-side
verify call. The client-provided "success" redirect/callback is never
trusted; it only triggers a verify.

## 7. Webhook architecture (inbound)

Public Edge Functions (providers must reach them — public URL is by design;
the security mechanism is **signature verification**, not URL secrecy):

- `POST /functions/v1/payment-webhook-paystack`
- `POST /functions/v1/payment-webhook-korapay`

Pipeline (one DB transaction where possible):

1. Read raw body bytes (no parsing before HMAC).
2. Signature check (per-provider, §12/§13). Fail → persist event
   `signature_valid=false, status=REVIEW`, respond 401 (never 200 — we don't
   tell attackers we accepted it; provider will not retry invalid sigs
   anyway).
3. Parse + normalize event → insert `payment_provider_events` with
   deterministic `idempotency_key`. On unique conflict → return 200
   immediately (duplicate delivery acknowledged; already processed or
   in-flight).
4. Correlate to deposit by merchant reference (Paystack `reference` /
   KoraPay `payment_reference`); missing → status `REVIEW`, event retained.
5. `SELECT … FOR UPDATE` the deposit → apply allowed transition via
   `apply_deposit_transition`.
6. For success-class events: **server-side `verifyTransaction`** against the
   provider API. Only on match of `status + amount + currency +
   merchant_reference` does `FUNDING_CREDIT` post (idempotency
   `dep:fund:<deposit_id>`) and deposit → `CONFIRMED` with
   `funding_journal_id` linked.
7. Response: 200 on processed/dup/ignored-with-record; 5xx only when we
   want the provider to retry (transient DB fault) — and retries are safe
   because of step 3 + row lock + journal idempotency.

Ordering & delivery guarantees designed for: once / twice / N times /
concurrent (event idempotency key + deposit row lock) / after timeout
(provider retries; our idempotent processing makes re-delivery harmless) /
after 200 already returned (dup key short-circuits) / out-of-order
(state machine rejects backward transitions; a `charge.success` arriving
before our init callback finished is just an early valid event).

"Webhook received = credit" is explicitly rejected. Credit requires:
signature + persisted event + correlated deposit + provider verify +
amount/currency match + atomic `post_journal`.

## 8. Amount / currency mismatch matrix

| Case | Wallet credit? | Deposit state | Event status | Review? |
|---|---|---|---|---|
| A: requested ₦50,000, verified ₦5,000 | **No** | REVIEW_REQUIRED | PROCESSED(flag) | manual |
| B: requested NGN, verified USD | **No** | REVIEW_REQUIRED | PROCESSED(flag) | manual |
| C: webhook ref belongs to another deposit | **No** | untouched; new event → REVIEW | REVIEW | manual |
| D: webhook success but provider verify fails | **No** | unchanged (PENDING) | FAILED(retryable) | auto-retry → review after N |
| E: success arrives after deposit FAILED/CANCELLED | **No** | REVIEW_REQUIRED | PROCESSED(flag) | manual |
| F: two deposits claim same provider ref | **No** | second claim → REVIEW_REQUIRED | REVIEW | manual |
| G: same webhook concurrently | once — unique event key + row lock | normal | dedup | none |
| H: provider confirmed, our posting timed out | eventually — replay `dep:fund:<id>` converges | CONFIRMED on retry | retried | none |

Never auto-credit mismatched/unverifiable money. `REVIEW_REQUIRED` deposits
surface in the admin reconciliation queue (`finance.reconcile`).

## 9. Ledger mapping (verified against 0005 shapes)

| Moment | Journal | Lines | Idempotency key |
|---|---|---|---|
| Provider verify ok, settled | `FUNDING_CREDIT` | DR `system:deposits_clearing` / CR `user:<uid>:available` | `dep:fund:<deposit_id>` |
| Pay-with-transfer funds seen, not settled *(optional)* | `PENDING_CREDIT` | DR `system:deposits_clearing` / CR `user:…:pending` | `dep:pend:<deposit_id>` |
| Settlement confirmed after pending | `PENDING_CONFIRM` | DR `user:…:pending` / CR `user:…:available` | `dep:conf:<deposit_id>` |
| Provider reversal/refund of confirmed deposit | `REVERSAL` of the funding journal (via `reverse_journal`) | exact mirror (DR `user:…:available` / CR `system:deposits_clearing`) | `rev:<fund key>` (automatic) |

Notes:

- `REFUND` (which **credits** user AVAILABLE per the 0005 shape) is the
  wrong direction for a provider refund — a provider reversal removes
  platform funds, so the correct instrument is `REVERSAL`. `REFUND` remains
  reserved for flows that return external money *into* a wallet (e.g.
  cancelled externally-funded investment).
- If a provider reversal arrives but the user's AVAILABLE no longer covers
  it (spent) → `post_journal` fails on `CHECK >= 0` → deposit goes
  `REVIEW_REQUIRED` + ops decision (flagged — not auto-debited).
- Journal ↔ deposit linkage: `journal_entries.entity_type='deposit'`,
  `entity_id=<deposit.id>`, `request_id` copied; the deposit stores
  `funding_journal_id` for direct lookup.
- Posting failure (any exception) rolls back deposit transition AND journal
  atomically; the event stays `FAILED` and is retried — no partial state.
- No deposit path bypasses `post_journal`. `post_journal` stays
  service-role-only; deposits never call it from the client.

## 10. Manual-review triggers (auto-hold, never auto-credit)

Amount mismatch · currency mismatch · unknown/foreign provider reference ·
invalid signature · provider verification unreachable or failed · duplicate
transaction claim · unexpected/late transitions · provider reversal after
credit without cover · ledger posting failure · malformed event. Each writes
`deposit_events`/`payment_provider_events` with reason + sets
`REVIEW_REQUIRED` where a deposit is involved. Resolution is an admin RPC,
never a table edit.

## 11. Provider cloud-function endpoints — registry & visibility

Deployed endpoints are **operational config**, stored in `admin_config`
(TEXT, category `payment`):

- `payment.endpoint.paystack.webhook` — our deployed webhook function URL
- `payment.endpoint.korapay.webhook` — our deployed webhook function URL
- `payment.endpoint.environment` — `production|staging` label (display)

These are set at deploy time (seeded/managed via `set_admin_config`), shown
in the admin control center so ops can confirm what to paste into provider
dashboards, and audited by the existing `admin_config_history` + `audit_log`
trail. Provider **API base URLs** (api.paystack.co, api.korapay.com) are code
constants, not config — they change with provider docs, not ops policy.

Endpoint secrecy is not the security model: webhook URLs are public by
necessity; authentication is the HMAC signature + (optionally) provider IP
allow-listing, both verifiable without trusting the URL.

## 12. Paystack adapter facts (provider docs consulted)

- **Init**: `POST https://api.paystack.co/transaction/initialize`
  (`Authorization: Bearer <secret>`) → `authorization_url`, `access_code`,
  `reference`. We pass our own `reference` (= deposit reference) — Paystack
  accepts merchant references.
- **Verify**: `GET /transaction/verify/:reference` (Bearer secret) —
  authoritative `data.status` ∈ `success|failed|abandoned|reversed|
  ongoing|pending|processing|queued`; `data.amount` in minor units (kobo);
  `data.currency`.
- **Webhook auth**: `x-paystack-signature` = HMAC-SHA512 of the **raw**
  request body with the secret key. Optional IP allow-listing supported.
  Paystack documents webhooks primarily for successful charges — failure is
  learned via verify/callback status.
- **Reversals**: `data.status='reversed'` on verify; dispute events
  (`charge.dispute.*`) exist; a refund API exists (`POST /refund`) — we only
  *consume* reversal signals, we don't initiate provider refunds in 5B.
- No event id / no delivery timestamp headers → our event idempotency key =
  `paystack:sha256(event + reference + amount + status)`; duplicates are
  safe because processing itself is idempotent.

## 13. KoraPay adapter facts (provider docs consulted)

- **Init**: `POST https://api.korapay.com/merchant/api/v1/charges/initialize`
  (`Authorization: Bearer <secret>`) → `checkout_url`, `reference`.
  Merchant `reference` + `notification_url` (per-charge webhook override) +
  `redirect_url` are request params; customer name/email required.
- **Verify**: `GET …/charges/{reference}` — current charge status.
- **Webhook auth**: `x-korapay-signature` = HMAC-SHA256 of **only the `data`
  object** (`JSON.stringify(req.body.data)`) with the secret key —
  materially different from Paystack's whole-body signature; the adapter
  abstracts this.
- **Webhook data**: `event` (`charge.success`, also failure notifications),
  `data.reference` (Kora's ref), `data.payment_reference` (**our** merchant
  ref — correlation key), `data.amount`, `data.amount_expected`,
  `data.currency`, `data.fee`, `data.transaction_status` ∈
  `success|underpaid|overpaid` — `underpaid/overpaid` map to REVIEW_REQUIRED,
  never auto-credit.
- `notification_url` per-charge is supported; we still pin a dashboard
  webhook as fallback.

## 14. admin_config keys (proposed; secrets excluded — see §15)

| Key | Type | Purpose |
|---|---|---|
| `payment.provider.paystack.enabled` | BOOLEAN | kill-switch |
| `payment.provider.korapay.enabled` | BOOLEAN | kill-switch |
| `payment.endpoint.paystack.webhook` | TEXT | deployed webhook fn URL (admin-visible) |
| `payment.endpoint.korapay.webhook` | TEXT | deployed webhook fn URL |
| `payment.endpoint.environment` | TEXT | `production`/`staging` label |
| `payment.deposit.max_minor` | MONEY_MINOR (NGN) | server-side cap; min already exists as `deposit.min_minor.NGN` |
| `payment.deposit.expiry_minutes` | INTEGER | PENDING → EXPIRED window |
| `payment.provider.paystack.secret_last4` | TEXT | `sk_live_…4f2a` display hint only |
| `payment.provider.paystack.secret_set` | BOOLEAN | "configured" status for admin panel |
| `payment.provider.korapay.secret_last4` | TEXT | ditto |
| `payment.provider.korapay.secret_set` | BOOLEAN | ditto |
| `payment.provider.korapay.public_key` | TEXT | public key is client-safe by design |
| `withdrawal.webhook.url` | TEXT | outbound target — initial value the Make URL you provided |
| `withdrawal.webhook.enabled` | BOOLEAN | outbound kill-switch |

Access: reads stay behind the existing admin config policy (admins only —
investors/anon already cannot read `admin_config`); writes remain
`set_admin_config` = SUPER_ADMIN. `withdrawal.webhook.url` is
operational-secret-adjacent (whoever holds it can POST fake events *to
Make*): the URL is stored in full (the worker needs it) but the admin UI
should render it masked (`https://hook.eu2.make.com/8ml2…`) with a
SUPER_ADMIN-only reveal via a definer RPC — flagged as decision D-5.7.

## 15. Secret management

- **Provider secret keys, webhook-signing secrets: NEVER in `admin_config`.**
  `admin_config` is a policy registry readable by all admin roles —
  inappropriate for credentials.
- Secrets live in **Supabase Edge Function secrets** (`supabase secrets set`)
  — injected as env vars into functions, never readable via API, never in
  git/client bundles. Rotation = re-set secret + update `secret_last4` /
  `secret_set` flags + `updated_at` of those markers via `set_admin_config`
  (audited change of *metadata*, never the value).
- `admin_config` therefore carries only: enabled flags, endpoint URLs,
  last4/set markers, environment label.
- Audit log records `config.update`/`payment.secret_rotated` with metadata
  (`key`, `last4`) — never values.
- Investor/anon: no read path exists for any of this (verified by RLS
  today; preserved).

## 16. Withdrawals (manual processing + outbound webhook)

### 16.1 `withdrawals` table (0008)

`id uuid PK, reference unique, idempotency_key unique, user_id FK,
currency, amount_minor, fee_minor, net_minor, destination jsonb
(bank_name/account_number/account_name — provider-free, admin-processed),
status enum mirroring UI `WithdrawalStatus`, hold_journal_id,
payout_journal_id, release_journal_id, reviewed_by, request_id,
timestamps (requested/reviewed/paid/rejected), metadata`.

`withdrawal_events` append-only transition log, same shape as
`deposit_events`.

### 16.2 Flow

`request_withdrawal(amount, destination)` RPC (authenticated):

1. Validate: ACTIVE account, ≥ `withdrawal.min_minor.NGN`, fee from
   `withdrawal.fee_bps`/`fee_cap_minor.<cur>` snapshot at request time
   (existing keys).
2. `post_journal('HOLD', …)` DR available / CR reserved — atomic with…
3. `withdrawals` insert (status REQUESTED, idempotency
   `wd:init:<uid>:<client_key>`) + `withdrawal_events` + **outbox row** —
   all one transaction; any failure releases nothing because nothing
   committed.
4. Admin approves/rejects via `decide_withdrawal` (finance.review_withdrawals):
   - REJECT → `HOLD_RELEASE` journal, status REJECTED.
   - APPROVE/MARK_PAID after manual external payment → `EXTERNAL_PAYOUT`
     journal (DR reserved / CR `payouts_clearing` + `fee_revenue` split per
     0005 shape) → COMPLETED.
5. Outbound webhook fires on `WITHDRAWAL_REQUESTED` (and optionally on status
   changes — decision D-5.5) via outbox.

### 16.3 Outbound outbox — `outbound_events` (0008)

`id uuid PK, event_type, aggregate_type, aggregate_id, payload jsonb,
idempotency_key unique, status QUEUED|DELIVERED|FAILED|DEAD, attempts,
next_attempt_at, last_response_code, last_error, created_at, delivered_at,
request_id`.

- Outbox row is inserted **in the same transaction** as the state change →
  an event can never exist without the financial fact.
- A worker (scheduled Edge Function via pg_cron, or `supabase/functions`
  invoked by Database Webhook) delivers `POST` JSON with 10s timeout,
  exponential backoff, max attempts → DEAD (alertable).
- Delivery failure never mutates withdrawal state; retry only re-sends.
- The Make URL lives in `withdrawal.webhook.url`; `…enabled` gates sending.

### 16.4 Outbound payload contract (v1)

```json
{
  "spec": "rentbrown.outbound.v1",
  "event_id": "uuid",
  "event_type": "withdrawal.requested",
  "idempotency_key": "wd:<withdrawal_id>:requested",
  "occurred_at": "iso8601",
  "request_id": "…",
  "data": {
    "withdrawal_id": "uuid", "reference": "WD-…", "status": "REQUESTED",
    "user": { "id": "uuid", "display_name": "…" },
    "amount_minor": 100000, "fee_minor": 5000, "net_minor": 95000,
    "currency": "NGN",
    "destination": { "bank_name": "…", "account_number": "…",
                     "account_name": "…" },
    "requested_at": "iso8601"
  }
}
```

Included: what Make needs to route the manual payout task. Excluded:
passwords/PINs, KYC identifiers, provider secrets, internal journal ids
(internal bookkeeping — include only if ops wants trace; decision D-5.6).
Expected response: 2xx = DELIVERED; else retry. Optional
`X-RentBrown-Signature` (HMAC-SHA256, shared secret) — supported in schema
(`outbound_events` carries payload + key already) but not required for v1 —
decision D-5.6.

## 17. RBAC mapping (no new roles, no isAdmin shortcuts)

| Capability | Permission | Roles |
|---|---|---|
| View deposits/events/wallets | `finance.read` | SUPPORT, FINANCE_ADMIN, SUPER_ADMIN |
| View payment config + endpoints | `policies.read` (+ finance.read for payment category filter) | admin roles; payment section additionally gated to finance.read |
| Edit payment config / webhook URL | `set_admin_config` (SUPER_ADMIN only) | SUPER_ADMIN |
| Retry provider event / force review / resolve review | `finance.reconcile` | FINANCE_ADMIN, SUPER_ADMIN |
| Request withdrawal | authenticated investor (own) | — |
| Approve/reject/mark-paid withdrawal | `finance.review_withdrawals` | FINANCE_ADMIN, SUPER_ADMIN |
| Rotate provider credentials | infra op (Supabase secrets) + SUPER_ADMIN updates marker keys | SUPER_ADMIN |
| View raw/masked secret status | `finance.read` sees `_set`/`_last4` markers; raw secrets unreadable by anyone via API | — |
| `post_journal`, internal helpers | service_role only (unchanged) | — |

## 18. Reconciliation model (design now, build Phase 5B+)

Joins available end-to-end: `payment_provider_events.deposit_id` →
`deposits` → `journal_entries` (entity_type='deposit' +
funding_journal_id) → `ledger_entries` → `wallets`.

Detection queries (to become `reconcile_*` RPCs / admin queue):

- provider event with no matching deposit → orphans (`deposit_id is null`)
- deposit PENDING past `expires_at` with no success event → expire sweep
- CONFIRMED deposit with `funding_journal_id is null` → posting gap
- journal `entity_type='deposit'` with no CONFIRMED deposit → impossible by
  construction (same txn), asserted as invariant
- two events same idempotency key → dedup count >1 (audit trail)
- verified amount ≠ requested / currency ≠ NGN → review queue
- provider reversal event with no matching reversal journal → review
- `reconcile_wallets()` (0006) re-asserts stored vs ledger-derived buckets.

## 19. Idempotency map

| Layer | Key | Enforcement |
|---|---|---|
| Deposit init | `dep:init:<uid>:<client_key>` | `deposits.idempotency_key` unique |
| Provider ref claim | provider+reference | unique partial index |
| Provider webhook | `provider:sha256(event+ref+amt+status)` | `payment_provider_events` unique |
| Deposit confirm | transition guard | row lock + state check |
| Ledger posting | `dep:fund:<deposit_id>` etc. | `journal_entries.idempotency_key` unique |
| Reversal | `rev:<orig key>` | unique + one-reversal index |
| Withdrawal request | `wd:init:<uid>:<client_key>` | unique |
| Withdrawal journals | `wd:hold/pay/rel:<id>` | unique |
| Outbound webhook | `wd:<id>:requested` | `outbound_events` unique |

Every critical invariant is database-enforced, not application-asserted.

## 20. Observability

Structured fields on every function log + audit/event rows: `request_id`,
`provider`, `deposit_id`, `provider_reference`, `provider_event_id`,
`journal_id`, `function` (init/webhook/verify/worker), `status`,
timestamps. Never logged: secrets, signatures, PINs, full card data, KYC
identifiers, raw provider payloads beyond the minimized copy.

## 21. Migration plan (Phase 5B — nothing created now)

- `0008_payments_schema.sql` — enums (`payment_provider`, `deposit_status`,
  `provider_event_status`, `outbound_status`, `withdrawal_status`); tables
  `deposits`, `deposit_events`, `payment_provider_events`, `withdrawals`,
  `withdrawal_events`, `outbound_events`; constraints/indexes above;
  `request_deposit` / `request_withdrawal` / `apply_deposit_transition` /
  `decide_withdrawal` internals.
- `0009_payments_rls.sql` — RLS (owner reads own deposits/withdrawals;
  finance-read roles read all incl. provider events; zero client writes),
  RPC grants, admin review/reconcile RPCs, `admin_payment_overview`.
- `0010_payments_config_seed.sql` — §14 keys (idempotent upsert pattern as
  0004; `withdrawal.webhook.url` seeded with the Make URL you supplied).
- Tracking stays `public.schema_migrations`; `0001–0007` untouched.

## 22. Verification plan (Phase 5B)

Extend `verify-migrations.mjs` (embedded PG) + hosted MCP probes:

init validation (auth, currency forced NGN, min amount, provider disabled
rejects, idempotent init replay) · provider-ref unique claim · webhook
signature accept/reject (both providers' different schemes) · event dedup &
concurrent delivery · correlation failures → REVIEW · verify-failure → no
credit, retryable · amount/currency mismatch → REVIEW, no credit · Case A–H
matrix end-to-end · FUNDING_CREDIT posts once under retry · reversal path ·
failed-posting rollback leaves no wallet/journal · RLS owner/admin/anon ·
`post_journal` still unreachable from clients · secret-marker keys readable
by admins, no secret values anywhere · endpoint registry visible to admins ·
withdrawal: hold atomicity, outbox row same-txn, approval payout split,
reject release, webhook-failure isolation (delivery failure leaves
withdrawal REQUESTED), outbox retry/dead states · reconcile queries ·
`schema_migrations` == 0001–0010 only.

Hosted: same suite via `set local role` + JWT claims on the real permission
model — which is exactly what caught the Phase-4 deferred-trigger ACL bug
the privileged local stub missed. (Harness fix to carry forward: embedded
`authenticated`/`service_role` stubs should be made non-superuser where
possible.)

## 23. Explicit decisions (my recommendations; approval needed)

- **D-5.1** Ledger timing: verified success → `FUNDING_CREDIT` directly
  (PENDING_CREDIT only for pay-with-transfer settlement gaps). *Recommend
  approve.*
- **D-5.2** Provider reversal = `REVERSAL` of funding journal (never
  `REFUND` — wrong direction; never DELETE). *Recommend approve.*
- **D-5.3** Insufficient cover on provider reversal → REVIEW_REQUIRED +
  manual resolution (never partial debit, never negative). *Recommend
  approve.*
- **D-5.4** Provider secrets in Edge Function env secrets; `admin_config`
  holds only `_set`/`_last4` markers. (Supabase Vault is the alternative —
  rejected for now: extra machinery, no benefit over function secrets for
  server-only callers.) *Recommend approve.*
- **D-5.5** Outbound webhook scope: fire on `withdrawal.requested` only
  (v1); status-change events added later if ops wants them. *Recommend
  approve.*
- **D-5.6** Outbound payload includes destination bank details (Make needs
  them to pay out) but no user email/phone/KYC/journal internals; HMAC
  signing supported in schema, deferred off for v1. *Recommend approve; flag
  destination-PII explicitly for your confirmation.*
- **D-5.7** `withdrawal.webhook.url` stored in full in `admin_config`,
  masked in admin UI with SUPER_ADMIN reveal. *Recommend approve.*
- **D-5.8** Deposits are NGN-only and gated `provider ∈ {PAYSTACK,KORAPAY}`
  server-side; USD deposits reject with a typed error until an approved
  international provider lands. *Recommend approve.*
- **D-5.9** KYC/email-verification gating for deposits: NOT enforced in 5B
  (KYC engine is Phase 7); deposit limits come from config instead. *Needs
  product decision — deposit-before-KYC allowed?*

## 24. Open questions requiring product approval

1. Deposit-before-KYC policy (D-5.9) — regulatory/business call.
2. Make payload: destination bank details OK to send (D-5.6)?
3. Deposit max cap value & expiry window defaults (proposed keys exist;
   values are policy).
4. Should `FAILED` webhook events from providers also notify admin
   immediately, or only via reconciliation queue?
5. Do you want the outbound webhook also fired on withdrawal status
   changes (approved/paid/rejected) in v1?

## 25. Deferred

Provider implementation, Edge Function code, deposits/withdrawals tables,
outbound delivery worker, reconciliation RPCs, international/crypto
provider (seam only — no provider selected, none invented), KYC gating, FX,
referral rewards, notifications, any UI changes. All Phase 5B+.
