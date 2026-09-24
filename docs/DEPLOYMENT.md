# Deployment — Vercel (web apps) + Expo (mobile)

Each Next.js app deploys as an **independent Vercel project** pointed at its
own root directory. Shared `workspace:*` packages are TypeScript source
consumed via `transpilePackages`, so no package build step is needed on
Vercel — the app's own `next build` compiles them.

## Projects

| Project | Root directory | Install | Build |
| --- | --- | --- | --- |
| Investor Web | `apps/web` | `pnpm install` (from repo root — Vercel detects pnpm workspaces) | `next build` (default; Vercel runs it inside `apps/web`) |
| Admin | `apps/admin` | same | same |
| Marketing Site | `apps/site` | same | same |

Recommended Vercel settings per project:

- **Root Directory:** `apps/<name>` (set in Project Settings → General).
- **Framework:** Next.js (auto-detected). Node 20+.
- **Include files outside root directory:** leave enabled (default) so the
  shared workspace packages resolve.
- **Ignored build step:** none required.

## Environment variables

Only public, non-secret variables exist. Copy each app's `.env.example` into
the Vercel project env settings — never commit real values.

| App | Variable | Purpose |
| --- | --- | --- |
| `apps/web` | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public — RLS is the guard) |
| `apps/web` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/publishable key (public) |
| `apps/web` | `NEXT_PUBLIC_WEB_URL` | Canonical origin (metadata, canonical tags) |
| `apps/web` | `NEXT_PUBLIC_SITE_URL` | Marketing-site origin for cross-links |
| `apps/admin` | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase (public) |
| `apps/site` | `NEXT_PUBLIC_SITE_URL` | Canonical origin |
| `apps/site` | `NEXT_PUBLIC_WEB_URL` | Investor-app origin for Sign in / Get started |
| `apps/mobile` | `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase — bundled into the app (public; RLS is the guard). Set in `apps/mobile/.env` for local dev and in the EAS project for builds |

Server-only secrets live outside app env: `SUPABASE_SERVICE_ROLE_KEY` and
`DATABASE_URL` belong to the repo-root `.env` (migrations, seeding) — never in
`NEXT_PUBLIC_*`/`EXPO_PUBLIC_*` vars, Vercel project envs, or bundles.

`apps/admin` also emits `robots: { index: false }` on every page — keep it
that way; additionally consider Vercel Deployment Protection for the admin
project.

## Turbo

`turbo.json` declares no env-dependent tasks, so per-app builds cannot leak
cross-environment cache. CI can also run `pnpm --filter @rentbrown/<app> build`.

## Mobile

`apps/mobile` is **not** a Vercel target. Dev: `pnpm --filter @rentbrown/mobile start`
(Expo). Production builds go through EAS in a later phase.
