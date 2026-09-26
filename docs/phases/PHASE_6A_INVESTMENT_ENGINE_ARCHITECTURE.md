# PHASE 6A — Investment Engine Architecture & Proposal

**Status:** PROPOSED — awaiting approval before Phase 6B implementation.
**Scope rule:** architecture only. No migrations, schema changes, Edge
Functions, seeds, or production behavior changes ship in this phase.
**Companion docs:** `PHASE_3A_SCHEMA_PROPOSAL.md`, `PHASE_4A_LEDGER_WALLET_PROPOSAL.md`,
`PHASE_5A_DEPOSIT_PAYMENT_ARCHITECTURE.md`, `docs/DECISIONS.md` (D-001..D-005).

---

## 1. Executive summary

Phase 6 adds the **wallet-funded investment purchase path**:

```
wallet AVAILABLE (NGN)
  → request_investment(round_id, slots, idempotency_key)   [authenticated RPC]
      → validate session/account/plan/round/slots/funds/currency
      → atomic conditional UPDATE on investment_rounds (capacity)
      → HOLD journal        (AVAILABLE → RESERVED)
      → INVESTMENT_DEBIT    (RESERVED → INVESTMENT_PRINCIPAL_PAYABLE)
      → insert investments row (full economic snapshot, ACTIVE)
      → insert investment_events (CREATED, PAYMENT_CONFIRMED, ACTIVATED)
      → commit — all-or-nothing
```

**The headline finding: the foundation is already built.** Phase 3B shipped
the full hierarchy (`properties → investment_plans → investment_rounds →
investments → investment_events`) with snapshot columns, the capacity
invariant `check`, the exact conditional-update pattern Phase 3A prescribed,
and all enums Phase 6 needs. Phase 4 shipped `INVESTMENT_DEBIT` —
`user:reserved → system:investment_principal_payable` — plus
`INVESTMENT_PRINCIPAL_PAYABLE`/`INVESTMENT_PROFIT_PAYABLE` system accounts
already seeded in NGN and USD. Phase 5 established the RPC conventions
(`auth.uid()` gate, `account_status` check, `ERR_*` typed errors, scoped
idempotency keys, write-guard flags, request_id audit threading).

**Phase 6 therefore needs: 3 migrations, 1 new RPC path, 0 new journal types,
0 new Edge Functions, 0 new tables for the core flow.** The only new columns
proposed are `investments.idempotency_key` (retry dedup) and a `seed_tag`
marker on the three catalogue tables (test-data lifecycle, §18).

Funding scope for Phase 6 is **WALLET only** — `BANK_TRANSFER`/`CARD` remain
in the `funding_source` enum and the `FundingSource` wire type, but the
server rejects them with a typed error until a later phase wires them to
the payment infrastructure (see §23, open decision D-6.4).

---

## 2. Current-state inspection

### Sources inspected

| Area | Evidence |
|---|---|
| Master brief | `RENT_BROWN_MASTER_CONTEXT_AND_MEGA_AUDIT.md` — atomic reservation sequence, ROI = full-term fixed return, counters over per-slot rows, UTC instants, durable scheduler deferred to settlement phase |
| Phase 3 schema | `0002_domain_schema.sql`, `0003_domain_rls.sql`, `0004_admin_config_seed.sql` |
| Phase 4 ledger | `0005_ledger_schema.sql`, `0006_ledger_rls.sql`, `0007_system_accounts_seed.sql` |
| Phase 5 payments | `0008–0011`, `supabase/functions/*` |
| Investor UI | `explore`, `opportunities/[slug]`, `checkout/[roundId]`, `payment/[reference]`, `portfolio`, `portfolio/[id]` — all consume `InvestorDataSource` via `apps/web/src/lib/data/hooks.ts`; mobile uses the identical interface (`apps/mobile/src/data/hooks.ts`) |
| Shared types | `packages/types/src/index.ts` — `Opportunity`, `InvestmentQuote`, `SubmitInvestmentInput`, `Investment`, `FundingSource` |
| Mock data | `packages/mock-data/src/fixtures/catalogue.ts` + `investor.ts`, `mock-data-source.ts`, `opportunities.ts`, `public-catalogue.ts` |
| Admin UI | `(ops)/properties|plans|rounds|investments` pages — present, mock-backed via `AdminDataSource` |
| Decisions | `docs/DECISIONS.md` D-001..D-005 |
| Git | `3419b1b` (P4B), `495abf4` (P5B), `4db2f1c` (P5B verification) |

### What already exists vs what Phase 6 adds

| Concern | Exists today | Phase 6 adds |
|---|---|---|
| Hierarchy tables | ✅ all five, with FK RESTRICT | — |
| Investment snapshots | ✅ all economics + `check` invariants | `idempotency_key` column |
| Capacity counters | ✅ `total/allocated/reserved` + `capacity_invariant` | conditional UPDATE inside RPC |
| Investment status enum | ✅ all 8 states incl. REVIEW_REQUIRED | transition map (RPC-level) |
| Event enum | ✅ CREATED…SETTLED | writes inside RPC |
| Journal type | ✅ `INVESTMENT_DEBIT` = RESERVED→IPP | call via `post_journal` |
| System accounts | ✅ IPP/INVESTMENT_PROFIT_PAYABLE seeded NGN+USD | — |
| RLS read policies | ✅ investor-own + admin reads | — |
| Write guards | ❌ investment tables unguarded (no write path existed) | `app.investment_write` guards |
| Investor RPC | ❌ | `request_investment`, `investment_quote`, `list_open_opportunities` |
| Idempotency on investments | ❌ (events have `request_id` only) | `idempotency_key` unique |
| Admin read RPCs | ❌ (pages mock-backed) | `admin_list_investments`, `admin_investment_detail`, `reconcile_investments` |
| Seed/test-data marker | ❌ | `seed_tag` (§18) |
| Real investor data path | deposits only; everything else mock-delegated | opportunities + quote + submit + portfolio |

---

## 3. Existing schema assessment

### `properties` — the asset
Immutable-ish catalogue row: `slug citext unique`, `property_type`,
`summary`, `description`, `location_label`, `images text[]`,
`operator_name/description`, `highlights text[]`, `revenue_model`,
`publication_status` (`DRAFT|IN_REVIEW|PUBLISHED|ARCHIVED`).
`address` and `created_by` are column-grant-hidden from clients.
**Fits Phase 6 unchanged.** Maps 1:1 to the mock `Property` shape.

### `investment_plans` — the economic terms
`slot_price_minor`, `roi_bps`, `duration_hours`, `currency`,
`min_slots`, `max_slots_per_user`, `investment_fee_bps`,
`eligibility jsonb`, `terms text[]`, `risk_disclosures text[]`,
`status` (`DRAFT|PUBLISHED|PAUSED|ARCHIVED`).
Checks already enforce: positive price, non-negative ROI, positive
duration, `max_slots_per_user >= min_slots`.
**Fits Phase 6 unchanged.** Mock-only gap: plans carry `description` in DB
but the mock `InvestmentPlan` wire type lacks it — seed can populate it;
wire type unchanged.

### `investment_rounds` — finite capacity
`total_slots`, `allocated_slots`, `reserved_slots`,
`slot_price_minor` (snapshot at open), `currency`,
`opens_at`/`closes_at`, `projected_start_at`/`projected_maturity_at`,
`opened_at`/`closed_at`/`settled_at`,
`status` (`SCHEDULED|OPEN|NEARING_CAPACITY|SOLD_OUT|CLOSED|SETTLED`).
**Fits Phase 6 unchanged.** `capacity_invariant` is the backstop; the
conditional UPDATE is the mechanism (§8).

### `investments` — the user contract
Every economic field is already a creation-time snapshot:
`slots`, `slot_price_minor`, `currency`, `principal_minor`
(`check = slots × slot_price_minor`), `roi_bps`, `duration_hours`,
`expected_profit_minor` (`>= 0`), `maturity_value_minor`
(`check = principal + expected_profit`), `status`, `activated_at`,
`matures_at`, `completed_at`, `payment_reference`, unique `reference`,
denormalized `round_id`/`plan_id`/`property_id` FKs (RESTRICT).

**Gaps Phase 6 adds:**
- `idempotency_key text not null unique` — retry dedup (§12).
- No `funding_source`-conditional behavior needed — enum already has
  `WALLET|BANK_TRANSFER|CARD`.
- `payment_reference` (text, nullable) can carry the funding journal
  reference for traceability — no new column needed.

### `investment_events` — append-only history
`investment_id`, `event_type`, `actor_id`, `actor_kind`
(`INVESTOR|ADMIN|SYSTEM`), `request_id`, `metadata`.
**Fits Phase 6 unchanged** — `request_id` dedupes retried submissions
(Phase 3A intent).

### Write-safety gap
Phase 3 tables have **no write-guard triggers** (Phase 3 had no write
paths; Phase 5 added `app.deposit_write`/`app.outbound_write`-style guards
only on its own tables). Phase 6 adds the same guard pattern:
`assert_investment_write()` on `investments`, `investment_events`, and a
counter-guard on `investment_rounds` (status/counter columns may only
change inside the RPC flag).

---

## 4. Investment lifecycle (Phase 6 scope)

```
            request_investment(round, slots, key)
                      │
            ┌─────────▼─────────┐
            │  validations fail │──→ typed ERR_* exception, txn rolls back,
            └───────────────────┘    nothing persisted
                      │ all pass
        ┌─────────────▼──────────────┐
        │ single database transaction │
        │  capacity += slots          │
        │  HOLD + INVESTMENT_DEBIT    │
        │  investment ACTIVE          │
        │  3 events (CREATED,         │
        │   PAYMENT_CONFIRMED,        │
        │   ACTIVATED)                │
        └─────────────┬──────────────┘
                      ▼
                 ACTIVE  — terminal for Phase 6
```

`PAYMENT_PENDING` exists in the enum but is **not entered** by the wallet
flow: funding is synchronous inside one transaction, so the investment is
born `ACTIVE` with `activated_at = now()` and
`matures_at = activated_at + duration_hours * interval '1 hour'`.
PAYMENT_PENDING remains for the future external-funding path (§21).

`MATURITY_DUE`, `SETTLING`, `COMPLETED`, `REFUNDED` are Phase 7+ states —
never entered in Phase 6. `FAILED` is reachable only via a post-commit
admin/system resolution path (§16) — a wallet-funded purchase either
commits fully or does not exist, so there is no in-RPC failure state.

---

## 5. Investment state machine

```
Phase 6 uses:        PAYMENT_PENDING ──(future external funding)──┐
                     ACTIVE  ←── wallet-funded commit (only entry)│
                     REVIEW_REQUIRED  (admin resolution target)   │
                     FAILED / REFUNDED / COMPLETED / MATURITY_DUE /│
                     SETTLING — Phase 7+ only                      │
```

| From | To | Actor | Phase |
|---|---|---|---|
| — | ACTIVE | `request_investment` (INVESTOR-initiated, server-executed) | 6 |
| ACTIVE | MATURITY_DUE | maturity sweep | 7 |
| ACTIVE | REVIEW_REQUIRED | admin/system | 6+ (seam only) |
| PAYMENT_PENDING | ACTIVE | external-funding confirm | future |
| PAYMENT_PENDING | FAILED/EXPIRED-equiv | funding timeout | future |

A `apply_investment_transition()` map mirrors the Phase 5 pattern
(`apply_deposit_transition`/`apply_withdrawal_transition`): a lookup table
of legal (from,to) pairs + actor-kind gate, so Phase 7 inherits a governed
seam instead of raw UPDATEs.

---

## 6. Investment creation transaction

Exact ordering inside `request_investment` (SECURITY DEFINER, granted to
`authenticated`):

```sql
begin
  v_uid := auth.uid();                                    -- 401 if null
  -- profile read (no lock): account_status + email_verified
  select … into v_prof from profiles where id = v_uid;
  assert v_prof.account_status = 'ACTIVE';
  assert v_prof.email_verified;                          -- Phase 3A gate

  -- idempotency: scoped key 'inv:create:<uid>:<key>'
  select * into v_existing from investments
   where idempotency_key = v_key;
  if found then
    if v_existing.round_id = p_round_id
       and v_existing.slots = p_slots then return v_existing;   -- replay
    else raise 'ERR_IDEMPOTENCY_CONFLICT'; end if;              -- key reused, different params
  end if;

  -- capacity FIRST: one atomic conditional UPDATE locks the round row
  update investment_rounds
     set allocated_slots = allocated_slots + p_slots,
         status = case
                    when allocated_slots + reserved_slots + p_slots >= total_slots
                    then 'SOLD_OUT' else status end,
         closed_at = case … same condition … then now() end
   where id = p_round_id
     and status = 'OPEN'
     and opens_at <= now() and closes_at > now()
     and allocated_slots + reserved_slots + p_slots <= total_slots
  returning * into v_round;
  if not found then
    -- deterministic disambiguation (no info leak beyond typed reason)
    select status into v_st from investment_rounds where id = p_round_id;
    if not found then raise 'ERR_ROUND_NOT_FOUND';
    elsif v_st <> 'OPEN' then raise 'ERR_ROUND_NOT_OPEN';
    else raise 'ERR_ROUND_CAPACITY_EXCEEDED'; end if;
  end if;

  -- hierarchy + economics reads (round row now locked → consistent)
  select plan into v_plan … where id = v_round.plan_id;
  select property into v_prop … where id = v_plan.property_id;
  assert v_plan.status = 'PUBLISHED' and v_prop.publication_status = 'PUBLISHED';
  assert slots >= v_plan.min_slots
     and slots <= coalesce(v_plan.max_slots_per_user, infinity)
     and (slots + existing_user_slots_in_round <= max_slots_per_user);
  assert v_round.currency = 'NGN'                        -- wallet currency
     and v_round.slot_price_minor = v_plan.slot_price_minor; -- round snapshot check

  -- authoritative economics (integer only)
  v_principal := p_slots::bigint * v_round.slot_price_minor;
  v_profit    := (v_principal * v_plan.roi_bps) / 10000;  -- bigint floor
  v_fee       := (v_principal * v_plan.investment_fee_bps) / 10000;
  v_total     := v_principal + v_fee;

  -- wallet serialization happens inside post_journal (FOR UPDATE on
  -- the (user,currency) row); insufficient funds raise INSUFFICIENT_FUNDS
  perform set_config('app.investment_write','1',true);

  insert into investments (…, status 'ACTIVE', funding_source 'WALLET',
    activated_at now(), matures_at now() + duration_hours * interval '1 hour',
    payment_reference := <funding journal reference>) returning * into v_inv;

  post_journal('HOLD', currency,
    [{user:uid:available DR}, {user:uid:reserved CR} amount v_total],
    idempotency 'inv:hold:'||v_inv.id, entity 'investment', entity_id v_inv.id, …);

  post_journal('INVESTMENT_DEBIT', currency,
    [{user:uid:reserved DR}, {system:investment_principal_payable CR} amount v_total],
    idempotency 'inv:fund:'||v_inv.id, entity 'investment', entity_id v_inv.id, …);

  insert investment_events: CREATED (INVESTOR), PAYMENT_CONFIRMED (SYSTEM),
    ACTIVATED (SYSTEM) — all carrying p_request_id;
commit
```

### Ordering rationale & deadlock analysis

- **Round row is locked first** via the conditional UPDATE. Every competing
  purchase of the same round serializes on that single row — the classic
  "one slot left, two buyers" race resolves to winner/typed-error with zero
  oversell possibility (`capacity_invariant` is the constraint backstop).
- **Wallet row lock happens inside `post_journal`** (Phase 4 already locks
  `(user,currency)` FOR UPDATE). A user's wallet row is private to them —
  two different users can never contend on it, so the only shared lock is
  the round row, acquired first and in one place. **Lock order is
  therefore total: round → own wallet. No cycle is possible** — deadlock
  requires ≥2 shared resources locked in different orders.
- Reads of plan/property happen *after* the round lock so the round's
  snapshot (`slot_price_minor`, `currency`) and the plan's economics are
  read under a consistent point-in-time within the same serializing
  transaction.
- **Whole flow is one transaction**: any failure (validation, journal
  balance check, shape check, insufficient funds at the wallet lock)
  rolls back *everything* — the capacity increment included. There is no
  partial state, no orphan investment, no leaked slot.

### Why `allocated_slots` directly, not `reserved_slots`

Phase 3A's `reserved_slots` was designed for *in-flight checkouts* — the
async external-funding window (bank transfer pending, card confirming).
The wallet-funded path has no async window: the entire purchase is one
committed transaction. Incrementing `allocated` directly is simpler and
leaks nothing (R-8's "abandoned reservation" risk only exists when a
reservation spans transactions). `reserved_slots` stays reserved for the
future checkout/payment-pending path — untouched by Phase 6.

---

## 7. Wallet + ledger integration

**No new journal type.** `INVESTMENT_DEBIT` already encodes exactly the
required shape: `user:reserved DEBIT → system:investment_principal_payable
CREDIT`. The two-journal sequence is intentional and consistent with Phase 5
(withdrawals are HOLD at request → EXTERNAL_PAYOUT at decision):

| Journal | Shape | Idempotency key | Entity |
|---|---|---|---|
| `HOLD` | `user:<uid>:available DR` → `user:<uid>:reserved CR` | `inv:hold:<inv_id>` | `investment` / `<inv_id>` |
| `INVESTMENT_DEBIT` | `user:<uid>:reserved DR` → `system:investment_principal_payable CR` | `inv:fund:<inv_id>` | `investment` / `<inv_id>` |

- Both post inside the caller's transaction — atomic with the capacity
  update and the investment insert.
- `post_journal`'s own `idempotency_key UNIQUE` is the ledger-level backstop:
  even if the RPC were somehow re-entered, the journals converge to one
  posting.
- Insufficient funds surface as the wallet layer's existing
  insufficient-balance error inside `post_journal` — Phase 6 maps it to
  `ERR_INSUFFICIENT_BALANCE` for the typed client surface.
- `payment_reference` on the investment stores the funding journal's
  `reference` (e.g. `JRN-…`) — server-side traceability without exposing
  journal UUIDs to clients.

**Traceability chain:** `investments.id` → `investment_events.request_id` →
`journal_entries.entity_id` → `ledger_entries` → `ledger_accounts`/`wallets`.
Answering "why did my balance drop" = `get_wallet_transactions` row →
`journal.entity_type='investment'` → `entity_id` → investment reference.

---

## 8. Capacity concurrency strategy

Mechanism: **single conditional UPDATE** (Phase 3A §8 verbatim):

```sql
update public.investment_rounds
   set allocated_slots = allocated_slots + $slots
 where id = $round
   and status = 'OPEN'
   and allocated_slots + reserved_slots + $slots <= total_slots;
```

- Atomic read-modify-write under the row's UPDATE lock — Postgres holds
  the lock from the update until COMMIT.
- Two concurrent buyers of the last slot: the second waits on the row
  lock, re-evaluates the WHERE clause after the winner commits
  (`READ COMMITTED` re-check semantics), sees `allocated+reserved+n > total`,
  updates zero rows → `ERR_ROUND_CAPACITY_EXCEEDED`. Exactly one success.
- The `capacity_invariant` CHECK (`allocated + reserved <= total`) is the
  constraint backstop — a buggy caller fails the whole transaction, never
  persists oversell.
- `SOLD_OUT` is set in the same UPDATE via `CASE` when the purchase
  consumes the final capacity; `closed_at` stamped alongside. Rounds that
  hit capacity are excluded from "open" reads by both status and the
  capacity predicate.
- No advisory locks, no serializable isolation needed — single-row
  UPDATE-level locking is sufficient because capacity is the only shared
  mutable resource.

---

## 9. Idempotency strategy

- **Column:** new `investments.idempotency_key text not null unique`.
- **Scope:** server prefixes — `'inv:create:' || user_id || ':' || key`
  (mirrors `dep:init:`/`wd:init:`), so client keys can never collide across
  users and a malicious/buggy client can't address another user's row.
- **Replay:** same key + same `(round_id, slots)` → return the existing
  investment row (200-equivalent, no writes, no second journal).
- **Conflict:** same key + materially different params
  (`round_id` or `slots` differ) → `ERR_IDEMPOTENCY_CONFLICT` — the request
  is never silently reinterpreted.
- **Ledger backstop:** `post_journal` keys `inv:hold:`/`inv:fund:` +
  `journal_entries.idempotency_key UNIQUE` — one financial effect ever.
- **Events:** `request_id` threads through every event row for the request
  (Phase 3A design), giving replay forensics without dedup dependence.
- **Concurrent duplicates:** both requests serialize on the same key's
  UNIQUE index — the loser either replays (same params) or errors (conflict);
  never double-debits, never double-consumes.

---

## 10. Profit calculation

Fixed-return model per master brief and existing `check` constraints:

```sql
principal_minor        := slots::bigint * round.slot_price_minor;
expected_profit_minor  := (principal_minor * plan.roi_bps)::bigint / 10000;
fee_minor              := (principal_minor * plan.investment_fee_bps) / 10000; -- 0 today
maturity_value_minor   := principal_minor + expected_profit_minor;
```

- **Rounding:** floor division on bigint — `(principal × roi_bps) / 10000`
  truncates toward zero. This is the convention already documented on the
  column comment (`⌊principal × roi_bps / 10_000⌋`) and matches the mock's
  `Math.round` behavior for all realistic inputs (floor ≤ round; difference
  only at exact .5 boundaries — floor is the conservative, server-chosen
  rule and the existing doc/comment is the approved authority).
- **No compounding, no floats, no calendar arithmetic.**
- `investment_fee_bps` exists on plans (0 in all current mocks and seeds).
  The fee is computed and shown in the quote; if a future plan sets it,
  the funding journal needs a fee leg — flagged as an open decision
  (D-6.5) since `INVESTMENT_DEBIT` has no FEE_REVENUE leg today.
- The `check` constraints on `investments` re-verify
  `principal = slots × slot_price` and `maturity_value = principal + profit`
  at INSERT — a buggy calculation aborts the transaction rather than
  persisting a wrong snapshot.

---

## 11. Duration / maturity seam

- Canonical unit: **`duration_hours`** (D-003) — elapsed wall-clock hours
  on `timestamptz`. No DST/month-boundary hazard.
- Phase 6 writes: `activated_at = now()`,
  `matures_at = activated_at + duration_hours * interval '1 hour'` — both
  snapshotted on the investment row at commit.
- The round's `projected_start_at`/`projected_maturity_at` remain
  **display-only** indications (they inform pre-purchase UI); the
  investment's actual maturity is derived from its own activation.
- The `investments_maturity_idx (status, matures_at) where status in
  ('ACTIVE','MATURITY_DUE')` partial index already exists — Phase 7's
  due-scan is pre-indexed.
- **Phase 6 does NOT:** detect due maturities, settle, credit profit,
  emit maturity events, or schedule workers. It only persists the
  timestamps and state Phase 7 will consume.

---

## 12. Validation rules (server-side, in order)

| # | Rule | Error |
|---|---|---|
| 1 | `auth.uid()` present | 401 `authentication required` |
| 2 | `profiles.account_status = 'ACTIVE'` | `ERR_ACCOUNT_NOT_ACTIVE` |
| 3 | `profiles.email_verified` | `ERR_EMAIL_VERIFICATION_REQUIRED` (Phase 3A gate) |
| 4 | idempotency replay/conflict | `ERR_IDEMPOTENCY_CONFLICT` |
| 5 | round exists | `ERR_ROUND_NOT_FOUND` |
| 6 | round `OPEN` + inside `opens_at..closes_at` | `ERR_ROUND_NOT_OPEN` |
| 7 | capacity ≥ slots (conditional UPDATE) | `ERR_ROUND_CAPACITY_EXCEEDED` |
| 8 | plan `PUBLISHED` + property `PUBLISHED` | `ERR_PLAN_NOT_AVAILABLE` |
| 9 | slots integer ≥ `min_slots` | `ERR_INVALID_SLOTS` |
| 10 | slots ≤ `max_slots_per_user` incl. user's existing round total | `ERR_INVESTMENT_LIMIT_EXCEEDED` |
| 11 | round currency = plan currency = wallet currency (NGN launch) | `ERR_CURRENCY` |
| 12 | wallet AVAILABLE ≥ principal + fee | `ERR_INSUFFICIENT_BALANCE` |
| 13 | plan `eligibility` jsonb gates | `ERR_ACCOUNT_NOT_ELIGIBLE` |
| 14 | `funding_source = 'WALLET'` | `ERR_FUNDING_SOURCE` |

Deliberately **not** validated in Phase 6: KYC tier, transaction PIN,
withdrawal-style review gates — Phase 3A defined `email_verified` as the
only investment gate; KYC lands in Phase 8 and must not be smuggled in.
`eligibility jsonb` is interpreted only for the `email_verified` gate type
today; unknown gate kinds in a plan's eligibility array are ignored rather
than guessed (fail-open on unimplemented gates is deliberate — a plan
needing a gate shouldn't be published until the engine supports it).

---

## 13. Failure / rollback behavior

Every failure before COMMIT is a full transaction rollback — no partial
capacity consumption, no orphan investment, no dangling journal, no event
rows. PostgreSQL guarantees this; no compensation logic needed.

| Failure | Result |
|---|---|
| Insufficient balance | `ERR_INSUFFICIENT_BALANCE`; nothing persisted |
| Capacity exceeded | `ERR_ROUND_CAPACITY_EXCEEDED`; nothing persisted |
| Plan/round unavailable | typed error; nothing persisted |
| Currency mismatch | `ERR_CURRENCY`; nothing persisted |
| Idempotency conflict | `ERR_IDEMPOTENCY_CONFLICT`; nothing persisted |
| Journal shape/balance failure | exception → full rollback incl. capacity |
| DB error mid-transaction | full rollback by definition |

**Post-commit edge case worth documenting:** if the transaction commits but
the client never receives the response (network drop), the idempotent
replay returns the existing investment — no duplicate. There is no
wallet-funded path that can leave an investment without its journal
(same-transaction), or a journal without its investment. `REVIEW_REQUIRED`
remains the administrative escape hatch if reconciliation ever surfaces a
corrupt row (admin marks review; resolution path is §17/§24).

---

## 14. Admin operations

Existing admin pages (`(ops)/properties|plans|rounds|investments`) already
render the domain — they're mock-backed today. Phase 6B adds read RPCs so
they switch to real data:

| RPC | Role gate | Purpose |
|---|---|---|
| `admin_list_investments(filters)` | `investments.read` roles (SUPPORT, OPERATIONS_ADMIN, FINANCE_ADMIN, SUPER_ADMIN) | list/filter by property/plan/round/status/user |
| `admin_investment_detail(id)` | same | full snapshot + event timeline + funding journal reference |
| `admin_mark_investment_review(id, reason)` | FINANCE_ADMIN, SUPER_ADMIN | ACTIVE → REVIEW_REQUIRED + audit row |
| `reconcile_investments()` | FINANCE_ADMIN, SUPER_ADMIN | anomaly scan (§24) — detect only, never mutate |

No balance editing, no snapshot mutation, no silent history rewriting.
Any correction goes through `reverse_journal` + `admin_post_adjustment`
(existing Phase 4 paths) with mandatory reason + audit.

---

## 15. Current mock-data inventory

Source of truth: `packages/mock-data/src/fixtures/catalogue.ts`
(6 properties, 6 plans, 6 rounds) + `fixtures/investor.ts`
(investor fixture's existing positions/transactions — display-only,
**not** seeded).

### Properties (all `PUBLISHED` in mock)

| slug | name | type | location | docs | updates |
|---|---|---|---|---|---|
| `the-terraces-ikoyi` | The Terraces, Ikoyi | Serviced residential | Ikoyi, Lagos | 4 verified | 2 |
| `palm-court-lekki` | Palm Court, Lekki | Dev finance (final phase) | Lekki Ph 1, Lagos | 4 verified | 1 |
| `wuse-square-residences` | Wuse Square Residences | Rental apartments | Wuse II, Abuja | 3 verified | 1 |
| `harbour-view-suites` | Harbour View Suites | Short-let suites | Old GRA, Port Harcourt | 4 verified | 1 |
| `bodija-gardens` | Bodija Gardens | Student housing | Bodija, Ibadan | 3 verified | 0 |
| `maitama-heights` | Maitama Heights | Premium residential | Maitama, Abuja | 1 verified + 1 pending | 1 |

### Plans (all `PUBLISHED`, all `NGN`, all `investmentFeeBps: 0`)

| plan | property | slot price | ROI | duration | min | max/user |
|---|---|---|---|---|---|---|
| Residential income note | Terraces | ₦100,000 | 16.50% | 12 mo | 1 | 50 |
| Development finance note | Palm Court | ₦50,000 | 14.00% | 9 mo | 2 | 100 |
| Rental yield note | Wuse | ₦10,000 | 12.50% | 6 mo | 5 | 500 |
| Short-let income note | Harbour | ₦25,000 | 15.00% | 8 mo | 2 | 200 |
| Rental yield note | Bodija | ₦10,000 | 13.00% | 6 mo | 1 | 300 |
| Residential income note | Maitama | ₦250,000 | 17.00% | 18 mo | 1 | 20 |

### Rounds (one per plan — covers every status for testing)

| round | plan | status | total | allocated | reserved |
|---|---|---|---|---|---|
| Terraces R2 | Terraces | OPEN | 500 | 332 | 8 |
| Palm Court R2 | Palm Court | NEARING_CAPACITY | 1200 | 1086 | 6 |
| Wuse R3 | Wuse | SOLD_OUT | 2000 | 2000 | 0 |
| Harbour R1 | Harbour | OPEN | 1000 | 322 | 18 |
| Bodija R1 | Bodija | OPEN | 3000 | 340 | 20 |
| Maitama R1 | Maitama | SCHEDULED | 200 | 0 | 0 |

**Conversion note:** mock `duration {value, unit:"MONTHS"}` → DB
`duration_hours` at **730 h/month** (8760 h = 1 year, consistent with the
existing comment). Mapped: 12mo→8760, 9mo→6570, 6mo→4380, 8mo→5840,
18mo→13140. Mock `availableSlots`/`allocatedPct` are derived fields —
the DB derives them identically from counters. Mock `proofDocuments` map
to `property_documents`; mock `updates` map to `property_updates`.

---

## 16. Test-data / seed strategy

### The smallest safe addition

`properties`, `investment_plans`, `investment_rounds` get a nullable
`seed_tag text` column. Value: `'p6-catalogue-fixtures'`.

Why `seed_tag` not `is_test boolean`:
- A tag names *which* fixture set created the row — multiple fixture
  generations can coexist and be deleted independently.
- It's not a generic `isTest` flag smuggled into the domain model — it's
  provenance metadata, the same pattern as `request_id`/`created_by`.
- `NULL` = real data; the check is `seed_tag is null`, not `is_test = false`.
- Deletion is `delete … where seed_tag = 'p6-catalogue-fixtures'` in
  dependency order — one query per table, fully enumerable.

### Seed migration

`0012_catalogue_seed.sql` — `insert … where seed_tag = 'p6-catalogue-fixtures'`,
idempotent via `on conflict (slug) do nothing` (properties) /
`(plan_id, round_number)` / `(property_id, name)` uniques. Seeded statuses
are **real** statuses — OPEN rounds are genuinely investable by test users
with funded wallets; SOLD_OUT/SCHEDULED rounds test the rejection paths.

**Seeded rows are visible to investors** (`PUBLISHED` property + `PUBLISHED`
plan + `OPEN` round is the RLS predicate) — intentional: the point is to
exercise the real read/write path. The `(fictional)` markers already present
in operator names/descriptions are preserved verbatim in the seed — no mock
copy is laundered into a real-sounding claim.

### What the seed must NOT create

- ❌ wallets, balances, deposits, ledger rows — zero money movement
- ❌ investments, events — investors create those through the real RPC
- ❌ fake returns, maturity payouts, referrals, notifications
- ❌ fake provider data or webhook artifacts

The seed inserts *opportunities only*. A test user needs a **real** funded
wallet to actually invest — which means a real (sandbox) deposit through
Phase 5 infrastructure, or a finance-admin `admin_post_adjustment` (the
existing, audited, reason-required dev path). No backdoor wallet inserts.

### Lifecycle

```
SEED (0012) → dev/testing via real flow → DELETE seed_tag rows (dependency
order: events → investments? see below → rounds → plans → properties)
→ replace with real catalogue (seed_tag NULL)
```

**Deletion safety:** `investments.round_id/plan_id/property_id` are all
`ON DELETE RESTRICT` — a seeded round with real investments **cannot be
casually deleted**; the FK is the guard. Cleanup of seeded catalogue is
only clean while test investments haven't been made; once they have, the
fixture set stays until those investments are resolved or the whole
environment is reset. Documented in the report.

---

## 17. Investor UI data-source migration

Current seam: `createSupabaseInvestorDataSource` delegates everything
except auth + deposits to `domain` (the mock). Phase 6B swaps these methods
to real reads — **interface unchanged, UI untouched**:

| Method | Mock today | Phase 6B real path |
|---|---|---|
| `listOpportunities` | fixture arrays | `list_open_opportunities()` RPC — joins PUBLISHED properties+plans+rounds, derives `availableSlots`/`allocatedPct`/`perSlot` server-side |
| `getOpportunity(slug)` | fixture lookup | same RPC filtered by slug (or `investment_opportunity(slug)`) |
| `quoteInvestment` | mock math | `investment_quote(round_id, slots)` RPC — real wallet balance, real counters, same `InvestmentQuote` wire shape |
| `submitInvestment` | mock deduction | `request_investment` RPC (the §6 transaction) → `InvestmentSubmission` |
| `getSubmission` | mock map | `investments` row read by reference (RLS own-row) |
| `listInvestments`/`getInvestment` | fixture | direct `investments`/`investment_events` reads (RLS already grants own-row) |
| `getWallet`/`listTransactions` | fixture | `wallets` own-row select + `get_wallet_transactions` RPC (already exists, Phase 4) |
| `getDashboard` | fixture | thin `dashboard_summary` RPC or client-compose from the real reads — decided in 6B |

The `Opportunity`/`InvestmentQuote`/`Investment` wire types already match
the domain model almost exactly (minor-unit money, `roiBps`, `Duration`
object, ISO timestamps) — the adapter maps `duration_hours` back to a
`Duration` for display.

**No UI redesign.** The checkout page (`checkout/[roundId]`), payment
status page (`payment/[reference]`), opportunity detail, explore cards and
portfolio screens consume identical types — the data source swap is the
only change. Mobile gets it free (same interface).

---

## 18. Migration plan

Three migrations, forward-only, tracked in `public.schema_migrations`
(continuing 0001–0011). Each is independently re-runnable-ish via
idempotent DDL where possible; none touches earlier files.

| # | Name | Contents | Depends on |
|---|---|---|---|
| `0012` | `catalogue_seed` | `seed_tag` columns (properties/plans/rounds) + the 6-property/6-plan/6-round fixture insert | schema (0002) |
| `0013` | `investment_engine` | `investments.idempotency_key` unique col; `app.investment_write` guard triggers on investments/events/rounds; `request_investment` RPC; `investment_quote` RPC; `list_open_opportunities` RPC; `apply_investment_transition` map; transition-gated `investment_events` writes | 0012 (tables exist anyway, but logical order) |
| `0014` | `investment_admin` | `admin_list_investments`, `admin_investment_detail`, `admin_mark_investment_review`, `reconcile_investments`; EXECUTE grants (authenticated for user RPCs, role-gated inside; finance roles for admin) | 0013 |

Config keys added to `admin_config` via `0014` or a later seed migration
(`investment.` category): none strictly required at launch — per-user
limits already live on plans; a global `investment.enabled` kill-switch is
the one key worth seeding (BOOLEAN, default true).

---

## 19. Testing plan (Phase 6B)

Local (`verify-migrations.mjs`, embedded-pg — same harness as Phase 4/5):

- Happy path: 1 slot, min slots, max slots → ACTIVE + 2 journals + 3
  events + capacity incremented.
- Rejections: each §12 error code asserted.
- **Race:** two concurrent `request_investment` for the last slot →
  exactly one ACTIVE, exactly one capacity decrement, loser gets
  `ERR_ROUND_CAPACITY_EXCEEDED`, `capacity_invariant` never violated.
- Idempotency: same key+params replay (same row, no extra journal); same
  key+different params → `ERR_IDEMPOTENCY_CONFLICT`; concurrent same-key →
  one row.
- Snapshot: edit plan ROI/price after purchase → existing investment
  unchanged (columns + CHECK re-verify at insert).
- Ledger: exactly one HOLD + one INVESTMENT_DEBIT; wallet
  `reconcile_wallets` returns zero anomalies.
- Security: investor direct INSERT/UPDATE/DELETE on all five tables denied;
  `request_investment` unauthenticated → 401; investor reads another's
  investment → 0 rows; `post_journal` direct → permission denied.
- Reconciliation: clean DB → zero anomalies; seeded catalogue →
  opportunities visible, no financial rows.

Hosted: same suite under real JWT claims (the Phase 5 fixture pattern),
plus the live `request_investment` round-trip on a seeded OPEN round with
a sandbox-funded wallet.

---

## 20. Security considerations

- `request_investment` is SECURITY DEFINER but authenticates via
  `auth.uid()` first — no anonymous reach.
- Write guards (`app.investment_write`) mean even service-role direct
  writes to investments/rounds/events are rejected outside the RPC — the
  Phase 5 proven pattern.
- No client-computed values ever cross the trust boundary: `slots` and
  `idempotency_key` are the only user inputs; everything else is
  re-derived server-side under the round lock.
- `payment_reference` stores the journal *reference string* (e.g.
  `JRN-…`), not the journal UUID — traceability without leaking internal
  IDs.
- Investors read only their own `investments`/`investment_events` (existing
  RLS); opportunities are PUBLISHED-gated (existing RLS); admin reads are
  role-gated (existing `has_admin_role`).
- Money never moves outside `post_journal`; wallets stay trigger-gated.

---

## 21. Phase 7 boundary

| Phase 6 creates | Phase 7 will execute |
|---|---|
| `matures_at` snapshot on ACTIVE rows | due-scan worker (`investments_maturity_idx` ready) |
| `MATURITY_DUE`/`SETTLING`/`COMPLETED` enum values | transitions into them |
| `INVESTMENT_PROFIT_PAYABLE` account (seeded) | `MATURITY_CREDIT` journals (IPP+profit → AVAILABLE) |
| `apply_investment_transition` map | the sweep/settlement RPCs that call it |
| `reconcile_investments` | maturity reconciliation additions |
| `investment_events` seam | `MATURED`/`SETTLEMENT_STARTED`/`SETTLED` events |

Also explicitly **out** of Phase 6: external funding sources
(BANK_TRANSFER/CARD investment purchases → PAYMENT_PENDING path),
reservation/expiry sweeps (`reserved_slots` stays 0), KYC gates, referral
rewards, notifications, transaction PIN enforcement.

---

## 22. Open decisions requiring approval

| ID | Question | Recommendation |
|---|---|---|
| **D-6.1** | Wallet-funded only for Phase 6? External `funding_source` rejected with `ERR_FUNDING_SOURCE`? | **Yes** — simplest atomic path; external funding is a Phase 5-webhook-flavored follow-on |
| **D-6.2** | Immediate activation (`activated_at=now()`, `matures_at=now()+duration`) vs deferred to `projected_start_at`? | **Immediate** — matches mock behavior, elapsed-time semantics, avoids an activation sweep; round `projected_*` fields stay display-only |
| **D-6.3** | `seed_tag` marker vs publication-status-based test distinction? | **`seed_tag`** — statuses are real lifecycle, not provenance; a tag is enumerable, nullable for prod data, and deletable in one query |
| **D-6.4** | `investment_fee_bps` funding leg: plans all have 0 today. If a plan ever sets it, does `INVESTMENT_DEBIT` need a `FEE_REVENUE` leg? | **Defer** — shape-gate a fee variant only when a non-zero-fee plan exists; Phase 6 asserts `investment_fee_bps = 0` on purchase |
| **D-6.5** | NEARING_CAPACITY: stored status or derived display? | **Derived** — `allocatedPct` already computes it; storing creates a transition ambiguity (does SOLD_OUT→NEARING_CAPACITY on release?) Phase 6 doesn't need |
| **D-6.6** | `getDashboard` — dedicated RPC vs composing existing real reads? | **Decide in 6B** — composition is fine if dashboard needs only wallet+investments; a server rollup is better if pendingActions need server logic |
| **D-6.7** | Should `request_investment` return the submission wire shape or the investment row? | **`InvestmentSubmission`** — `payment/[reference]` page already polls it; `investmentId` inside carries the join |

---

## 23. Already decided (existing spec constraints)

- Money = bigint minor; ROI = bps; duration = hours; no floats (D-003).
- `post_journal` is the only financial write path (D-004).
- `INVESTMENT_DEBIT` journal shape is RESERVED→IPP (0005).
- Capacity = `allocated+reserved<=total` CHECK + conditional UPDATE (0002, Phase 3A §8).
- Investments snapshot economics; plan edits never rewrite history (0002).
- `email_verified` gates investing (Phase 3A §11).
- SECURITY DEFINER + `auth.uid()` + `account_status` gate + `ERR_*` errors + scoped idempotency keys + `request_id` threading + write-guard flags (Phase 5 conventions).
- Forward-only migrations in `public.schema_migrations` (repo convention).
- `DataSource` seams — UI depends on interfaces, never Supabase directly (D-002).

---

## 24. Reconciliation

`reconcile_investments()` — detect-only, FINANCE_ADMIN/SUPER_ADMIN, returns
anomaly rows (never mutates):

| Check | Query essence |
|---|---|
| Investment without funding journal | `investments` ACTIVE with no `journal_entries` where `entity_id = investments.id` and `journal_type='INVESTMENT_DEBIT'` |
| Funding journal without investment | `journal_entries` `entity_type='investment'` with no matching investments row |
| Principal ≠ journal movement | `investments.principal_minor + fee` vs journal line amounts |
| Capacity mismatch | `rounds.allocated_slots` vs `sum(investments.slots where status='ACTIVE')` per round |
| Negative/invalid counters | `capacity_invariant` violations (belt to the CHECK's braces) |
| Duplicate idempotency | impossible (UNIQUE) — assert count for proof |
| Invalid state | transitions violating the transition map |
| Currency mismatch | investment.currency ≠ round.currency ≠ plan.currency |
| Orphan events | `investment_events` with no parent investment |

---

## 25. Files / tables / RPCs expected to change

### Schema
- `properties` / `investment_plans` / `investment_rounds`: + `seed_tag text null`
- `investments`: + `idempotency_key text not null unique`
- Write-guard triggers on `investments`, `investment_events`, `investment_rounds`

### New RPCs
`request_investment`, `investment_quote`, `list_open_opportunities`,
`apply_investment_transition`, `admin_list_investments`,
`admin_investment_detail`, `admin_mark_investment_review`,
`reconcile_investments`

### Migrations
`0012_catalogue_seed.sql`, `0013_investment_engine.sql`, `0014_investment_admin.sql`

### App code
- `packages/supabase/src/investor-data-source.ts` — swap 7 delegated methods to real reads/RPCs
- `packages/types/src/index.ts` — wire types already suffice; verify `Investment` ↔ DB mapping
- `packages/mock-data/src/mock-data-source.ts` — stays for demo/toolbar fallback
- Admin app: `investments` page re-points to `admin_list_investments`
- `apps/web` pages — **zero changes expected** (interface seam)
- `apps/mobile` — zero changes

### Documentation
`PHASE_6B_IMPLEMENTATION_REPORT.md` after implementation; `DECISIONS.md`
D-006 once approved.

---

## 26. Summary for approval

**Everything Phase 6 needs already exists except:** the RPC itself, the
idempotency column, write guards, admin read RPCs, reconciliation, the seed
marker, and the seed data. The journal type, system accounts, enums, checks,
RLS, wire types, and UI seams are all in place — Phase 3A/4A/5A designed
ahead.

**Zero new Edge Functions.** `request_investment` is fully DB-internal
(wallet is already funded via Phase 5 deposits); an Edge Function would
only be needed if a future phase adds external-funding checkout.

**Governing risk:** none discovered. The schema anticipated this phase.

Pending your approval on D-6.1–D-6.7, Phase 6B implements `0012–0014`,
wires the Supabase investor data source, seeds the catalogue, and verifies
locally + hosted.
