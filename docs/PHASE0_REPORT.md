# RentBrown V2 — Phase 0 Report: Context, Assessment & Plan

**Date:** 2026-09-24 · **Repository:** `posh-media/rentbrownv2-vision` (canonical, fresh start) · **Status:** Phase 0 complete; Phase 1 (investor UI) executed against this plan.

Sources inspected: `RENT_BROWN_MASTER_CONTEXT_AND_MEGA_AUDIT.md` (root), `posh-media/rentbrown-v2-vision` (Lovable prototype, reference), `posh-media/rentbrownV2` (old monorepo, reference/archive).

---

## 1. Current project assessment

The canonical repository started **empty** apart from the master brief. Nothing to preserve, nothing to migrate. Every architectural decision below is deliberate for the new direction: **Turbo monorepo · Web + Mobile + Admin + Site · Supabase (Phase 2+) · Vercel (web) · Expo (mobile)**.

## 2. Vision repository assessment (`rentbrown-v2-vision`)

| Aspect | Finding | Disposition |
| --- | --- | --- |
| Stack | TanStack Start + Vite, Tailwind v4, shadcn/Radix primitives, lucide, recharts, TanStack Query | Keep the Tailwind v4 + Radix + lucide + TanStack Query direction; move to Next.js for Vercel + admin/site parity |
| Design language | Warm cream canvas, brown structural colour, border-first `financial-card`, tabular numerals, uppercase eyebrows, restrained shadows, `Home · Explore · Portfolio · Wallet · Account` navigation, DM Serif Display hero heading | **Reuse and formalise as tokens** |
| Screens | 27 routes: landing, explore, opportunity details, dashboard, checkout, payment, portfolio (active/matured), wallet (+deposit/withdraw/transactions), referrals (+history), account, KYC, notifications, security, settings, help, how-it-works, proof, company, FAQ, legal | Reuse IA and copy tone; rebuild every screen with typed data |
| Imagery | Three warm, high-quality property photographs (Ikoyi, Lekki, Wuse) | **Reuse** (copied into web/site/mobile assets) |
| Mock data | String-typed money (`"₦100,000"`), ROI as `"16.5%"`, page-level computation (`total*.165`) | **Redesign**: integer minor units + basis points, quotes come from a data source |
| Code structure | Three giant files (`rentbrown-pages.tsx` ~60 lines of 1,000+ chars each), inline arrays, no component boundaries | Rebuild with feature folders |
| Defects | `text-success`, `bg-success-soft`, `text-warning` classes used but never defined → status pills silently render without colour; generic slate `sidebar` tokens; dark theme is unbranded shadcn default | Fixed by the token system |
| Mobile | Bottom tab bar only; otherwise compressed desktop | Design mobile intentionally (Expo app + mobile-web patterns) |
| States | Demo toggles for KYC/payment/empty, no skeletons, no error states | Full state matrix via scenarios |

**What makes it feel like RentBrown:** the cream/brown restraint, the "principal vs expected profit vs maturity value" triplet, evidence-first property cards, plain financial language, no urgency theatre. These are preserved and strengthened.

## 3. Old repository assessment (`rentbrownV2`)

| Area | Old repo | Decision |
| --- | --- | --- |
| Repository role | Supabase + NestJS + Postgres + pg-boss worker monorepo, ~1 commit of skeleton apps | Historical reference only |
| Backend | Postgres ledger, NestJS API, Supabase Auth, Smile Identity, Paystack/Korapay | **Not carried forward.** Backend direction is Supabase (D-002); no backend in Phase 1 |
| Monorepo | pnpm + Turborepo, `apps/{mobile,web,admin,site,api,worker}`, `packages/{domain,types,validation,config,design-tokens,api-client,providers,database,ui}` | Learn from layout; drop `api`, `worker`, `api-client`, `providers`, `database`, `domain` |
| Design tokens | Brand 50–900 scale, warm neutrals, semantic light/dark maps, type scale, `tokensToCssVars` | **Concept reused**, re-authored with glass, chart, six-tone status vocabulary and the brief's five anchors fixed |
| Types | `Property → InvestmentPlan → InvestmentRound → Investment`, wallet accounts `AVAILABLE/RESERVED/BONUS/BONUS_PENDING`, minor-unit strings, bps | **Vocabulary reused**, reshaped as UI read-models (`@rentbrown/types`) |
| Docs | `UX_IA_SPEC.md`, `DESIGN_DIRECTION.md`, `FINANCIAL_MODEL.md`, `DECISIONS.md` | Mined for IA, status vocabulary, fee/referral parameters used in mock policy (5 % withdrawal fee capped ₦10,000; ₦1,500 signup reward — corrected from the old repo's ₦5,000) |
| UI code | Inline-styled skeleton pages, no design | Nothing reused |
| Lessons | Client must never author balances; duplicate screen variants signal unsettled IA; a schema is not a feature | Encoded in the data-source boundary |

Notable conflict: old `DESIGN_DIRECTION.md` "explicitly rejected glassmorphism". The current brief asks for **selective** glass. The brief wins; glass is used only where it has a purpose (§4).

## 4. Design system extracted and evolved

Package: `packages/design-tokens` (`tokens.ts` = source of truth; `theme.css` = Tailwind v4 theme; a lint script keeps them in sync).

- **Colour anchors (fixed):** primary `#5D4037`, secondary `#8D6E63`, canvas `#FFFDF8`, text `#2D2624`, success `#388E3C`. Brand scale 50–950; warm cream neutrals; six status tones — `success · warning · error · info · pending · neutral` — each with `fg/bg/border/dot`; info uses brand brown (never blue); gold accent for premium highlights only.
- **Typography:** Plus Jakarta Sans for all product UI (400–800); DM Serif Display **only** for marketing/landing display headings (continuity with the vision). Dedicated `figureXl/Lg/Md/Sm/Xs` styles with tabular numerals for money.
- **Spacing:** 4pt scale. **Radius:** 6/8/12/16/24 + pill (cards 12–16, sheets 24). **Shadows:** warm-tinted, xs–lg; borders do most elevation work.
- **Glass:** `glass.surface/strong/soft/dark` translucent warm surfaces + hairline borders + blur 8/16/24. Applied to: sticky headers, mobile tab bar, bottom sheets/dialogs, wallet balance hero, image overlays on opportunity cards/hero, notification panel. **Not** applied to tables, forms, body cards or admin.
- **Motion:** 150–250 ms ease-out; no celebratory money animations; reduced-motion respected.

### Improvements over the vision
Hierarchy (one hero figure per screen), a real card system (opportunity, investment, wallet-balance, stat, transaction row), consistent status pills, skeletons that mirror layout, designed empty/error states, typed money formatting (`₦146,250` never `₦146250.00`), accessible focus rings, 44px touch targets, mobile-first navigation, sticky mobile actions, bottom sheets for confirmations.

## 5. Web + Mobile architecture plan

```
apps/web     Investor Web — Next.js App Router, Tailwind v4, @rentbrown/ui, TanStack Query, Vercel
apps/mobile  Investor Mobile — Expo SDK 57, expo-router, RN StyleSheet + tokens, expo-blur, TanStack Query
apps/admin   Admin/Operations — Next.js boundary shell (dense operational layout, sparse glass)
apps/site    Marketing — Next.js boundary shell (editorial landing composition)
packages/design-tokens  tokens.ts + theme.css + css-var emitter
packages/types          read-model contracts + InvestorDataSource interface (the backend seam)
packages/utils          money/date/status display formatting (platform-neutral)
packages/mock-data      fixtures + createMockDataSource({ scenario, latencyMs, failing })
packages/validation     zod form schemas shared by web + mobile
packages/ui             WEB-ONLY React primitives shared by web/admin/site
packages/config         tsconfig + eslint presets
```

**Sharing rule:** share tokens, types, utils, mock data, validation. Do **not** share rendered components between Next.js and React Native — mobile has its own primitives in `apps/mobile/src/ui` that consume the same tokens. This avoids RN-web/NativeWind coupling while keeping one design language.

**Navigation:** Web — glass sticky header + primary nav (Home · Explore · Portfolio · Wallet · Account), bell for notifications, mobile-web bottom tab bar under `lg`. Mobile — 5 bottom tabs with glass bar, stacks per tab, modal stack for checkout/deposit/withdraw, bottom sheets for confirmations.

**Data layer:** every screen reads through TanStack Query hooks (`useDashboard`, `useWallet`, …) that call an `InvestorDataSource` from context. Mutations send *intent* (`quoteInvestment`, `submitInvestment`, `requestWithdrawal`) and render the returned result. No component multiplies money, checks capacity, or decides eligibility.

**Mock strategy:** one `createMockDataSource()` per app with a dev-only scenario switcher (`default`, `new-investor`, `kyc-pending`, `kyc-rejected`, `no-opportunities`, `signed-out`), simulated latency for skeletons, and `failing: [...]` for error states. Payment/withdrawal status screens also accept a `state` param for design review.

## 6. Turbo monorepo plan

pnpm 9 workspaces (`apps/*`, `packages/*`), Turborepo tasks `build · dev · lint · typecheck · test`. Packages are consumed as TypeScript source (no `dist`), transpiled by Next (`transpilePackages`) and Metro. `.npmrc` uses `node-linker=hoisted` for Expo compatibility. Each Next app builds standalone from the root → Vercel project per app with root directory `apps/<name>`.

## 7. Backend compatibility plan (Supabase — supersedes the original Firebase plan)

- The **only** seam is `InvestorDataSource` (`@rentbrown/types`). Phase 2 implemented `createSupabaseInvestorDataSource()` — real Supabase Auth session + `public.profiles` — with domain reads delegated to the mock source until per-domain Postgres adapters arrive. Server-authoritative writes remain the rule so the client never mutates financial state.
- Types already use integer minor units, bps, ISO UTC strings — Postgres-friendly, float-free.
- Idempotency keys are generated client-side for every mutation input.
- Historical note: this section originally planned Firebase. Superseded by `docs/DECISIONS.md` D-002 (Supabase + PostgreSQL).

## 8. UI screen inventory

**Public/auth (web):** landing redirect → dashboard (marketing lives in `apps/site`), Login, Signup, Forgot password, Explore (guest-browsable), Opportunity details, Legal (terms/privacy/risk), How it works, Property proof, FAQ, Company (lean pages sharing content with `site`).
**Investor web:** Dashboard, Explore, Opportunity details, Checkout, Payment (pending/confirming/success/failed), Portfolio (active/matured/empty), Investment details (active/matured/pending), Wallet, Transactions (+detail sheet), Deposit (method → instructions → status), Withdraw (amount → destination → review → PIN → status), Withdrawal detail/status, Notifications, Referrals, Referral history, Account, Profile, KYC (5 states), Security (PIN, password, devices), Settings, Help.
**Investor mobile:** Onboarding, Login, Signup, Home, Explore, Opportunity details, Checkout (+PIN sheet), Payment result, Portfolio, Investment details, Wallet, Transactions, Deposit, Withdraw, Withdrawal status, Notifications, Referrals, Account, KYC, Security, Settings, Help.
**Admin/Site:** boundary shells only (layout, navigation skeleton, one page each).

## 9. Reusable component strategy

Web (`@rentbrown/ui`): `Button`, `Card`, `StatusPill`, `Skeleton`, `GlassSurface`, `MoneyFigure`, `StatCard`, `DataRow`, `EmptyState`, `StatePanel`, `ProgressBar`, `Dialog`, `Sheet` (vaul), `Tabs`, `Input/MoneyInput/PinInput`, `Select`, `Toast`. App-level feature components: `OpportunityCard`, `InvestmentCard`, `WalletBalanceCard`, `TransactionRow`, `KycStatusPanel`, `ReferralCodeCard`. Mobile mirrors the same names in `apps/mobile/src/ui` with RN implementations. Only components used ≥2 places or encoding a design rule are abstracted.

## 10. Risks and decisions

| Risk | Decision |
| --- | --- |
| Web/RN component sharing | Don't. Share tokens/types/utils only. |
| Money formatting drift | Single `formatMoney` in `@rentbrown/utils`; money never stored as strings |
| Mock coupling | Screens consume `InvestorDataSource`; fixtures live in one package; scenarios replace inline demo toggles |
| Auth assumptions | Mock `Session` only; route guards are UI conveniences, never security |
| Future KYC | `KycSummary` with five states and step list; no provider fields |
| Glass legibility | Glass only over imagery/brand surfaces or as chrome; text on glass always on `surfaceStrong` or dark scrim; admin ≈ none |
| Localisation/currency | `CurrencyCode` in every money field; NGN only in fixtures; formatter supports USD |
| Expo + pnpm | Hoisted node-linker; Metro monorepo config |
| Latest-major churn (Next 16, Expo 57) | Generated via official CLIs; pinned versions recorded in `package.json` |
| Legal copy | All content labelled prototype/fictional; no registrations or approvals implied |

## 11. Phase 1 implementation plan (executed)

1. Monorepo scaffold + token pipeline + `@rentbrown/ui` primitives.
2. Contracts: types, utils, mock data with scenarios.
3. Investor Web: shell/nav, auth, dashboard, explore, details, checkout/payment.
4. Investor Web: portfolio, wallet flows, referrals, notifications, account/KYC/security/settings/help; state matrix.
5. Investor Mobile: tab shell, onboarding/auth, and the same journeys with mobile-native patterns.
6. Admin + Site boundary shells.
7. Verification: typecheck, lint, build, Expo export, responsive review at desktop/tablet/mobile.
8. Report and **stop** before any backend work.
