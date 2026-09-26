# Phase 8A — KYC + Manual Withdrawals Architecture Proposal

**Status:** proposal — awaiting approval. No production code, migrations, storage buckets, or UI changes in this phase.
**Repo:** `posh-media/rentbrownv2-vision` @ `main`. Historical repos untouched.
**Business objective:** (A) manual, admin-reviewed KYC (BVN + selfie + proof of address) with a provider seam for future automation; (B) complete the manual withdrawal flow end-to-end — KYC gate, transaction PIN, dynamic minimum, admin queues — on the withdrawal backend that Phase 5B already deployed.

---

## 1. Current-state inspection

Read before designing: `0001_foundation.sql`, `0002_domain_schema.sql`, `0003_domain_rls.sql`, `0004_admin_config_seed.sql`, `0005`–`0007` (ledger), `0008`–`0011` (payments/withdrawals/outbox), `0012`–`0017` (investment + maturity), `docs/phases/*` (all prior reports), `docs/DECISIONS.md`, `packages/types` (investor + admin contracts), `packages/{mock-data,supabase}` data sources, `apps/web` (`/account/kyc`, `/wallet/withdraw`, `PinConfirmDialog`), `apps/admin` (`/kyc`, `/finance/withdrawals`), `supabase/functions/{outbox-worker,maturity-worker}`.

### 1.1 Headline finding: Phase 5B already built the withdrawal backend

The "manual withdrawal" half of Phase 8 is **mostly deployed**. Phase 8B's job is gating and wiring, not new financial machinery:

| Primitive | State |
|---|---|
| `withdrawals` table (id, reference, idempotency_key, user_id, currency, amount/fee/net minor, **destination jsonb snapshot**, status, 3 journal refs, reviewed_by, request_id, 4 timestamps, amount-split CHECK) | ✅ exists (`0008`) |
| `withdrawal_events` append-only log + `apply_withdrawal_transition` governed map | ✅ exists |
| `request_withdrawal` — ACTIVE check, config min, fee bps + cap, HOLD journal, `wd:init:<uid>:<key>` idempotency, transactional `withdrawal.requested` outbox | ✅ exists — **missing KYC + PIN gates** |
| `decide_withdrawal` — REVIEW/APPROVE/REJECT/PROCESSING/MARK_PAID/FAIL, HOLD_RELEASE on reject/fail, EXTERNAL_PAYOUT on paid, audited, FINANCE_ADMIN/SUPER_ADMIN | ✅ exists |
| `outbound_events` + `claim_outbound_batch`/`finish_outbound_attempt` + `outbox-worker` → `withdrawal.webhook.url` (Make) | ✅ exists |
| Withdrawal config: `fee_bps=500`, `fee_cap_minor.NGN=1,000,000`, `fee_cap_minor.USD=1,000`, `min_minor.NGN=500,000`, `webhook.url`, `webhook.enabled` | ✅ seeded |
| RLS: owner + finance read, no client writes, `app.withdrawal_write` guard | ✅ exists |
| Investor/admin TS contracts (`quoteWithdrawal`, `requestWithdrawal`, `decideWithdrawal`, `listKycCases`, `decideKyc`, `PayoutMethod`, `KycSummary`…) | ✅ exist — mock-backed only |
| Admin UI `/kyc`, `/finance/withdrawals`; investor `/account/kyc`, `/wallet/withdraw` + `PinConfirmDialog` | ✅ exist — mock data |

### 1.2 What does not exist

- **No KYC schema at all** — only `profiles.kyc_verified`/`kyc_verified_at` (added in `0002` explicitly as "flipped by the Phase 8 KYC workflow"). No submissions table, events, RPCs, review flow.
- **No Supabase Storage buckets anywhere** — `property_documents.storage_path` is a text reference only. Phase 8 introduces the first bucket.
- **No transaction PIN server-side** — `hasTransactionPin`, `PinConfirmDialog`, `SET_TRANSACTION_PIN` audit kind are contract/mock only. There is no PIN table, hash, or verify RPC. ("Existing secure PIN architecture" = the UI/contract seam; the secure backend must be created.)
- **No KYC/PIN gate in `request_withdrawal`** — currently checks only `account_status='ACTIVE'`, minimum, and balance.
- **No `quote_withdrawal` RPC** — investor contract exists, server function does not.
- **No admin withdrawal list/detail or KYC list/detail/decide RPCs** — admin screens are mock-only; `decide_withdrawal` exists but there's no read RPC set.
- **No saved bank accounts** — `RequestWithdrawalInput.destinationId` + `PayoutMethod[]` exist in the contract; the DB accepts inline `destination` jsonb only.
- **Static minimum** — `withdrawal.min_minor.NGN` is a fixed 500,000; the approved *dynamic* rule (maturity value of one slot in the cheapest published plan) is not implemented.
- `admin_role` enum **already includes `KYC_REVIEWER`** — no RBAC change needed.

## 2. Existing primitives to reuse (do not duplicate)

`post_journal`/`HOLD`/`HOLD_RELEASE`/`EXTERNAL_PAYOUT`/`FEE_REVENUE`/`PAYOUTS_CLEARING`, `apply_withdrawal_transition`, `decide_withdrawal`, `request_withdrawal` (amended, not replaced), `outbound_events` + `outbox-worker` + `rentbrown.outbound.v1`, `admin_config` + `set_admin_config` + `config_number/bool/text`, `audit_log`, `has_admin_role`/`current_admin_role`, `assert_*_write` guard pattern, `assert_immutable`, `touch_updated_at`, `for update skip locked` claim pattern, pgcrypto (already enabled for `crypt` hashing used by earlier phases — verify at implementation), `profiles.kyc_verified` as the sync target.

## 3. KYC architecture

### 3.1 Model: versioned submissions (justified)

One mutable row per user cannot express "rejected → resubmitted → verified" with immutable review history, and cannot hold provider references for a future automated attempt. Proposed: **`kyc_submissions` is append-per-attempt**; each resubmission is a new row (`attempt_no` increments); the prior row transitions to `SUPERSEDED`. A partial unique index guarantees **one live submission per user**:

```sql
create unique index kyc_one_live_per_user
  on public.kyc_submissions (user_id)
  where status <> 'SUPERSEDED';
```

`kyc_events` (append-only) is the review-history trail — same pattern as `investment_events`/`withdrawal_events`.

### 3.2 `kyc_submissions` schema (proposed)

```
id                 uuid pk
user_id            uuid → profiles(id)          -- owner
attempt_no         int                          -- 1,2,3… per user
status             kyc_status                   -- state machine below
full_legal_name    text
gender             kyc_gender                   -- enum MALE | FEMALE
bvn                text                         -- restricted column; masked in all client output
selfie_path        text                         -- storage object ref, never the binary
poa_path           text                         -- storage object ref
poa_type           kyc_poa_type                 -- UTILITY_BILL | ELECTRICITY_BILL | BANK_STATEMENT | OTHER
provider           kyc_provider not null default 'MANUAL'   -- seam, NOT an integration
provider_reference text                         -- future provider ref id
provider_result    jsonb                        -- future provider outcome payload (minimized)
submitted_at       timestamptz
reviewed_by        uuid → auth.users(id)
reviewed_at        timestamptz
review_note        text
rejection_reason   text
request_id         text
created_at/updated_at timestamptz
```

`SUPERSEDED` is a terminal bookkeeping status so the live-row index stays correct. All document columns store **object paths only** — no binaries in Postgres.

### 3.3 KYC state machine (governed by `apply_kyc_transition`)

```
            ┌───────── (resubmit: new row, old → SUPERSEDED) ─────────┐
            │                                                        │
NOT_STARTED → DRAFT → SUBMITTED → UNDER_REVIEW → VERIFIED             │
                       │              │                               │
                       │              └──→ REJECTED ──────────────────┘
                       └── (user may edit DRAFT only; SUBMITTED is locked
                            until reviewed or withdrawn back to DRAFT)
```

- `NOT_STARTED` is virtual (no row). First draft creates attempt 1.
- `UNDER_REVIEW` = an admin has claimed the case (first review action stamps `reviewed_by`, transitions `SUBMITTED→UNDER_REVIEW` idempotently). `SUBMITTED→VERIFIED` direct is also legal for speed.
- `VERIFIED` and `REJECTED` are terminal for that attempt. `REJECTED` unlocks a new draft (attempt n+1); the rejected row is `SUPERSEDED` at resubmit time.
- Once `VERIFIED`, further submissions are blocked (open decision D-8.6: admin-initiated re-verification path).
- All transitions server-side via `apply_kyc_transition` (lock row, validate map, stamp timestamp, append `kyc_events`). Client RPCs can only `save_draft`, `submit`, `withdraw_to_draft`. Verify/reject exist only as admin RPCs.

### 3.4 Profile sync — authoritative source

**`kyc_submissions` is authoritative; `profiles.kyc_verified` is a projection.** The single write path: inside the same transaction as `UNDER_REVIEW→VERIFIED`, `apply_kyc_transition` (or the `admin_decide_kyc` wrapper) sets `profiles.kyc_verified=true`, `kyc_verified_at=now()`. Because verification is terminal per-attempt and new submissions are blocked while verified, the flag can never disagree:

- Rejection can't coexist with verified (REJECTED only reachable pre-verification).
- No submission → flag can never be set (only the transition sets it).
- Editing a verified submission is impossible (no DRAFT path from VERIFIED).

`WITHDRAWAL` checks should read the authoritative `kyc_submissions` (latest VERIFIED attempt exists), not trust `profiles.kyc_verified` — but they're kept consistent by construction; a reconciliation check polices drift (§14).

## 4. KYC storage architecture

- **Bucket:** `kyc-documents`, `public = false` (first bucket in the project).
- **Object naming:** `<user_id>/<submission_id>/<kind>.<ext>` where `kind ∈ {selfie, poa}`. Path embeds owner + attempt → natural isolation and no overwrite ambiguity across attempts.
- **Upload:** client uploads directly with its JWT (Supabase Storage SDK). `storage.objects` RLS: `INSERT/SELECT/UPDATE/DELETE` allowed only where `bucket_id='kyc-documents'` and `name like auth.uid() || '/%'` **and** the named submission is in an editable state (`DRAFT`, or `REJECTED`→new draft). Once `SUBMITTED`, owner writes are denied (immutability of evidence under review); owner read retained.
- **Admin review access:** reviewers never hold service keys and files never get public URLs. A definer helper `is_kyc_reviewer()` (KYC_REVIEWER / FINANCE_ADMIN / SUPER_ADMIN / OPERATIONS_ADMIN read) drives a storage `SELECT` policy on the bucket; admin UI fetches a **short-lived signed URL** via a new `kyc-document-url` Edge Function (user JWT → verify role → service-role `createSignedUrl(path, 60)`). Alternative: `createSignedUrl` via RPC-injected service client — same thing, one seam.
- **BVN privacy:** `bvn` column — `revoke select (bvn)` from `authenticated`; all investor-facing reads return `bvn_masked` (`'***' || right(bvn,4)`); admin review RPC returns full BVN only to reviewer roles. Never written to `audit_log`/`outbound_events`/`payment_provider_events` payloads; outbound payloads carry `submission_id` + reference only.
- **Retention:** documents retained for regulatory audit while the account lives; deletion on account closure/retention window is a Phase 9 operator policy — propose config `kyc.retention_days` placeholder, no auto-purge in 8B.
- **Size/type gates:** enforced at upload policy layer where possible + client hints (`kyc.max_upload_mb`, mime allowlist config) — definer RPC validates extension/size metadata before accepting submission.

## 5. KYC access control

| Actor | Capabilities |
|---|---|
| Investor (anon denied) | `kyc_get_own` summary; `kyc_save_draft` (full name, gender, BVN, poa_type — paths set by storage upload); `kyc_submit`; `kyc_withdraw_to_draft` (from SUBMITTED, before claim); read own status/rejection reason/masked BVN |
| KYC_REVIEWER / FINANCE_ADMIN / SUPER_ADMIN | `admin_list_kyc_cases` (queue filter), `admin_get_kyc_case` (incl. full BVN + signed doc URLs via EF), `admin_decide_kyc` (APPROVE/REJECT + reason, audited) |
| OPERATIONS_ADMIN / SUPPORT | read-only queue/detail (masked BVN) — matches existing read-vs-act split |
| service_role | `apply_kyc_transition`, future provider callbacks |

No `isAdmin` boolean; `has_admin_role` everywhere. All KYC tables: RLS on, owner-read only on non-restricted columns, `app.kyc_write` guard so only definer functions mutate.

## 6. KYC provider seam

`provider` column + `provider_reference`/`provider_result` + `kyc_provider` enum (`'MANUAL'` now; `'SMILE_IDENTITY'` etc. later — **additive enum value, not a redesign**). Phase 8 ships only `MANUAL`: `admin_decide_kyc` writes `provider='MANUAL'`, `provider_result = {method:'MANUAL_REVIEW', reviewer, decided_at}`. A future provider integrates by (a) a service-role `kyc_provider_callback` RPC writing `UNDER_REVIEW→VERIFIED/REJECTED` through the same governed transition, and (b) populating provider fields. Investor-facing `KycStatus` mapping unchanged. **No third-party API, credentials, or contracts are created in Phase 8.**

## 7. Withdrawal architecture — reuse + gaps

### 7.1 Bank destination: snapshot + optional saved accounts

`withdrawals.destination jsonb` is **already an immutable snapshot** — keep it. Add a small `user_bank_accounts` table to satisfy the contract's `PayoutMethod[]` / `destinationId`:

```
user_bank_accounts(id, user_id, bank_name, bank_code, account_number, account_name,
                   is_default, request_id, created_at, archived_at)
```

- RLS: owner CRUD via guarded definer RPCs (`save_bank_account`, `archive_bank_account`, `list` via owner select). `account_number` returned masked outside the owner's own session-scoped detail view.
- `request_withdrawal` accepts `p_bank_account_id` **or** inline `p_destination` (both → resolved bank → **copied into `withdrawals.destination`**). Later bank edits can never rewrite history (§3.4's snapshot principle).

### 7.2 `request_withdrawal` — amended gates (Phase 8 delta)

Existing flow preserved; three additions, all server-side:

```
auth → account_status='ACTIVE'
     → kyc gate: exists kyc_submissions VERIFIED (non-superseded)   ← NEW
     → verify_transaction_pin(p_pin)  (lockout-aware)              ← NEW
     → amount valid ≥ min_withdrawal_minor(currency)               ← dynamic NEW
     → fee = floor(amt * withdrawal.fee_bps / 10000), cap fee_cap_minor.<cur>
     → net = amt − fee   (all bigint minor units)
     → HOLD journal (RESERVED) → withdrawals insert → event → outbox → commit
```

Idempotency unchanged (`wd:init:<uid>:<key>`); the existing duplicate-hold release path stays. Failed PIN does **not** burn the idempotency key (validation precedes the insert; the hold isn't posted).

### 7.3 Dynamic minimum (approved rule)

`min_withdrawal_minor(p_currency)` definer function:

```
mode = config_text('withdrawal.min_mode')            -- 'DYNAMIC' (default) | 'FIXED'
DYNAMIC → min over published plans: floor(slot_price_minor * (10000 + roi_bps) / 10000)
          (maturity value of ONE slot, cheapest published plan)
FIXED/fallback/no-plans → config_number('withdrawal.min_minor.<cur>')
```

`withdrawal.min_minor.NGN` stays as the fixed-mode value **and** a sanity floor isn't invented — open decision D-8.4 on whether DYNAMIC may drift below it. `quote_withdrawal` returns the same server-computed min/fee/net/eligible/blockedReason so the UI never computes money.

### 7.4 Admin read RPCs (fill the mock gap)

`admin_list_withdrawals(status filter, page)` and `admin_get_withdrawal(id)` — finance + support read per existing `finance.read`/`finance.review_withdrawals` permission split; joins profile display name + kyc status + journal refs + delivery status (join `outbound_events` by idempotency key). `decide_withdrawal` reused verbatim.

### 7.5 Additional outbox events (proposed)

`withdrawal.requested` exists. Propose transactional `withdrawal.completed` and `withdrawal.rejected` inside `decide_withdrawal` (MARK_PAID / REJECT branches) so the Make→Telegram flow notifies outcomes too — open decision D-8.9 (Phase 5A only promised `requested`).

## 8. Transaction PIN architecture (new — fill the missing backend)

```
user_pins(
  user_id         uuid pk → auth.users(id),
  pin_hash        text not null,          -- crypt(pin, gen_salt('bf')) — bcrypt via pgcrypto
  failed_attempts int  not null default 0,
  locked_until    timestamptz,
  pin_set_at      timestamptz not null,
  updated_at      timestamptz
)
```

- **No SELECT grant to `authenticated` at all** — the hash column is unreadable by any client role; all interaction through definer RPCs.
- `set_transaction_pin(p_pin)` — authenticated; validates exactly 6 digits; stores `crypt()` hash; resets counters; audit `SET_TRANSACTION_PIN`. (First-set requires authenticated session only; **change** requires current PIN — open decision D-8.8 on lost-PIN recovery flow.)
- `verify_transaction_pin(p_pin)` — definer, called internally by `request_withdrawal`: lock check (`locked_until`), `crypt(p_pin, pin_hash) = pin_hash`, on failure `failed_attempts+1` and lock after `security.pin.max_attempts` (default 5) for `security.pin.lockout_minutes` (default 15); on success reset counter. Returns bool — never the hash.
- Constant-shape errors (`ERR_PIN`) that don't reveal lock vs. mismatch beyond the contract.
- Phase 8 wires PIN into **withdrawals only**; checkout PIN (`PinConfirmDialog` on invest) stays contract-ready — open decision whether to also gate `request_investment` now (D-8.7).

## 9. KYC→withdrawal gate

`request_withdrawal` requires a VERIFIED live submission. KYC does **not** gate deposits, investments, maturity settlement, or rewards (D-7.13 preserved — settlement credits regardless). `WalletSummary.policies.kycRequiredForWithdrawal` is already in the contract — server fills it from `kyc.required_for_withdrawal` config (default true, kill-switch). Quote surfaces `blockedReason: "Complete identity verification to withdraw."`

## 10. Make.com outbox flow

Unchanged by design: `request_withdrawal` inserts `withdrawal.requested` in-transaction → `outbox-worker` delivers to `withdrawal.webhook.url` (`https://hook.eu2.make.com/…`, already seeded) with `rentbrown.outbound.v1` envelope → bounded backoff → DEAD. Delivery failure never touches financial state. `withdrawal.webhook.enabled` is the kill-switch. If the new `completed`/`rejected` events are approved they ride the same pipe — no second mechanism, no client→Make calls.

## 11. Admin workflow (minimum)

**KYC** (`/kyc` exists, mock → real): queue list w/ status filter → detail (user, submitted data, masked→full BVN for reviewer roles, signed-URL selfie/POA viewers, checks panel, audit trail) → APPROVE / REJECT(+reason) via `admin_decide_kyc`. New: `kyc.read`/`kyc.review` permission wiring already in `admin.ts` role map (KYC_REVIEWER role exists).

**Withdrawals** (`/finance/withdrawals` exists, mock → real): queue w/ status filters → detail (user, amounts, fee/net, currency, bank snapshot, kyc status, timeline, journal refs, outbound delivery status) → REVIEW / APPROVE / PROCESSING / MARK_PAID / REJECT(+reason) — all via existing `decide_withdrawal`. No redesign.

## 12. Investor workflow (minimum)

**KYC** (`/account/kyc` exists): status panel → form (legal name, gender, BVN) → selfie upload → POA type + upload → submit → PENDING_REVIEW → VERIFIED / REJECTED(+reason, resubmit CTA). Entry from Security page (`SET_TRANSACTION_PIN` prompt + new `set_pin` flow).

**Withdrawal** (`/wallet/withdraw` exists): quote panel (available, min, fee, net — from `quote_withdrawal`) → bank select/new → amount → `PinInput` confirm → submit → history list + detail w/ status timeline + rejection reason.

## 13. Audit model

- `kyc_events`: every transition w/ source (USER/ADMIN/SYSTEM/PROVIDER), request_id, note — covers submission, resubmission, verify, reject.
- `admin_decide_kyc` + `decide_withdrawal` + bank-account RPCs + `set_transaction_pin` → `audit_log` rows (actor, role, action, entity, request_id, metadata minus secrets/BVN/doc contents).
- `withdrawal_events` already covers request/review/approve/process/paid/reject/fail.
- `metadata` payload rule: identifiers and reasons only — never BVN, PIN, document paths' contents, or storage credentials.

## 14. Reconciliation model

Extend `reconcile_investments`-style pattern with **`reconcile_withdrawals()`** + **`reconcile_kyc()`** (finance read-only, non-mutating):

Withdrawals: `requested_without_hold`, `orphan_hold` (RESERVED journal w/o live withdrawal), `completed_without_payout`, `rejected_with_unreleased_hold`, `duplicate_settlement` (>1 payout journal), `amount_split_mismatch`, `fee_over_cap`, `settlement_currency_mismatch`, `missing_outbox_event`, `stuck_processing` (> config age).

KYC: `profile_flag_without_verified_submission`, `verified_submission_flag_unset`, `multiple_live_submissions` (index canary), `verified_missing_reviewer`, `orphan_storage_object` (best-effort listing vs. paths), `under_review_stale`.

## 15. Security & privacy model

Definer RPCs + `SET search_path=''` + narrow grants + RLS + `app.kyc_write`/`app.withdrawal_write` guards; PIN bcrypt-hashed, lockout, never selectable; BVN restricted-column + masking; private bucket + signed URLs only; no client writes to any KYC/withdrawal table; no secrets/BVN/doc data in logs/outbox/audit; service keys never exposed; existing RBAC reused.

## 16. Migration plan (forward-only)

| # | Name | Contents |
|---|---|---|
| `0018` | `kyc_schema.sql` | `kyc_status`/`kyc_gender`/`kyc_poa_type`/`kyc_provider` enums; `kyc_submissions` + `kyc_events`; guards; `apply_kyc_transition`; investor RPCs (`kyc_get_own`, `kyc_save_draft`, `kyc_submit`, `kyc_withdraw_to_draft`); profile-flag sync; RLS + column grants; `kyc-documents` bucket + storage policies; config seeds (`kyc.*`, `security.pin.*`); `user_pins` + `set_transaction_pin` + `verify_transaction_pin` |
| `0019` | `withdrawal_gates.sql` | `user_bank_accounts` + owner RPCs; `min_withdrawal_minor`; `quote_withdrawal`; amend `request_withdrawal` (KYC+PIN gates, `p_bank_account_id`); optional `withdrawal.completed`/`.rejected` outbox branches in `decide_withdrawal`; `withdrawal.min_mode` seed |
| `0020` | `kyc_withdrawal_admin.sql` | `admin_list_kyc_cases`, `admin_get_kyc_case`, `admin_decide_kyc`; `admin_list_withdrawals`, `admin_get_withdrawal`; `reconcile_withdrawals`, `reconcile_kyc` |

Edge Functions: `kyc-document-url` (signed-url minting, role-checked). No new ledger journal types, no new system accounts, no worker changes.

## 17. Verification plan

**Local (`verify-migrations.mjs` extension):** anon denial; ownership isolation; draft→submit→verify/reject→resubmit lifecycle; self-verify impossible; locked edits post-submit; profile-flag sync both directions; PIN set/verify/lockout; KYC-gate blocks withdrawal; PIN-gate blocks withdrawal; min (fixed + dynamic) boundary; fee 5% + ₦10k cap; insufficient balance; atomic hold+insert (no partial on failure); idempotent retry; concurrent `request_withdrawal` double-spend proof; admin decide paid→EXTERNAL_PAYOUT legs; reject→HOLD_RELEASE; all reconciliation checks fire correctly; outbox rows written transactionally.

**Hosted (`verify-hosted-p8.mjs`, real JWTs):** same gates against live Supabase; signed-URL access (owner ok, other user denied, reviewer ok); storage RLS (write to another user's prefix denied); `withdrawal.requested` outbox row durable; Make-delivery failure ≠ financial change; Phase 6 + Phase 7 suites rerun green. Test fixtures: audited `admin_post_adjustment` funding only; labeled `P8T-*` rows; controlled cleanup.

## 18. Phase boundary — NOT in Phase 8

Smile Identity or any third-party KYC API; automated verification; FX; USD catalogue; automated payout providers; crypto withdrawals; automatic bank payouts; new Telegram platform; push/email; referral rewards; investor notification center; unrelated redesigns. Make→Telegram remains the notification path.

## 19. Risks & open decisions (approval needed)

- **D-8.1** Versioned `kyc_submissions` + `SUPERSEDED` (vs. single mutable row) — recommended for auditability/provider seam.
- **D-8.2** `UNDER_REVIEW` claim step retained (queue ownership) — recommended.
- **D-8.3** BVN restricted-column + masked default (vs. `pgcrypto` envelope encryption) — recommend restricted column now, encryption evaluable later without schema change.
- **D-8.4** `withdrawal.min_mode = DYNAMIC` default; whether dynamic min may fall below `withdrawal.min_minor.NGN` (recommend: dynamic wins, static is FIXED mode + empty-catalogue fallback).
- **D-8.5** Saved `user_bank_accounts` table added (contract parity) vs. inline-only destination — recommend table; snapshot still authoritative.
- **D-8.6** VERIFIED is terminal; re-verification requires admin reset (propose deferring re-KYC flow to Phase 9 ops tooling).
- **D-8.7** PIN gates **withdrawals only** in 8B (invest checkout PIN deferred, contract stays ready).
- **D-8.8** Lost-PIN recovery deferred (admin reset path, Phase 9) — 8B ships set/verify/lockout.
- **D-8.9** Add `withdrawal.completed` + `withdrawal.rejected` outbox events (in addition to `requested`) for Make/Telegram outcome notifications.
- **D-8.10** Migration split `0018`/`0019`/`0020` + `kyc-document-url` Edge Function; new enums confined to KYC domain; zero new journal types/system accounts.
- **D-8.11** KYC document retention: no auto-purge in 8B; `kyc.retention_days` config placeholder for Phase 9 policy.

## 20. Deliverables map (post-approval)

`0018`–`0020`, `kyc-document-url` EF, investor data-source wiring (`getKyc` real, submit/upload, `quoteWithdrawal`, `requestWithdrawal`, withdrawals list/detail, bank accounts, set-PIN), admin data-source wiring (KYC cases + decide, withdrawals list/detail + existing `decide_withdrawal`), minimal screen wiring on existing pages, verifier extensions, `PHASE_8B_IMPLEMENTATION_REPORT.md`, `DECISIONS.md` D-008.
