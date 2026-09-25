# RentBrown V2 — Phase Roadmap

Order reflects the current development plan. Each phase is gated on explicit
approval; nothing below is committed work until reviewed.

---

## PHASE 0 — Product Context & Planning — COMPLETED

Product understanding, architecture decisions, design review, repository review.
Output: `docs/PHASE0_REPORT.md`, monorepo foundation, shared contracts.

## PHASE 1 — Complete Product UI/UX Foundation — COMPLETE

| Surface | Status |
| --- | --- |
| Investor Web (`apps/web`, Next.js) | Complete — full investor journeys, SSR public pages, SEO |
| Investor Mobile (`apps/mobile`, Expo) | Complete — tabs + modals, same data seam |
| Admin Web (`apps/admin`, Next.js) | Complete — operations UI on mock `AdminDataSource` |
| Marketing Site (`apps/site`, Next.js) | Complete — editorial public site, SSR + SEO |
| Shared | Design system, mock data, shared types, responsive system, SEO/SSR foundation, Vercel-ready monorepo |

Phase 1 shipped with no backend, payments, KYC provider or ledger — all data
was mock `DataSource` implementations behind typed interfaces.

## PHASE 2 — Supabase Foundation + Authentication — CURRENT

Supabase project integration, Supabase Auth (registration, login, logout,
session handling, email verification, password reset/change), `public.profiles`
(username, display name, account status, referral code, `referred_by`),
`public.admin_roles` RBAC foundation, least-privilege RLS, `@rentbrown/supabase`
gateway + adapters, cookie sessions on web (`@supabase/ssr` + `proxy.ts`),
AsyncStorage sessions on mobile, environment architecture, `scripts/migrate.mjs`.
Financial logic intentionally deferred. See `docs/DECISIONS.md` D-002.

## PHASE 3 — Core Domain & PostgreSQL Data Model — NEXT

users, profiles, properties, property evidence, investment plans, investment
rounds, investments, wallets, transactions, deposits, withdrawals, referrals,
rewards, notifications, policies, audit logs — schema + RLS + adapter swap-ins
for the domain halves of `InvestorDataSource`/`AdminDataSource`. Exact order
finalised during Phase 2 review.

Phase 3A (schema architecture & review): `docs/phases/PHASE_3A_SCHEMA_PROPOSAL.md`
— pending approval; no domain tables implemented yet.

## PHASE 4 — Ledger + Wallet

Double-entry financial model, balances (available / reserved / bonus /
pending), immutable entries, reconciliation, idempotency, financial invariants.

## PHASE 5 — Deposits + Payment Providers

Payment abstraction, initiation, verification, webhook handling, idempotency,
deposit states, refunds/reversals, reconciliation.

## PHASE 6 — Investment Engine

Eligibility, wallet investment, external-payment investment, capacity control,
concurrency protection, per-user limits, investment snapshots, state machine.

## PHASE 7 — Maturity Engine

Duration calculation, maturity dates, scheduled processing, profit
calculation, maturity value, ledger posting, idempotency,
retry/reconciliation.

## PHASE 8 — KYC + Withdrawals

KYC abstraction + provider integration, withdrawal validation, transaction
PIN, withdrawal reservation, admin payout, withdrawal fees, dynamic minimum
withdrawal, rejection/cancellation flows.

## PHASE 9 — Referrals + Rewards

Signup reward (**default ₦1,500** — see `docs/DECISIONS.md` D-001), deposit
reward, qualification, caps, pending/qualified rewards, reversal handling,
reward receivable, reward withdrawal/investment, FX handling where applicable.

## PHASE 10 — Notifications + Admin Operations

Push, in-app, email, admin Telegram, admin backend integration, RBAC,
permissions, audit logging, operational workflows.

## PHASE 11 — Trust, Legal + Property Evidence

Company information, legal documents, terms, privacy, risk disclosures,
investment-specific disclosures, property proof, reporting.

## PHASE 12 — Full System QA + Security + Reconciliation

Concurrency, duplicate payments/webhooks, refunds, reversals, capacity
exhaustion, failed investments, maturity retries, withdrawal failures, ledger
reconciliation, authn/authz, IDOR, RBAC, rate limiting, replay protection,
privilege escalation, recovery scenarios.

## PHASE 13 — Production Deployment + Launch

Supabase production configuration, Vercel production, mobile production
builds, domains, environment variables, monitoring, backups, security review,
controlled rollout, production verification.
