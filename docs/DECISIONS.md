# Decisions

Append-only log of product/platform decisions. Newest entries at the bottom.

## D-001 Referral signup reward default = ₦1,500 (2026-09)

The authoritative default **signup** referral reward is **₦1,500** (150,000 minor
units), superseding the historical ₦5,000 figure carried in the old repository.

Referral policy distinguishes four separate values — never conflate them:

- **Signup reward** — fixed ₦1,500 credited when a referred user qualifies.
- **Qualifying deposit** — the referred user's first deposit must reach ₦50,000.
- **Deposit-referral rate** — 1% (100 bps) of the referred user's qualifying deposits.
- **Deposit-referral cap** — up to ₦10,000 per referred user.

The deposit-referral rate/cap and qualifying deposit are illustrative mock
defaults pending confirmation. Unrelated ₦5,000 values (minimum withdrawal,
investment limits, deposit amounts) are unchanged.

Status: accepted · Scope: `ReferralPolicy` in `@rentbrown/types`, mock fixtures,
referral surfaces on web and mobile.

## D-002 Backend = Supabase + PostgreSQL (supersedes Firebase) (2026-09)

**Supabase is the official backend direction for RentBrown V2.** The Phase 0/1
plan anticipated Firebase; that direction is superseded — no Firebase code was
ever written, so nothing is removed, only re-pointed.

Concretely:

- **Auth:** Supabase Auth (email+password; email confirmation honoured).
- **Database:** Supabase PostgreSQL. Identity foundation lives in
  `public.profiles` (username, display name, account status, referral code,
  `referred_by`) and `public.admin_roles` (role grants — never an `isAdmin`
  flag). Migrations: `supabase/migrations/*.sql` applied by
  `scripts/migrate.mjs` against `DATABASE_URL`.
- **Authorization:** Row Level Security, least privilege. Users read their own
  profile and may update only `username`, `display_name`, `phone`; status and
  referral fields are server-managed. `admin_roles` is service-role write only;
  clients can read just their own grant.
- **Client architecture:** `@rentbrown/supabase` — `AuthGateway` (identity
  seam), `createSupabaseInvestorDataSource` (real auth + delegated domain
  reads), `resolveAdminActor`. Next.js apps use `@supabase/ssr` cookie
  sessions + `proxy.ts`; mobile uses `supabase-js` + AsyncStorage.
- **Data-source strategy:** `InvestorDataSource`/`AdminDataSource`/`PublicCatalogueSource`
  remain the app-facing interfaces. Auth methods are real; domain reads stay
  mock until the domain phases (Phase 3+) replace them adapter-by-adapter.
- **Deferred:** Supabase Storage (property evidence — Phase 11) and Edge
  Functions (server-authoritative writes — Phases 4+).

Status: accepted · Scope: `packages/supabase`, `supabase/migrations`, env
architecture, auth surfaces on web/mobile/admin.

## D-003 Canonical investment duration = hours; admin config = typed registry (2026-09)

Two Phase 3 decisions, locked by the Phase 3A proposal and implemented in 3B:

1. **Duration is stored as `duration_hours` (integer, elapsed-time semantics).**
   Admins author durations in hours (24 → 1 day, 8760 → 1 year); UI derives
   friendly labels. Maturity will be `activated_at + duration_hours * interval '1 hour'`
   — immune to DST/month-length drift. Calendar-tenor products (same-day-of-month)
   are out of scope; they would need a separate `tenor_months` column later.
2. **Business configuration lives in `admin_config`, a typed key registry** —
   `key + value_type + jsonb value + currency`, not a wide settings table. New
   policy values ship without migrations. Writes go exclusively through
   `set_admin_config()` (SUPER_ADMIN): validate → update → `admin_config_history`
   → `audit_log`, atomically. Reads via `get_admin_config()`. Historical records
   never depend on live config (investments carry snapshots).

Status: accepted · Scope: `supabase/migrations/0002–0004`, Phase 4+ engines.
