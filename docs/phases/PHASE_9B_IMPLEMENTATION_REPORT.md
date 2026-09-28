# Phase 9B — Referrals, Rewards & Task Rewards: Implementation Report

Phase 9B implements the Phase 9A architecture end-to-end: durable referral
relationships, server-computed signup + deposit rewards, an auditable reward
ledger layer on top of the double-entry engine, withdrawal provenance with a
deposit-history gate, general task rewards with leg-level verification, and the
admin operations surface for all of it. All financial decisions remain
server-side; clients consume RPC results through the existing data-source
abstraction.

## Scope delivered

- **Durable referrals** — `referrals` row created atomically in
  `handle_new_user` from signup metadata (`referral_code`), with code snapshot,
  self-referral guard, and a `profiles.referred_by` backfill; status flow
  `JOINED → QUALIFIED/CREDITED` (+ `DISQUALIFIED`/`BLOCKED`).
- **Reward engine** — config-driven evaluator (`evaluate_referral`) hooked into
  `confirm_deposit` (deposit reward: % of qualifying confirmed deposits,
  capped, per currency) and `request_investment` (signup reward once the
  referred user has deposited _and_ invested). `admin_resolve_deposit` was
  re-hooked so manual CONFIRM/REFUND paths evaluate/revoke identically.
  Issuance is idempotent via unique indexes + `request_id` replay.
- **Reward provenance** — `reward_grants` carry `face/issued/bonus/released/
reserved/consumed/reversed` counters; `reward_allocations` records every
  movement (`ISSUE/RELEASE/HOLD/HOLD_RETURN/CONSUME/REVERSE/RECOVER`) with the
  source bucket, enabling exact hold-return and clawback math.
- **Ledger integration** — new journal types `REWARD_CREDIT`,
  `BONUS_RELEASE`, `REWARD_REVERSAL`, `REWARD_RECOVERY`; new system account
  kind `REWARD_RECEIVABLE`; `assert_journal_shape` extended so `HOLD` may draw
  `BONUS`/`RELEASED` provenance legs alongside `AVAILABLE`.
- **Withdrawal provenance** — `withdrawals` rows carry
  `reward_amount_minor`/`ordinary_amount_minor`/`hold_bonus_minor`;
  reward-origin funds are exempt from the new
  `withdrawal.requires_deposit_history` gate; ordinary funds are not. Reject/
  fail returns holds to their exact source buckets.
- **Receivables** — reversing already-spent reward value opens a
  `reward_receivables` debt; `reward.debt_offset_on_issue` settles open debt
  from new issuances before crediting bonus.
- **Task rewards** — `reward_tasks` + `task_requirements` + `task_claims` +
  `task_claim_legs` + `user_identities` + event tables; claim RPC with
  eligibility checks, TTL (`reward.claim_ttl_seconds`), ONE_TIME/REPEATABLE
  policies, idempotent replay, and pending-identity-link signaling;
  `settle_task_claim` mints through the shared reward engine.
- **Edge Functions** — `telegram-webhook` (secret-token verified; `/start
<token>` identity linking + `chat_member` passive re-verification) and
  `task-claim-verifier` (worker-key auth; sweeps pending TELEGRAM legs via
  Bot API `getChatMember`, expires stale claims).
- **Reconciliation** — `reconcile_rewards` reports qualifying deposits without
  grants, qualified referrals without signup grants, credited grants without
  journals, counter-vs-allocation drift, unbacked bonus wallets, and orphan
  receivables.

Explicitly out of scope (per 9A): post-signup referral retro-attach,
third-party WhatsApp membership APIs, automated payouts of receivables.

## Migrations, RPCs, functions

| Artifact                                             | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/0022_reward_schema.sql`         | Enums (`referral_status`, `reward_kind`, `reward_grant_status`, `reward_movement`, `receivable_status`, `identity_provider`); `referrals`, `referral_events`, `reward_grants`, `reward_allocations`, `reward_receivables`, `user_identities`, `reward_event_log`; write guards (`app.reward_write`); `handle_new_user` extension + `referred_by` backfill; RLS                                                                                                                                                                                                                                                             |
| `supabase/migrations/0023_ledger_reward_types.sql`   | `journal_type` += `REWARD_CREDIT`/`BONUS_RELEASE`/`REWARD_REVERSAL`/`REWARD_RECOVERY`; `system_account_kind` += `REWARD_RECEIVABLE` (+ NGN/USD accounts); `assert_journal_shape` reward-aware                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `supabase/migrations/0024_reward_engine.sql`         | 13 config seeds incl. per-currency amounts + `referral.share_base_url`; `evaluate_referral`, `issue_reward_grant`, `reverse_reward_grant`, `collect_receivables`, `revoke_deposit_rewards`; hooks in `confirm_deposit`/`refund_deposit`/`admin_resolve_deposit`; investor RPCs `transfer_bonus_to_available`, `get_referral_summary` (server-owned rules/steps/share_url), `list_my_referrals`, `list_my_rewards`; admin RPCs `admin_referral_overview`, `admin_list_referrals`, `admin_list_reward_grants`, `admin_reverse_reward`, `admin_release_blocked_reward`, `admin_reevaluate_referral`, `admin_list_receivables` |
| `supabase/migrations/0025_withdrawal_provenance.sql` | `draw_reward_holds`/`return_reward_holds`/`consume_reward_holds`; `reward_pool` view fn; `has_deposit_history`; provenance-aware `quote_withdrawal`/`request_withdrawal`/`decide_withdrawal`/`request_investment`; `reconcile_rewards`                                                                                                                                                                                                                                                                                                                                                                                     |
| `supabase/migrations/0026_task_schema.sql`           | Task enums; `reward_tasks`/`task_requirements`/`task_claims`/`task_claim_legs`/`task_events`/`task_claim_events`; `claim_task`, `settle_task_claim`, `record_task_leg_result`, `task_check_eligibility`, `list_reward_tasks`, `list_my_task_claims`, `create_identity_link_token`, `consume_identity_link`, `task_legs_pending_verification`, `expire_stale_claims`; admin task + claim-review RPCs                                                                                                                                                                                                                        |
| `supabase/migrations/0027_first_task_seed.sql`       | `join-community` task (DRAFT; ₦500 test value flagged pending product approval) with TELEGRAM_MEMBERSHIP (auto) + WHATSAPP_MEMBERSHIP (manual) legs                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `supabase/functions/telegram-webhook/index.ts`       | Public; `X-Telegram-Bot-Api-Secret-Token` verified; `/start <lnk_…>` → `consume_identity_link`; `chat_member` updates resolve open legs via `record_task_leg_result`                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `supabase/functions/task-claim-verifier/index.ts`    | Worker-key auth (same pattern as `outbox-worker`); `expire_stale_claims` janitor + `task_legs_pending_verification` feed → Telegram `getChatMember` adapter → `record_task_leg_result`; unverifiable legs stay pending, never auto-pass                                                                                                                                                                                                                                                                                                                                                                                    |

## Data-source + type changes

- `packages/types`: `RewardRecord`, `RewardMovement`, `BonusReleaseResult`,
  `RewardTask`/`TaskRequirement`/`TaskClaimRecord`/`TaskClaimResult`,
  `IdentityLink`, `RewardGrantRow`/`RewardReceivableRow`/`AdminRewardTaskRow`/
  `AdminTaskClaimRow`/`ReferralOverview`, referral summary extended with
  `rules`/`qualificationSteps`/`shareUrl`; `InvestorDataSource` +
  `AdminDataSource` interfaces extended.
- `packages/mock-data`: fixtures + full demo implementations (referral
  summary/rules, reward listing, bonus transfer, task list/claim/claims,
  identity links; admin overview/grants/receivables/tasks/claims +
  mutations with idempotency semantics).
- `packages/supabase` investor adapter: all referral/reward/task methods call
  real RPCs when authenticated (mock fallback preserved unauthenticated);
  snake_case wire shapes mapped to domain types; reward/task error codes added
  to the friendly-error map.
- `packages/supabase` admin adapter: overview/referrals/grants/receivables,
  re-evaluate/reverse/release, `reconcile_rewards`, task catalogue CRUD +
  status transitions + requirement management + claim list/review.

## UI changes

- Web: referrals page shows server-owned rules + qualification steps +
  `shareUrl`; new `TaskRewardsCard` lists published tasks with claim status;
  wallet bonus card's "Transfer to available" is wired to
  `transferBonusToAvailable` with idempotency key + disabled-on-zero.
- Mobile: wallet bonus transfer wired (loading + disabled states); referrals
  screen gains a Task rewards section (claim button / pending-links hint /
  status pills) alongside the existing summary/policy/recent cards.
- Admin: `/referrals` rebuilt — overview metrics, referrals tab (re-evaluate),
  reward grants tab (reverse / release-blocked, permission-gated +
  idempotency-keyed with reason capture), receivables tab; new `/tasks` page —
  catalogue list, create/edit dialog with requirement authoring, status
  transitions, claim queue with manual APPROVE/REJECT review; Growth nav gains
  "Task rewards"; status maps extended for all Phase 9 statuses.

## Verification

| Suite                                                    | Result                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| `node scripts/verify-migrations.mjs` (local embedded PG) | **502 passed, 0 failed**                                     |
| `pnpm -r typecheck`                                      | clean across all packages + apps                             |
| `pnpm lint` / `pnpm build`                               | clean; all three Next apps compile                           |
| `node scripts/verify-hosted-p9.mjs`                      | **written, pending** — requires migrations applied to hosted |

The local suite covers: referral attribution + self-referral/duplicate guards,
pending→credited lifecycle, qualifying-deposit boundary math + cap, invest
requirement for signup reward, idempotent re-evaluation, bonus release +
replay idempotency, reward-funded withdrawal hold/return/consume with exact
bucket bookkeeping, deposit-history gate (ordinary funds blocked, reward
exempt), reversal→receivable for spent value, debt-offset on new issuance,
task claim lifecycle (draft hidden, publish gate, claim idempotency,
manual+auto legs, expiry, retry), write guards, and permission denials.

## Hosted rollout — pending operator steps

Hosted apply is intentionally manual this phase (DB password in `.env` is
stale):

1. Apply `supabase/migrations/0022…0027` in order (`node
scripts/migrate.mjs` after refreshing `DATABASE_URL`, or SQL editor).
2. Deploy the two new Edge Functions (`supabase functions deploy
telegram-webhook task-claim-verifier`) and set `TELEGRAM_BOT_TOKEN` +
   `TELEGRAM_WEBHOOK_SECRET` in Edge env; register the webhook via Telegram
   `setWebhook`.
3. Set `telegram.bot_username` + `referral.share_base_url` in `admin_config`.
4. Run `node scripts/verify-hosted-p9.mjs` (plus p6/p7/p8 regression scripts).
5. Ops publishes `join-community` via `admin_set_task_status` after signing off
   on the reward amount (seeded ₦500 is a flagged test value).

## Issues found and fixed during verification

- **`get_referral_summary` enum LIKE** — pattern match on an enum column;
  fixed by casting to text before `LIKE`.
- **`journal_entries.metadata` NOT NULL** — `transfer_bonus_to_available`
  passed `null`; now passes `{}`.
- **Withdrawal hold ordering (real bug)** — `request_withdrawal` wrote
  `reward_allocations` before the `withdrawals` row existed (FK); reordered to
  insert → draw holds → post HOLD journal → update row. `request_investment`
  already ordered correctly.
- **`decide_withdrawal` jsonb append** — `v_lines` initialized as object;
  `||` merged instead of appending on REJECT/FAIL release paths.
- **`settle_task_claim` write guard** — grant insert without
  `app.reward_write`; added.
- **`claim_task` array append** — corrected the `v_pending_links` array op.
- **`admin_list_reward_tasks` aggregate shape** — SQL emitted
  `{total, rewarded, open}`; type/UI expect `{total, pending, rewarded,
rejected}` — aligned.
- **`admin_resolve_deposit` hook gap (real gap)** — manual CONFIRM/REFUND
  bypassed referral evaluation/revocation; redefined in 0024 with the same
  hooks as the webhook path.
- **`transfer_bonus_to_available` double-count on replay** — `post_journal`
  replays idempotently but grant counters still moved; added an early
  request_id return.
- **`referral.share_base_url` seed** — TEXT config values must be
  JSON-quoted (`'"…"'`); a bare URL string fails `::json`.
- **Fixture funding under the new gate** — Phase 8 withdrawal fixtures used
  `admin_post_adjustment` funding; with `withdrawal.requires_deposit_history`
  they now correctly fail, so fixtures fund via real `request_deposit` +
  `confirm_deposit`. This is the intended behavior change (9A §13).

## Security notes

- Every financial decision (reward amounts, qualification, eligibility,
  provenance, deposit-history gate, minimums) is server-side; clients only
  render RPC output. `get_referral_summary` is the single source of rules,
  qualification steps, and the share URL.
- Reward/task tables are write-guarded (`app.reward_write`/`app.task_write`
  GUCs); client-direct inserts are denied even where RLS permits reads.
- Telegram secrets live in Edge env only; webhook authenticity is the
  secret-token header, and identity linking consumes one-time 15-minute
  tokens — a leaked chat id proves nothing.
- Admin mutations are permission-gated (`is_ops_reader` reads; FINANCE/
  SUPER for reward reversal+receivables; OPERATIONS/SUPER for task catalogue;
  KYC/OPS/FINANCE/SUPER for claim review) and audited with request ids.
- Receivables ensure clawbacks never produce negative wallets; reconcile
  detects untracked bonus and counter drift.
