# Bachs Payment Integration — Implementation & Readiness Report

Date: 2025-XX (see commit). Scope: Bachs hosted-checkout integration for USD deposits (card +
crypto corridors), regression verification, and project readiness audit. No other phases started.

## 1. Summary

- Added `BACHS` to `public.payment_provider` (`0028`), made `request_deposit`/`deposit_options`
  currency-aware (`0029`): Bachs → USD only; Paystack/KoraPay → NGN only.
- `initialize-deposit` Edge Function creates a Bachs hosted checkout session server-side;
  `payment-webhook-bachs` verifies the HMAC signature, ingests events idempotently, verifies the
  charge server-side, then routes through the existing `confirm_deposit` / `refund_deposit` RPCs —
  ledger, referral qualification, and clawbacks reuse the proven Phase 4–9 machinery.
- Investor web + mobile deposit UIs surface the USD/Bachs corridor with a card/crypto choice;
  admin payments page identifies the provider.
- Local embedded-Postgres regression suite: **516 passed, 0 failed**.
- **Real sandbox API tests are BLOCKED**: `BACHS_API_KEY` is not present in the local `.env`.
  `scripts/verify-bachs.mjs` is ready and fails safely (exit 2) until the key is configured.

## 2. Bachs documentation findings (docs.bachs.io)

| Area | Finding |
|---|---|
| SDK | `@bachs/sdk` v2, Node ≥22. A typed `fetch` adapter was used instead — the Edge Functions are Deno and the API surface needed is small (checkout create, charge get, refund create). |
| Auth | `Authorization: Bearer sk_…`. `sk_sandbox_*` → `https://sandbox-api.bachs.io`; `sk_live_*` → `https://api.bachs.io`. Environments isolated; key prefix selects them. |
| Checkout | `POST /v1/checkout-sessions` with `pricing {amount: decimal string, currency}` or `product_cart`; returns `checkout_url` (hosted) + `checkout_id`. Supports `reference`, `metadata`, `payment_method_types`, success/cancel URLs. |
| Corridors | `USD_CARD`, `NGN_CARD`, `NGN_BANK_TRANSFER`, `MOMO_*` (GHS/KES/TZS/UGX/XAF/XOF/RWF/MWK/ZMW), `CRYPTO`. Account-dependent. |
| Crypto | USDT (TRC20/ERC20/BEP20/SOL), USDC (BEP20), BTC, ETH, SOL, BNB — availability depends on merchant account. Customer pays crypto; settlement is to USD/NGN balance. No custody/withdrawal API used or needed. |
| Settlement | Balances in USD/NGN; provider-reported `settlement_amount`/`settlement_currency` are authoritative. |
| Webhooks | Signed, raw-body HMAC; events include `checkout.completed/expired`, `collection.succeeded/failed/underpaid`, `refund.created/paid/failed`. Event IDs deduplicated via existing `ingest_provider_event`. |
| Refunds | `POST /v1/refunds`, one refund per charge, idempotent merchant reference, async (`refund.paid`/`refund.failed` webhooks). Crypto refunds require `refund_address` — flagged as an operational exception path. |

## 3. Implementation

- Migrations: `0028_bachs_provider_enum.sql` (enum + 6 config keys, seeded inactive),
  `0029_bachs_deposit_rpc.sql` (currency-aware `request_deposit`, extended `deposit_options`).
- Edge Functions: `supabase/functions/initialize-deposit` (Bachs branch — key-prefix→base-URL,
  decimal-string boundary, `chk_…` provider reference); `supabase/functions/payment-webhook-bachs`
  (raw-body signature verify → durable ingest → charge re-fetch → confirm/review/refund).
- Types/data: `PaymentProvider` + `DepositMethod` unions extended; `DepositIntent.provider` added;
  supabase + mock data sources expose server-configured USD options.
- UI: web deposit page (USD amount input, card/crypto corridor select, provider-aware detail page);
  mobile deposit detail; admin payments page provider labels.
- Env vars (names only): `BACHS_API_KEY`, `BACHS_WEBHOOK_SECRET`, `BACHS_SUCCESS_URL`,
  `BACHS_CANCEL_URL` (optional).
- Safety: unknown key prefix → sandbox base URL; missing key → config error; refund events resolve
  the deposit via `charge_id` since refund payloads carry the refund reference.

## 4. Verification

- `node scripts/verify-migrations.mjs` — **516/516** incl. Bachs: disabled-by-default, USD-only
  enforcement, NGN rails reject USD, min-deposit policy, init→confirm→USD-wallet-credit, refund
  reversal, idempotent re-confirm.
- `node scripts/verify-bachs.mjs` — BLOCKED, `BACHS_API_KEY` not configured (exit 2, safe).
- `pnpm -r typecheck`, `pnpm lint`, `pnpm build` (web/admin/site): PASS.
- `pnpm format:check`: FAIL repo-wide — 330 pre-existing violations incl. files untouched by this
  change (`turbo.json`, all Edge Functions). All files touched here pass Prettier individually.
- `pnpm test`: no package-level test tasks; suite lives in `verify-migrations.mjs`.

## 5. Sandbox test matrix status

| Scenario | Status |
|---|---|
| Checkout create, USD card success/fail, crypto corridors, real webhook delivery, live signature verify, live refund | BLOCKED — needs `BACHS_API_KEY` + `BACHS_WEBHOOK_SECRET`, function deploy, webhook registration |
| Disabled provider / wrong currency / min-deposit / confirm / refund reversal / idempotent re-confirm / bigint amounts | PASS (local embedded Postgres) |
| Invalid signature rejection | Implemented; unit-covered by construct; live delivery pending |

## 6. Remaining work

**Before local E2E:** add `BACHS_API_KEY` to `.env`; run `node scripts/verify-bachs.mjs`.
**Before deployed sandbox:** apply 0028/0029 to hosted DB (current `DATABASE_URL` stale — 28P01);
deploy `initialize-deposit` + `payment-webhook-bachs`; set `BACHS_API_KEY`/`BACHS_WEBHOOK_SECRET`
as function secrets; register the webhook URL in the Bachs dashboard; enable `payment.bachs.*`
config keys.
**Before production:** live key, live webhook secret + endpoint, Bachs settlement-currency
confirmation, crypto-refund `refund_address` ops path, real-money reconciliation runbook.
