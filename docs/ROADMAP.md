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

No backend, Firebase, payments, KYC provider or ledger exists. All data is
mock `DataSource` implementations behind typed interfaces.

## PHASE 2 — Authentication + Firebase Backend Foundation — NEXT

Firebase project integration, Firebase Auth (registration, login, logout,
session handling, email verification, password reset), user/profile records,
username, referral-code foundation, account status, authentication guards,
server-side authorization, Firestore architecture, Cloud Functions /
server-side operations, secure data access, environment configuration,
initial security rules, and the backend architecture future financial
operations require.

## PHASE 3 — Core Domain & Firestore Data Model

users, profiles, properties, property evidence, investment plans, investment
rounds, investments, wallets, transactions, deposits, withdrawals, referrals,
rewards, notifications, policies, audit logs. Exact order finalised during
Phase 2 review.

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

Firebase production configuration, Vercel production, mobile production
builds, domains, environment variables, monitoring, backups, security review,
controlled rollout, production verification.
