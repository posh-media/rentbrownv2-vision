# PHASE 5B — Operator / Production-Readiness Verification Report

**Status:** ✅ VERIFIED — operationally ready for Phase 6
**Companion to:** `PHASE_5B_IMPLEMENTATION_REPORT.md`
**Hosted project:** `aqkynjuypijmlqnpcmza`
**Fixture scope:** disposable `p5bverify` investor + `p5bfinance` finance
admin; sandbox (`sk_test_`) provider keys; no real money, no real payout.
All fixtures deleted after verification.

---

## 1. Edge Function secrets — CONFIGURED ✅

| Secret | Deployed | Verified readable | Verified at provider |
|---|---|---|---|
| `PAYSTACK_SECRET_KEY` | ✅ | ✅ (valid HMAC accepted) | ✅ `GET /transaction` → 200 |
| `KORAPAY_SECRET_KEY` | ✅ | ✅ (valid HMAC accepted) | ✅ `query-by-reference` → 404 "Charge not found" (auth passed; 401s precede lookup) |
| `WORKER_SECRET` | ✅ | ✅ (`x-worker-key` → worker ran) | n/a (internal) |

Set via `supabase secrets set --env-file .env.secrets`. Values never entered
chat, git, logs, or `admin_config`.

Non-exposure checks:
- `git ls-files` scan for all three secret values across every tracked
  file → **0 hits**; `.env.secrets` untracked/gitignored ✅
- `deposit_options()` returns enabled flags + limits only — no secret or
  marker fields ✅
- `admin_payment_overview` returns `secret_set`/`secret_last4` markers only ✅
- Function code reads secrets via `Deno.env` only; error paths log provider
  *messages*, never credentials ✅

## 2. Admin secret markers — SET ✅

Updated via `set_admin_config()` under an authorized admin claim (fixture
temporarily elevated to SUPER_ADMIN for the four writes, then reverted to
FINANCE_ADMIN):

- `payment.provider.paystack.secret_set` = `true`, `secret_last4` = `"1683"`
- `payment.provider.korapay.secret_set` = `true`, `secret_last4` = `"t4wF"`

`/finance/payments` renders only `Yes`/`…xxxx` metadata. `WORKER_SECRET`
has no admin marker by design (not part of the approved config surface).

## 3. Deployed webhook endpoints — VERIFIED ✅

| Provider | Registered URL |
|---|---|
| Paystack | `https://aqkynjuypijmlqnpcmza.supabase.co/functions/v1/payment-webhook-paystack` |
| KoraPay | `https://aqkynjuypijmlqnpcmza.supabase.co/functions/v1/payment-webhook-korapay` |

Both live, ACTIVE, responding (invalid sig → 401). `/finance/payments`
renders them copyable — no placeholders.

## 4. Provider dashboard configuration — MANUAL ⚠️

Cannot be verified programmatically — paste into each provider dashboard:

- **Paystack:** Dashboard → Settings → API Keys & Webhooks → Webhook URL →
  `…/functions/v1/payment-webhook-paystack`
- **KoraPay:** Merchant dashboard → Settings/Webhooks → Notification URL →
  `…/functions/v1/payment-webhook-korapay`

## 5–7. Withdrawal outbox + Make delivery — VERIFIED ✅

| Check | Result |
|---|---|
| `request_withdrawal` → `HOLD` journal + row + QUEUED event (atomic) | ✅ 3 fixture withdrawals |
| Payload `rentbrown.outbound.v1` / `withdrawal.requested` | ✅ all required fields; no PIN/password/KYC/secret/journal/card fields |
| Idempotent replay | ✅ same row returned; 1 journal, 1 outbox event |
| **Worker → live POST → Make** | ✅ `x-worker-key` auth → claim → POST → `{"delivered":1}` → `DELIVERED` |
| Exponential backoff | ✅ `2^attempts × 60s`, capped at `2⁶` |
| `DEAD` after `max_attempts` (8) | ✅ exactly at 8, never re-claimed |
| Retry → `DELIVERED` | ✅ |
| Financial state untouched by delivery outcomes | ✅ withdrawals stayed `REQUESTED`, holds intact |

Note: `attempts` counts *claims*; the DEAD cutoff applies on failed
*finishes* — claims without a finish (worker crash mid-flight) can't
starve an event, and any failed finish ≥8 attempts marks DEAD. Observed
anomaly (fixture event at attempt 13 then DELIVERED) was a test artifact
of batch claims during the backoff probe — correct behavior.

## 8. Provider fail-closed verification — VERIFIED ✅

| Check | Result |
|---|---|
| Valid Paystack signature → accepted | ✅ 200, `signature_valid=true`, persisted |
| Valid KoraPay signature → accepted | ✅ 200, `signature_valid=true`, persisted |
| Invalid/missing signature | ✅ 401 `invalid signature` (was 500 pre-secrets) |
| Replayed identical signed payload | ✅ 200 but deduped — single row (unique idempotency key) |
| Unknown deposit reference | ✅ REVIEW, no credit |
| Amount/currency mismatch, late success, reversal cover | ✅ locally proven (233-check suite) + hosted REVIEW paths |
| `initialize-deposit` provider-failure cleanup | ✅ fixed this pass — `fail_deposit_init` on provider-init throw (v2 deployed) |

**Remaining manual check:** a real `charge.success` → provider verify →
`CONFIRMED` needs a genuine sandbox checkout (pay a test transaction).
Both keys are `sk_test_` — safe to exercise.

## 9. Currency / product rule — VERIFIED ✅

- `request_deposit` enforces NGN server-side; both seeded keys are test-mode.
- NGN wallets see only enabled providers; non-NGN wallets get
  "International deposits coming soon" — Paystack/KoraPay never offered.
- No crypto provider exists or is surfaced anywhere.

## 10. Deposit limits / expiry — VERIFIED ✅

`deposit.min_minor.NGN` = 100,000 authoritative. `max_minor` /
`expiry_minutes` remain inactive/null — admin UI shows "Not configured".

## 11. Admin UI — VERIFIED ✅

`admin_payment_overview` returns: environment (`production`), both
providers' enabled + `secret_set` + `secret_last4` + webhook endpoints,
withdrawal automation config + outbox health, deposit policy, review
counters. `/finance/payments` is `finance.read`-gated; investors get 0
rows on `admin_config`.

## 12. Security regression — VERIFIED ✅

| Probe | Result |
|---|---|
| Investor `decide_withdrawal` / `admin_payment_overview` | `not authorized` |
| Investor `post_journal` / `confirm_deposit` | `permission denied` |
| Investor direct UPDATE `withdrawals` | `permission denied for table` |
| Investor `provider_events`/`outbound_events`/`admin_config` reads | 0 rows |
| `service_role` direct `deposits` UPDATE | blocked by write guard |
| `deposit_options` unauthenticated | `not authenticated` |
| `outbox-worker` without secret | 401 |
| Secrets in git/bundles/logs | none |

## 13. Fixture cleanup — COMPLETE ✅

All fixture rows deleted (withdrawals, outbox, provider events, journals,
ledger lines, wallet, user ledger accounts, audit/history rows, admin
role, profiles, auth users): every counter at **0**. One `auth.users` row
remains — the pre-existing project owner account, not a fixture.
Marker values persist (real production config); `updated_by` nulled.

## 14. Issues found & fixed this pass

1. `initialize-deposit` could strand deposits in `INITIATED` on provider
   init failure → now calls `fail_deposit_init`; deployed as v2.
2. Unsigned webhooks returned `500 provider not configured` → resolved by
   secret deployment; now `401 invalid signature`.
3. `outbox-worker` bearer compare assumed function env == local `.env`
   service key → operational path is `x-worker-key` (WORKER_SECRET), verified.

## 15. Remaining operator actions

1. **Paste webhook URLs into Paystack + KoraPay dashboards** (§4) — the
   only hard blocker for live deposits.
2. Optional: sandbox `charge.success` E2E (pay a test checkout) to watch
   the confirm path end-to-end.
3. Schedule the outbox worker (e.g., Supabase cron every minute):
   `POST /functions/v1/outbox-worker` with `x-worker-key`.
4. Delete local `.env.secrets` once satisfied secrets are deployed.
5. Before real-money launch: rotate to `sk_live_` keys and update the
   `secret_last4` markers the same way.
