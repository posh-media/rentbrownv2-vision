# PHASE 3A — Core Domain & PostgreSQL Data Model: Schema Proposal + Report

**Status:** proposal for review — **no Phase 3B tables are implemented.**
**Repository:** `posh-media/rentbrownv2-vision` · branch `main`
**Scope:** schema architecture, RLS boundaries, seed & migration strategy, risk review.
Nothing in this document creates tables, financial engines, wallets, ledger,
deposits, withdrawals, KYC providers, referral payouts, or purchase flows.

---

## 1. Executive summary

Phase 2 delivered a working identity foundation (`profiles`, `admin_roles`,
`reserved_usernames`, RLS, Supabase Auth). Phase 3A proposes the domain model
that sits on top of it, centred on the product hierarchy:

```
properties → investment_plans → investment_rounds → investments → investment_events
```

plus three cross-cutting tables — `property_documents` (evidence),
`admin_config` / `admin_config_history` (admin-editable business policy), and
`audit_log` — and two profile extensions (`email_verified`, `kyc_verified`).

Headline decisions:

- **Money** = `bigint` minor units everywhere; **ROI** = `integer` basis points.
- **Duration is stored in hours** (`duration_hours integer`). This is the
  authoritative value; "days/months" exist only as display formatting.
- **Investments snapshot their economics** (slot price, ROI, duration, currency,
  principal, expected profit, maturity value) at creation — later plan edits can
  never rewrite history.
- **`admin_config` is a typed key registry**, not a per-column settings table —
  new policy values ship without migrations; every change writes a history row.
- **`email_verified` is a server-synced flag** driven by `auth.users.email_confirmed_at`
  via trigger — clients cannot set it, and unverified email does **not** block
  sign-in (it gates protected actions like investing).
- **All client writes to domain tables are denied by RLS.** Mutations happen in
  `SECURITY DEFINER` RPCs (service role or vetted functions), which is also the
  seam where Phase 4–9 engines will live.

---

## 2. Phase 2 database assessment (what actually exists)

Verified against `supabase/migrations/0001_foundation.sql` — the repository is
the source of truth.

### Tables

| Table | Columns of note | Constraints |
|---|---|---|
| `public.profiles` | `id` (FK → `auth.users`, cascade), `username citext unique`, `display_name`, `phone`, `account_status` (enum), `referral_code unique`, `referred_by` FK → profiles | `username_format` check; updated_at trigger |
| `public.admin_roles` | `user_id` PK FK → `auth.users`, `role` enum, `granted_by`, `granted_at` | one role per user (PK on user_id) |
| `public.reserved_usernames` | `username citext` PK | seeded with 27 reserved names |

### Enums

- `account_status` — `ACTIVE | RESTRICTED | SUSPENDED | CLOSED`
- `admin_role` — `SUPPORT | KYC_REVIEWER | OPERATIONS_ADMIN | FINANCE_ADMIN | SUPER_ADMIN`

### Functions / triggers

- `is_admin(uuid)` / `is_admin()` — SECURITY DEFINER existence check on `admin_roles`
- `current_admin_role()` — caller's role or null
- `normalize_username(text)`, `assert_username_allowed()` trigger, `touch_updated_at()` trigger
- `generate_referral_code()` — `RB-` + 8 chars, unambiguous alphabet
- `handle_new_user()` — `auth.users` after-insert trigger; provisions profile,
  resolves username collisions deterministically, applies `referral_code`
  attribution from `raw_user_meta_data`

### RLS / privileges

- `profiles`: `SELECT` own row or any row as admin; `UPDATE` restricted by
  column grant to `(username, display_name, phone)` only — status/referral
  fields are server-managed. No client INSERT/DELETE.
- `admin_roles`: `SELECT` own grant only; no client writes (service role only).
- `reserved_usernames`: RLS enabled, no policies (service-only).

### Application seam

- `@rentbrown/supabase` — `AuthGateway` (identity), `createSupabaseInvestorDataSource`
  (real auth + delegated domain reads → mock today), `resolveAdminActor`
  (role → shared `ADMIN_PERMISSIONS_BY_ROLE` map in `@rentbrown/types`).
- `emailVerified` is currently **derived at read time** from
  `auth.users.email_confirmed_at` in `toAppProfile` — there is no column yet.
- Migrations: `scripts/migrate.mjs` applies `supabase/migrations/*.sql`
  forward-only against `DATABASE_URL`, tracked in `public.schema_migrations`.
- Verification: `scripts/verify-migrations.mjs` (16 checks, embedded Postgres).

### Known infrastructure blocker (carried from Phase 2)

Hosted `DATABASE_URL`/`WORKER_DATABASE_URL` credentials currently fail with
PostgreSQL `28P01` (stale password). Migrations verify locally via embedded
Postgres; hosted application is blocked until credentials are rotated.
Phase 3B inherits this blocker — see §17 Risks.

### What can be extended vs left unchanged

| Extend | Leave unchanged |
|---|---|
| `profiles` — add `email_verified`, `email_verified_at`, `kyc_verified`, `kyc_verified_at` | username/referral logic, `handle_new_user` attribution path |
| enum catalogue — new enums only | `account_status`, `admin_role` (roles already cover Phase 3 needs) |
| helper functions — add `has_admin_role(...)`, config/audit writers | `is_admin`, `current_admin_role`, RLS posture on existing tables |

---

## 3. Requirements incorporated

| Requirement | Where it lands |
|---|---|
| Property → Plan → Round → Investment hierarchy | §6–§9 |
| Economics off `properties` (no ROI/slot price on the asset) | §6 rationale |
| Duration authored & stored in **hours** | §7 + §12 |
| Capacity invariant `0 ≤ available ≤ total` + concurrency path | §8 |
| Immutable investment snapshots | §9 |
| `email_verified`/`kyc_verified` default `false`, client-locked | §11 + §13 |
| Email verification does not block sign-in | §11 |
| Admin-editable `admin_config` with audit history | §10 + §14 |
| No `isAdmin` flag — role/permission authorization | §15 |
| NGN default + USD, no FX execution | §16.4 |
| Deterministic, re-runnable seeds; no fake production investments | §17.2 |
| Forward-only migrations off `0001_foundation.sql` | §17.3 |

---

## 4. Relationship diagram

```
auth.users (Supabase)
   │ 1:1
   ▼
profiles ────────────────┬────────────────────────────┐
   │                     │                            │
   │ referred_by (self-FK, exists)                     │
   │                     │                            │
   │ 1:N                 │ 1:N (actor)                │ 1:N (reviewer)
   ▼                     ▼                            ▼
investments        audit_log                    property_documents ─┐
   │                (entity_type/entity_id → any domain row)         │ N:1
   │ N:1                                                             ▼
   ▼                                                            properties
investment_rounds ──────────────────────────────── N:1 ──────────▲   │
   │ N:1                                                         │   │ 1:N
   ▼                                                             │   ▼
investment_plans ──────────────────────────────── N:1 ───────────┘   property_updates
   │
   └─ (rounds denormalize slot_price/currency snapshot at open;
       investments snapshot ALL economics at creation)

admin_config ──1:N──► admin_config_history   (key → typed registry row → every change)
property_documents ◄── reviewed_by → auth.users (admin reviewer)
investment_events ◄── N:1 → investments (append-only)
```

Future anchors (not built): `investments.id` is the entity ledger entries
(Phase 4), deposit intents (Phase 5), purchase events (Phase 6) and maturity
runs (Phase 7) will reference. `property_documents.storage_path` is the
Supabase Storage object key for Phase 11.

---

## 5. Proposed enums

| Enum | Values | Why it exists |
|---|---|---|
| `currency_code` | `NGN`, `USD` | Launch currencies; matches `CurrencyCode` in `@rentbrown/types`. No FX state. |
| `property_publication_status` | `DRAFT`, `IN_REVIEW`, `PUBLISHED`, `ARCHIVED` | Matches admin vocabulary (`PropertyPublicationStatus`). Separate from any lifecycle/financial state — a property is a content entity. |
| `property_document_type` | `TITLE`, `VALUATION`, `INSPECTION`, `COST_SCHEDULE`, `INSURANCE`, `LEGAL_OPINION`, `OPERATOR_AGREEMENT` | Matches `ProofDocumentType` already shipped in UI. |
| `property_document_status` | `UPLOADED`, `IN_REVIEW`, `VERIFIED`, `REJECTED`, `EXPIRED` | Extends the UI's `VERIFIED/PENDING_REVIEW/EXPIRED` with the real workflow states the brief requires (uploaded ≠ reviewed ≠ verified). The public projection maps `UPLOADED/IN_REVIEW` → `PENDING_REVIEW`. |
| `investment_plan_status` | `DRAFT`, `PUBLISHED`, `PAUSED`, `ARCHIVED` | UI ships `PUBLISHED/PAUSED/ARCHIVED`; `DRAFT` added so admins can compose plans before publication. |
| `investment_round_status` | `SCHEDULED`, `OPEN`, `NEARING_CAPACITY`, `SOLD_OUT`, `CLOSED`, `SETTLED` | Matches shipped `InvestmentRoundStatus` verbatim. `NEARING_CAPACITY` may alternatively be derived — see open question OQ-4. |
| `investment_status` | `PAYMENT_PENDING`, `ACTIVE`, `MATURITY_DUE`, `SETTLING`, `COMPLETED`, `FAILED`, `REFUNDED`, `REVIEW_REQUIRED` | Matches shipped `InvestmentStatus` verbatim. |
| `investment_event_type` | `CREATED`, `PAYMENT_PENDING`, `PAYMENT_CONFIRMED`, `ACTIVATED`, `CANCELLED`, `FAILED`, `REFUNDED`, `MATURED`, `SETTLEMENT_STARTED`, `SETTLED`, `REVIEW_REQUIRED`, `NOTE_ADDED` | Append-only lifecycle vocabulary; superset of status transitions plus `NOTE_ADDED` for admin annotations that don't change state. |
| `funding_source` | `WALLET`, `BANK_TRANSFER`, `CARD` | Matches shipped `FundingSource`. |
| `config_value_type` | `MONEY_MINOR`, `BPS`, `INTEGER`, `TEXT`, `BOOLEAN`, `STRING_LIST` | Declares how `admin_config.value` is validated server-side. |
| `audit_result` | `SUCCESS`, `DENIED`, `FAILED` | Matches shipped `AuditResult`. |

Deliberately **not** shared: no single generic "status" enum — each entity's
vocabulary is independent, matching the type contracts. State **transitions**
(e.g. `OPEN → SOLD_OUT`, `ACTIVE → MATURITY_DUE`) are enforced by server-side
functions, not by database transition tables — the enums only constrain the
stored value.

`property_type` is proposed as `text` (not an enum): the shipped fixtures use
it as editorial display copy ("Serviced residential apartments", "Purpose-built
student housing"). A controlled vocabulary would constrain admin authoring
without buying integrity — flagged as open question OQ-1.

---

## 6. `properties` — the asset

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `slug` | citext | NO | — | unique; `check (slug ~ '^[a-z0-9][a-z0-9-]{2,63}$')` — powers public URLs |
| `name` | text | NO | — | e.g. "The Terraces, Ikoyi" |
| `property_type` | text | NO | — | editorial display label (see §5) |
| `summary` | text | NO | — | card copy |
| `description` | text | NO | — | long-form |
| `area` / `city` / `state` | text | YES | — | structured location |
| `location_label` | text | NO | — | public label, e.g. "Ikoyi, Lagos" |
| `address` | text | YES | — | **internal only** — exact addresses are never public (product rule already in `PropertyLocation`) |
| `images` | text[] | NO | `'{}'` | asset keys today; Supabase Storage paths in Phase 11 |
| `operator_name` / `operator_description` | text | YES | — | operator attribution |
| `highlights` | text[] | NO | `'{}'` | display bullets |
| `revenue_model` | text | YES | — | editorial explanation |
| `publication_status` | `property_publication_status` | NO | `'DRAFT'` | public visibility gate |
| `created_by` | uuid | YES | — | FK → `auth.users` (authoring admin) |
| `created_at` / `updated_at` | timestamptz | NO | `now()` | `touch_updated_at` trigger |

**Why no economics here:** ROI, slot price, duration and capacity are *terms of
a plan*, not attributes of the building. One property can carry multiple plans
(income note, development note) and re-offer the same plan in successive
rounds — putting economics on `properties` would force duplication and make
re-pricing ambiguous. The property row answers "what is the asset"; the plan
answers "on what terms can I participate"; the round answers "how much
capacity is available now".

**Indexes:** `properties_slug_key` (unique), `properties_published_idx` on
`(publication_status)` where `= 'PUBLISHED'` — the public catalogue hot path.

---

## 7. `investment_plans` — the economic terms

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `property_id` | uuid | NO | — | FK → `properties` RESTRICT (no deleting assets with plans) |
| `name` | text | NO | — | neutral terminology ("Residential income note" — no equity/ownership language, per product rule) |
| `description` | text | YES | — | |
| `currency` | `currency_code` | NO | — | the plan's denomination |
| `slot_price_minor` | bigint | NO | — | `> 0`; ₦100,000 → `10_000_000` |
| `roi_bps` | integer | NO | — | `check (roi_bps >= 0)`; 16.5% → `1650`. Upper bound is a policy call — OQ-2 |
| `duration_hours` | integer | NO | — | `> 0` — **authoritative duration in hours** (see §12) |
| `min_slots` | integer | NO | `1` | `> 0` |
| `max_slots_per_user` | integer | YES | — | `NULL` = uncapped; `check (> 0)` and `>= min_slots` when present |
| `eligibility` | jsonb | NO | `'[]'` | display strings + structured gates (`kyc_tier`, `email_verified`) — server interprets |
| `investment_fee_bps` | integer | NO | `0` | `>= 0`; 0 at launch |
| `terms` | text[] | NO | `'{}'` | plan terms |
| `risk_disclosures` | text[] | NO | `'{}'` | shown before checkout |
| `status` | `investment_plan_status` | NO | `'DRAFT'` | |
| `created_by` | uuid | YES | — | FK → `auth.users` |
| `created_at` / `updated_at` | timestamptz | NO | `now()` | |

**Indexes:** `investment_plans_property_idx (property_id)`,
`investment_plans_public_idx (status)` partial on `PUBLISHED`.
**Unique:** `(property_id, name)` — prevents duplicate plan names per asset.

---

## 8. `investment_rounds` — finite capacity

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `plan_id` | uuid | NO | — | FK → `investment_plans` RESTRICT |
| `round_number` | integer | NO | — | `> 0`; `unique (plan_id, round_number)` |
| `status` | `investment_round_status` | NO | `'SCHEDULED'` | transitions server-managed |
| `total_slots` | integer | NO | — | `> 0` |
| `allocated_slots` | integer | NO | `0` | `>= 0` — settled purchases |
| `reserved_slots` | integer | NO | `0` | `>= 0` — in-flight checkouts (Phase 6) |
| `slot_price_minor` | bigint | NO | — | **snapshot** of plan price when the round is opened — rounds never re-price live |
| `currency` | `currency_code` | NO | — | snapshot, must equal plan currency (`check` via trigger or RPC assert) |
| `opens_at` / `closes_at` | timestamptz | NO | — | `check (closes_at > opens_at)` |
| `projected_start_at` | timestamptz | YES | — | indicative, shown on cards |
| `projected_maturity_at` | timestamptz | YES | — | indicative |
| `opened_at` / `closed_at` / `settled_at` | timestamptz | YES | — | actual lifecycle timestamps |
| `created_at` / `updated_at` | timestamptz | NO | `now()` | |

**Capacity invariant (enforced):**

```sql
check (allocated_slots >= 0 and reserved_slots >= 0
       and allocated_slots + reserved_slots <= total_slots)
```

`available` is **derived** (`total − allocated − reserved`) — not a stored
column, so it can never contradict the counters.

**Concurrency path (Phase 6 will implement, schema designed for it now):**
reservation is one atomic conditional update —

```sql
update investment_rounds
   set reserved_slots = reserved_slots + $n
 where id = $round
   and status = 'OPEN'
   and allocated_slots + reserved_slots + $n <= total_slots
returning reserved_slots;
```

Zero rows returned = capacity exhausted. The `check` constraint is the
backstop even if a caller is buggy. No decrement of `allocated` without a
matching investment row — enforced in the Phase 6 RPC, not by trigger.

**Indexes:** `investment_rounds_plan_idx (plan_id)`,
`investment_rounds_status_idx (status, closes_at)` — powers "open rounds" and
"closing soon" queries.

---

## 9. `investments` — user positions (snapshot economics)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `reference` | text | NO | — | unique human reference `RB-INV-…`, generated server-side |
| `user_id` | uuid | NO | — | FK → `profiles` |
| `round_id` | uuid | NO | — | FK → `investment_rounds` RESTRICT |
| `plan_id` | uuid | NO | — | FK → `investment_plans` RESTRICT (denormalized for direct plan reads) |
| `property_id` | uuid | NO | — | FK → `properties` RESTRICT (denormalized for per-property reporting) |
| `funding_source` | `funding_source` | NO | — | how principal will be/was paid |
| `slots` | integer | NO | — | `> 0` |
| `slot_price_minor` | bigint | NO | — | **snapshot** — from the round, not the live plan |
| `currency` | `currency_code` | NO | — | **snapshot** |
| `principal_minor` | bigint | NO | — | **snapshot** = `slots × slot_price_minor` (`check` enforced) |
| `roi_bps` | integer | NO | — | **snapshot** `>= 0` |
| `duration_hours` | integer | NO | — | **snapshot** `> 0` |
| `expected_profit_minor` | bigint | NO | — | **snapshot** `>= 0`; engine computes `⌊principal × roi_bps / 10_000⌋` |
| `maturity_value_minor` | bigint | NO | — | **snapshot**; `check (= principal + expected_profit)` |
| `status` | `investment_status` | NO | `'PAYMENT_PENDING'` | server-managed only |
| `activated_at` / `matures_at` / `completed_at` | timestamptz | YES | — | set by engines; `matures_at = activated_at + duration_hours × 1h` |
| `payment_reference` | text | YES | — | external payment ref until Phase 5 FK exists |
| `created_at` / `updated_at` | timestamptz | NO | `now()` | |

**Snapshot vs reference, explicitly:**

- *References* (FK, follow the live row): `user_id`, `round_id`, `plan_id`,
  `property_id` — identity and navigation.
- *Snapshots* (frozen at creation): every economic value — `slots`,
  `slot_price_minor`, `currency`, `principal_minor`, `roi_bps`,
  `duration_hours`, `expected_profit_minor`, `maturity_value_minor`. An admin
  editing a plan later changes **future** rounds only; existing investments are
  contracts. Column-level `REVOKE UPDATE` makes client mutation impossible even
  if a policy is mis-written.

**Indexes:** `investments_user_idx (user_id, created_at desc)` — portfolio;
`investments_round_idx (round_id)`; `investments_property_idx (property_id)`;
`investments_maturity_idx (status, matures_at)` — Phase 7 "due for maturity"
scan (`status IN ('ACTIVE','MATURITY_DUE')`).

---

## 10. `property_documents`, `property_updates`, `investment_events`

### `property_documents` — evidence with a real review trail

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `property_id` | uuid | NO | — | FK → `properties` CASCADE |
| `document_type` | `property_document_type` | NO | — | |
| `title` / `summary` | text | NO / YES | — / — | public display copy |
| `storage_path` | text | YES | — | Supabase Storage object key (Phase 11); never a public URL; nullable pre-upload |
| `status` | `property_document_status` | NO | `'UPLOADED'` | |
| `version` | text | NO | `'v1'` | |
| `reviewed_by` | uuid | YES | — | FK → `auth.users` (admin reviewer) |
| `reviewed_at` | timestamptz | YES | — | |
| `review_note` | text | YES | — | internal decision note |
| `created_at` / `updated_at` | timestamptz | NO | `now()` | |

Integrity: `check (status <> 'VERIFIED' or (reviewed_by is not null and reviewed_at is not null))`
— nothing can be marked verified without a reviewer. `VERIFIED` means
"reviewed under RentBrown's documented internal process" — the schema carries
no claim of legal title validation; that distinction lives in the copy and the
review record.

### `property_updates` — published property news

`id`, `property_id` FK CASCADE, `title`, `body`, `published_at`,
`created_by`, `created_at`. Shipped in the UI (`PropertyUpdate`) — trivially
small, included now so the domain read adapter is complete.

### `investment_events` — append-only history

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | NO | PK |
| `investment_id` | uuid | NO | FK → `investments` CASCADE |
| `event_type` | `investment_event_type` | NO | |
| `actor_id` | uuid | YES | FK → `auth.users`; `NULL` = system |
| `actor_kind` | text | NO | `INVESTOR | ADMIN | SYSTEM` (`check`) |
| `request_id` | text | YES | idempotency/correlation key from the caller |
| `metadata` | jsonb | NO | `'{}'` — event payload (e.g. previous→new status) |
| `created_at` | timestamptz | NO | `now()` |

**Append-only:** no `UPDATE`/`DELETE` grants to any client role; events are
written inside the same transaction as the state change they describe, so a
state change without an event is impossible. `request_id` is how Phase 6
deduplicates retried submissions.

---

## 11. `profiles` extensions — `email_verified` & `kyc_verified`

```sql
alter table public.profiles
  add column email_verified   boolean     not null default false,
  add column email_verified_at timestamptz,
  add column kyc_verified     boolean     not null default false,
  add column kyc_verified_at  timestamptz;
```

**`email_verified` — synced, never client-writable.** Supabase Auth owns truth
(`auth.users.email_confirmed_at`). A `SECURITY DEFINER` trigger
`sync_email_verified` on `auth.users AFTER UPDATE OF email_confirmed_at` copies
the state into `profiles`. The existing column-level UPDATE grant stays
`(username, display_name, phone)` — a client *cannot* write the flag even with
a permissive policy. Reads still prefer the live `auth.users` value in
`toAppProfile`; the column exists for RLS predicates and server-side joins.

**Sign-in is not gated on it.** Today `signIn` only blocks
`SUSPENDED`/`CLOSED` accounts — that stays. The flag gates *protected actions*
instead: investing (Phase 6) requires `email_verified`; the UI surfaces a
"verify your email" pending action (already in `PendingActionKind`). This
matches the requirement: signup → sign in → browse → verify before investing.

**`kyc_verified` — server-managed gate flag.** Flipped to `true` only by the
Phase 8 KYC workflow (reviewer decision or provider callback, service role).
No client write path. It is deliberately just the *gate* — detailed KYC
records, provider payloads, and document uploads live in a separate
`kyc_cases` table in Phase 8, so this flag never accretes provider logic.

---

## 12. Duration-in-hours architecture

`duration_hours integer not null check (duration_hours > 0)` on
`investment_plans` and `investments` is the **only** canonical duration.

- Admin enters hours (24 → 1 day, 8760 → 1 year). UI renders
  `"48 hours · 2 days"` style labels — formatting only, computed from hours.
- **Calendar safety:** maturity is `activated_at + duration_hours * interval '1 hour'`.
  Because the value is elapsed wall-clock hours on a `timestamptz`, there is
  **no calendar-boundary hazard** — DST, month lengths and leap years cannot
  skew it. This is precisely why hours were chosen as the canonical unit: it is
  sufficient for every supported duration *as long as durations remain
  elapsed-time quantities*.
- **The one caveat** (documented, not implemented): if the product ever needs
  *calendar* semantics ("12 months" meaning same-day-of-month), hours cannot
  express that — `8760h` drifts ~11h across a leap year. The current spec is
  elapsed-time returns, so hours suffice; a future calendar-tenor product would
  add a separate `tenor_months` column in its own migration rather than
  overloading `duration_hours`. Flagged as OQ-3.
- `@rentbrown/types` `Duration{value,unit}` stays as the *transport* shape; the
  adapter emits `{value: duration_hours, unit: "HOURS"}` and UI helpers derive
  friendly labels.

---

## 13. Constraints & indexes (structural integrity)

Beyond per-table notes above, the load-bearing checks:

| Invariant | Enforcement |
|---|---|
| Money ≥ 0 / > 0 as appropriate | `check` on every `*_minor` column |
| `roi_bps >= 0` on plan + investment | `check` |
| `duration_hours > 0` | `check` |
| `allocated + reserved ≤ total` on rounds | `check` |
| `principal = slots × slot_price` | `check` on investments |
| `maturity_value = principal + expected_profit` | `check` on investments |
| `closes_at > opens_at` on rounds | `check` |
| VERIFIED doc ⇒ reviewer present | `check` on property_documents |
| Unique slugs, references, `(plan_id, round_number)`, config `key` | unique constraints |
| Deleting a property/plan/round with dependents | `RESTRICT` FKs — no silent cascade of financial history |

No float columns anywhere; `bigint`/`integer` only for money and rates.

---

## 14. `admin_config` + `admin_config_history` — the configuration architecture

**Recommended design: a typed key registry** — one row per policy value — over
alternatives evaluated:

- *Wide table with one column per setting* — rejected: every new policy needs a
  migration; columns can't carry per-currency values cleanly; no per-key
  metadata.
- *Versioned `PolicySet` documents* (whole-set snapshots) — good for "policy
  versions" but heavy for Phase 3; a single-key edit would version the whole
  set. The registry's history table provides the same traceability per key.
  (The UI's `PolicySet.version` can be synthesized as `max(updated_at)`.)
- *Typed registry* — chosen: self-describing rows, per-key validation rules,
  per-currency keys, additive forever.

```sql
create type config_value_type as enum
  ('MONEY_MINOR','BPS','INTEGER','TEXT','BOOLEAN','STRING_LIST');

create table public.admin_config (
  key          text primary key,                 -- 'referral.signup_reward_minor'
  category     text not null,                    -- 'referrals' | 'withdrawals' | 'deposits' | 'platform'
  value_type   config_value_type not null,
  value        jsonb not null,                   -- typed payload, validated by RPC
  currency     currency_code,                    -- set when value_type = MONEY_MINOR
  description  text not null,
  is_active    boolean not null default true,
  updated_by   uuid references auth.users,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.admin_config_history (
  id          bigint generated always as identity primary key,
  key         text not null references public.admin_config,
  old_value   jsonb,
  new_value   jsonb not null,
  changed_by  uuid references auth.users,
  reason      text,
  request_id  text,
  created_at  timestamptz not null default now()
);
```

Flow: admin edits → `SECURITY DEFINER` RPC `set_admin_config(key, value,
reason, request_id)` → permission check (`policies.propose`/`SUPER_ADMIN` via
`has_admin_role`) → validate `value` against `value_type` (money ⇒ integer ≥ 0
+ currency present; bps ⇒ 0–10_000) → update row + insert history row + insert
`audit_log` row — **one transaction**. Reads: server-side RPC
`get_admin_config(keys[])` used by engines; admin UI reads rows via RLS.
Clients can *read* nothing more than what UI policies expose, and can never
write.

Historical financial records are untouched by config changes — investments
carry snapshots (§9), and future transactions will record the fee/rate applied
at execution time. Config governs *future* behaviour only.

**Seeded defaults (deterministic, `ON CONFLICT DO NOTHING`):**

| key | type | value | note |
|---|---|---|---|
| `referral.signup_reward_minor` | MONEY_MINOR | `150000` NGN | ₦1,500 — D-001 |
| `referral.qualifying_deposit_minor` | MONEY_MINOR | `5000000` NGN | ₦50,000 |
| `referral.deposit_referral_bps` | BPS | `100` | 1% |
| `referral.deposit_referral_cap_minor` | MONEY_MINOR | `1000000` NGN | ₦10,000 per referred user |
| `withdrawal.fee_bps` | BPS | `500` | 5% |
| `withdrawal.fee_cap_minor.NGN` | MONEY_MINOR | `1000000` | ₦10,000 cap |
| `withdrawal.fee_cap_minor.USD` | MONEY_MINOR | `1000` | $10 cap — per-currency keys |
| `withdrawal.min_minor.NGN` | MONEY_MINOR | `500000` | ₦5,000 mock default |
| `deposit.min_minor.NGN` | MONEY_MINOR | `100000` | ₦1,000 mock default |
| `platform.supported_currencies` | STRING_LIST | `["NGN","USD"]` | |

---

## 15. RBAC integration & `audit_log`

**No `isAdmin` flag anywhere** — Phase 2's `admin_roles` + permission bundles
stand. Phase 3 adds one helper:

```sql
public.has_admin_role(roles admin_role[])  -- caller's role ∈ set
```

so policies can say "catalogue managers" (`OPERATIONS_ADMIN`, `SUPER_ADMIN`)
rather than "any admin". Permission → role mapping stays in
`ADMIN_PERMISSIONS_BY_ROLE` (`@rentbrown/types`) for now; Phase 10 may move
bundles into the DB — noted, not decided.

Role × capability matrix (proposed server-side enforcement):

| Capability | Roles |
|---|---|
| Manage properties/plans (`catalogue.manage`) | OPERATIONS_ADMIN, SUPER_ADMIN |
| Manage rounds (`rounds.manage`) | OPERATIONS_ADMIN, SUPER_ADMIN |
| Review property evidence | OPERATIONS_ADMIN, SUPER_ADMIN (+ KYC_REVIEWER? — OQ-5) |
| Edit `admin_config` (`policies.propose`) | SUPER_ADMIN (proposal flow Phase 10) |
| View finance (`finance.read`) | FINANCE_ADMIN, SUPER_ADMIN |
| Financial operations | FINANCE_ADMIN, SUPER_ADMIN — Phase 4+ |
| Review KYC (`kyc.review`) | KYC_REVIEWER, SUPER_ADMIN — Phase 8 |
| Read audit log (`audit.read`) | SUPPORT, FINANCE_ADMIN, SUPER_ADMIN |

### `audit_log`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `actor_id` | uuid FK → `auth.users`, NULL | NULL = system |
| `actor_role` | text | role at time of action (snapshot — roles change) |
| `action` | text | e.g. `property.publish`, `config.update`, `round.close` |
| `entity_type` / `entity_id` | text | polymorphic target |
| `result` | `audit_result` | SUCCESS/DENIED/FAILED |
| `request_id` | text | correlation/idempotency |
| `metadata` | jsonb | `{old:…, new:…}` diff + context — never secrets |
| `created_at` | timestamptz | |

Append-only (no UPDATE/DELETE anywhere). No IP/device capture in Phase 3 —
privacy-minimal; revisit only if a concrete security requirement appears.

**Indexes:** `(entity_type, entity_id)`, `(actor_id, created_at desc)`,
`(created_at desc)`.

---

## 16. RLS boundaries

Pattern established in 0001 continues: `enable row level security` + narrow
`SELECT` policies + **zero client write policies** on authoritative tables.
All mutations flow through `SECURITY DEFINER` RPCs (explicit permission
checks, audit rows, transactions).

| Table | Public/anon | Investor (authenticated) | Admin | Client writes |
|---|---|---|---|---|
| `properties` | SELECT where `publication_status='PUBLISHED'` | same | SELECT all | none — RPC only |
| `property_documents` | SELECT published-property docs, `status IN ('IN_REVIEW','VERIFIED')`; `storage_path` column revoked from `anon`/`authenticated` | same | SELECT all | none — RPC |
| `property_updates` | SELECT where parent property published | same | all | RPC |
| `investment_plans` | SELECT where `status='PUBLISHED'` | same | all | RPC |
| `investment_rounds` | SELECT where parent plan published | same | all | RPC |
| `investments` | — | SELECT own (`user_id = auth.uid()`) | `investments.read` roles | none |
| `investment_events` | — | SELECT events on own investments | read roles | none |
| `profiles` (new cols) | — | own row (existing policy) | all | flag cols never in UPDATE grant |
| `admin_config` | — | — | `policies.read` roles | none — `set_admin_config` RPC |
| `admin_config_history` | — | — | `policies.read`/`audit.read` | none |
| `audit_log` | — | — | `audit.read` roles | none — written inside RPC transactions |

**RLS vs business logic, explicitly:** RLS answers *"may this session see this
row?"* Business rules — eligibility, capacity math, status transitions, config
validation — live in `SECURITY DEFINER` RPCs/service functions. RLS is the
perimeter; RPCs are the operations. A client that somehow bypasses the API
still cannot mutate a single domain row.

---

## 16.4 Multi-currency

`currency_code` enum `{NGN, USD}`; NGN default. Currency is a property of each
**plan/round/investment** (the denomination of its money columns) and of each
money-valued `admin_config` row. No conversion logic, no FX rates, no mixed-
currency arithmetic anywhere — a plan's `currency` must equal its rounds' and
investments' `currency` (asserted in RPCs; investments inherit from the round).
`profiles` gains no currency field yet — wallet/account currency lands with
Phase 4 ledger accounts. `UserProfile.preferences.displayCurrency` remains a
UI preference.

---

## 17. Seed & migration strategy, future compatibility

### 17.2 Seed data

- **`admin_config`:** seed the §14 defaults inside the migration with
  `INSERT … ON CONFLICT (key) DO NOTHING` — deterministic, idempotent,
  production-appropriate (these are real policy defaults, not demo data).
- **Domain records (properties/plans/rounds/investments):** **do not seed in
  the production migration.** The shipped UI renders the full catalogue from
  `mock-data` fixtures today; writing those fictional assets into Postgres
  risks them being mistaken for real offerings. Recommendation: an optional,
  clearly-labelled dev seed (`scripts/seed-demo.mjs` or
  `supabase/seed.demo.sql`, marked `DEMO — not for production`) applied only to
  local/dev databases — **pending approval, OQ-6**.

### 17.3 Migration strategy (Phase 3B, proposed)

Forward-only; `0001_foundation.sql` is untouched.

| File | Contents | Depends on |
|---|---|---|
| `0002_domain_schema.sql` | enums, tables, constraints, indexes, triggers (`updated_at`, `sync_email_verified`, `has_admin_role`) | 0001 |
| `0003_domain_rls.sql` | `enable row level security`, policies, column grants/revokes | 0002 |
| `0004_admin_config_seed.sql` | §14 defaults, `ON CONFLICT DO NOTHING` | 0003 |

Verification: extend `scripts/verify-migrations.mjs` with Phase 3 checks —
capacity check rejects over-allocation, VERIFIED-doc check requires reviewer,
client cannot UPDATE `investments.roi_bps`, email-sync trigger fires, config
RPC validates `value_type`. Apply order → embedded Postgres locally → hosted
Supabase once `DATABASE_URL` is rotated (§2 blocker). Rollback is
"restore from backup / forward-fix" — no down-migrations, matching existing
convention.

### 17.4 Future financial compatibility

- **Phase 4 ledger:** entries reference `investments.id` as an entity; no Phase
  3 column predicts ledger shape, and `reference`/`request_id` patterns are
  already idempotency-ready.
- **Phase 5 deposits:** `funding_source` + `payment_reference` bridge until a
  `payment_id` FK is added by that phase's migration.
- **Phase 6 engine:** §8's conditional-update capacity path needs no schema
  change — the counters and check constraint already exist.
- **Phase 7 maturity:** `investments(status, matures_at)` partial index is the
  due-scan; `duration_hours` + `activated_at` define maturity unambiguously.
- **Phase 8 KYC/withdrawals:** `kyc_verified` gate + `admin_config` withdrawal
  keys already exist; `kyc_cases` arrives with that phase.
- **Phase 9 referrals:** `profiles.referred_by` + `referral.*` config keys are
  the hooks; reward tables arrive then.

Phase 3 deliberately creates **no** wallet, ledger, deposit, withdrawal,
notification, or rewards tables.

---

## 18. What Phase 3A intentionally did NOT implement

No tables, no migrations, no RPCs, no adapter changes, no seeds — this
document is the entire deliverable. Deferred to later phases: wallets/ledger
(4), deposits/payments (5), purchase & capacity engine (6), maturity (7),
KYC cases & withdrawals (8), referrals/rewards (9), notifications & policy
proposal workflow (10), storage-backed evidence files (11).

---

## 19. Risks

| # | Risk | Mitigation |
|---|---|---|
| R-1 | **Hosted DB credentials stale (28P01)** — Phase 3B can verify locally but cannot apply to hosted Supabase | Rotate DB password / fix `DATABASE_URL` before Phase 3B apply step |
| R-2 | `email_verified` denormalized from `auth.users` can drift if the trigger misses an event | Read path keeps preferring live `email_confirmed_at`; column is for RLS/joins; verifier asserts sync |
| R-3 | `jsonb` config values weakly typed — a bad `set_admin_config` payload could poison reads | RPC validates against `value_type`; history rows enable instant rollback; verifiers test each type |
| R-4 | Polymorphic `audit_log.entity_id` is `text`, not FK — no referential integrity | Accepted: audit must outlive entity deletion. `entity_type` constrains interpretation |
| R-5 | `NEARING_CAPACITY` as a stored status can disagree with counters | Option: derive it in the read projection instead — OQ-4 |
| R-6 | Free-text `property_type` allows inconsistent display values | Acceptable now (editorial copy); revisit if filtering needs a vocabulary — OQ-1 |
| R-7 | Public read of `property_documents` leaks metadata for docs in review | Policy exposes only non-sensitive fields; `storage_path` column revoked from public roles; `review_note` never exposed |
| R-8 | `reserved_slots` can leak if checkouts are abandoned | Phase 6 must add expiry sweeps; schema stores the counter now so leaks are visible |

## 20. Open questions (need approval before Phase 3B)

- **OQ-1** `property_type`: free text (current proposal) or controlled enum?
- **OQ-2** `roi_bps` upper bound: `>= 0` only, or a sanity cap (e.g. ≤ 10 000 = 100%)?
- **OQ-3** Confirm durations are *elapsed-time* only. If any plan needs
  calendar months ("same day next month"), Phase 3B must add `tenor_months` —
  otherwise hours-only stands.
- **OQ-4** `NEARING_CAPACITY`: stored status or derived in the read model?
- **OQ-5** Should `KYC_REVIEWER` also review *property* evidence, or is that
  strictly `OPERATIONS_ADMIN`/`SUPER_ADMIN`?
- **OQ-6** Demo seed file (`scripts/seed-demo.mjs`, clearly marked) — approved
  or keep dev fixtures mock-only?
- **OQ-7** Withdrawal minimum for USD wallets: seed `withdrawal.min_minor.USD`
  (mock has NGN only) — proposed $10 = `1000`. Confirm value.
- **OQ-8** Admin permission for editing `admin_config`: restrict to
  `SUPER_ADMIN` until the Phase-10 proposal workflow exists — confirm.

## 21. Phase 3B implementation plan (proposed sequence)

1. `0002_domain_schema.sql` — enums → tables → constraints → indexes →
   triggers (`touch_updated_at` reuse, `sync_email_verified`, `has_admin_role`)
2. `0003_domain_rls.sql` — enable RLS, policies, column grants/revokes
3. `0004_admin_config_seed.sql` — idempotent defaults
4. Extend `scripts/verify-migrations.mjs` — Phase 3 check suite
5. Verify on embedded Postgres; apply to hosted Supabase after credential fix
6. *Then* (separate work stream): `@rentbrown/supabase` domain adapters —
   public catalogue first (SSG parity with mock), then investor reads

## 22. Phase 3A report — summary of inspection

**Inspected:** `supabase/migrations/0001_foundation.sql` (entire),
`packages/supabase/*` (gateway, profile, admin, investor-data-source, config),
`packages/types` (domain + admin contracts), `packages/mock-data` fixtures
(catalogue, investor, admin), `scripts/migrate.mjs`, `scripts/verify-migrations.mjs`,
`docs/DECISIONS.md`, `docs/ROADMAP.md`, root/app env examples.

**Already exists:** identity + RBAC foundation, referral attribution, least-
privilege RLS pattern, `updated_at` trigger helper, auth gateway, admin actor
resolution, full UI type vocabulary (which the enums deliberately mirror).

**Proposed:** 6 new domain tables + `property_updates` + `admin_config` +
`admin_config_history` + `audit_log`, 2 profile columns (+2 timestamps), 10 new
enums, 2 new helper functions, full RLS matrix, config + seed + migration
strategy.

**Key decisions:** hours-canonical duration; snapshot economics on
investments; typed config registry; derived round availability; append-only
events/audit; trigger-synced `email_verified`; server-gated `kyc_verified`;
no fake production investments.

**Not implemented:** everything in §18 — Phase 3A is architecture only.
