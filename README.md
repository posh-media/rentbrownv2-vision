# RentBrown V2

Nigerian property-investment platform. pnpm + Turborepo monorepo.

## Layout

- `apps/web` — investor web (Next.js, :3000)
- `apps/admin` — admin/operations (Next.js, :3002)
- `apps/site` — marketing site (Next.js, :3003)
- `apps/mobile` — investor mobile (Expo + expo-router)
- `packages/config` — shared tsconfig presets + ESLint base
- `packages/design-tokens` — design tokens + Tailwind v4 theme.css
- `packages/types` — shared domain types
- `packages/utils` — shared utilities
- `packages/mock-data` — mock data
- `packages/validation` — zod schemas
- `packages/ui` — web-only React primitives (Tailwind + Radix)

## Commands

- `pnpm dev` — run all dev servers
- `pnpm --filter @rentbrown/web dev` — run a single app
- `pnpm build` / `pnpm lint` / `pnpm typecheck` / `pnpm test` — turbo tasks
- `pnpm format` / `pnpm format:check` — prettier
