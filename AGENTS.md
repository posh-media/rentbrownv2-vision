# RentBrown V2 — agent notes

Nigerian-first property-investment platform. Canonical repo (fresh start).
Product source of truth: `RENT_BROWN_MASTER_CONTEXT_AND_MEGA_AUDIT.md`. Plan: `docs/PHASE0_REPORT.md`.

## Commands (Node ≥ 20, pnpm 9.15.9)

```bash
pnpm install
pnpm typecheck            # turbo → tsc per workspace
pnpm lint                 # eslint + design-tokens css-sync check
pnpm build                # Next apps (web :3000, admin :3002, site :3003)
pnpm --filter @rentbrown/web dev
pnpm --filter @rentbrown/mobile start          # Expo dev server (scan with Expo Go / dev build)
pnpm --filter @rentbrown/mobile exec expo export --platform android   # bundle validation
pnpm --filter @rentbrown/mobile exec npx expo-doctor
```

## Layout

```
apps/web      Investor Web (Next.js App Router, Tailwind v4)      → Vercel
apps/mobile   Investor Mobile (Expo SDK 57, expo-router)           → EAS
apps/admin    Admin / Operations (Next.js) — boundary shell
apps/site     Marketing site (Next.js) — boundary shell
packages/design-tokens  tokens.ts (source of truth) + theme.css (Tailwind v4 theme) + css var emitter
packages/types          UI read-model contracts + `InvestorDataSource` (the future Firebase seam)
packages/utils          platform-neutral display formatting (money, dates, status labels)
packages/mock-data      fictional fixtures + `createMockDataSource({ scenario, latencyMs, failing })`
packages/validation     zod form schemas shared by web + mobile
packages/ui             WEB-ONLY React primitives (web/admin/site). Mobile has its own in apps/mobile/src/ui
packages/config         tsconfig + eslint presets
```

Packages are consumed as TypeScript source (no `dist`). `.npmrc` uses `node-linker=hoisted` for Expo.

## Rules

- **Client is never the financial authority.** Screens render projections from `InvestorDataSource`
  and send intent (`quoteInvestment`, `submitInvestment`, `requestWithdrawal`). No component computes
  balances, capacity, profit, fees or eligibility. Mock "server" logic lives only in `packages/mock-data`.
- Money = integer minor units (`MinorUnits`), rates = basis points, dates = ISO UTC strings.
  Format with `@rentbrown/utils` (`formatMoney`, `formatBps`, `formatDate`…). Never store money as strings.
- Principal, expected profit and maturity value are always separate figures. Say "expected", never "guaranteed".
- Status colours use the six locked tones (`success · warning · error · info · pending · neutral`).
- Tokens: edit `packages/design-tokens/src/tokens.ts`, mirror in `theme.css`; `pnpm lint` checks sync.
  Components use semantic utilities (`bg-primary`, `text-muted-foreground`, `glass`) — never raw hex.
- Glass/blur only for chrome and overlays (headers, tab bars, sheets, dialogs, image overlays, wallet hero).
  Never on tables, forms or body cards. Admin uses almost none.
- Fonts: Plus Jakarta Sans for product UI; DM Serif Display only for marketing/display headings.
- Do not share rendered components between Next.js and React Native. Share tokens/types/utils/mock-data/validation.
- All fixture data is fictional and labelled as such. Never imply real properties, registrations or approvals.
- **Out of scope until approved:** Firebase, any backend/auth SDK, payment/KYC providers, ledger or financial logic.

## Mock scenarios

`default` · `new-investor` · `kyc-pending` · `kyc-rejected` · `no-opportunities` · `signed-out`
(switch via the in-app Prototype toolbar; persisted in localStorage on web).
