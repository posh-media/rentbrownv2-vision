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
| `apps/web` | `NEXT_PUBLIC_WEB_URL` | Canonical origin (metadata, canonical tags) |
| `apps/web` | `NEXT_PUBLIC_SITE_URL` | Marketing-site origin for cross-links |
| `apps/site` | `NEXT_PUBLIC_SITE_URL` | Canonical origin |
| `apps/site` | `NEXT_PUBLIC_WEB_URL` | Investor-app origin for Sign in / Get started |
| `apps/admin` | — | none |

`apps/admin` also emits `robots: { index: false }` on every page — keep it
that way; additionally consider Vercel Deployment Protection for the admin
project.

## Turbo

`turbo.json` declares no env-dependent tasks, so per-app builds cannot leak
cross-environment cache. CI can also run `pnpm --filter @rentbrown/<app> build`.

## Mobile

`apps/mobile` is **not** a Vercel target. Dev: `pnpm --filter @rentbrown/mobile start`
(Expo). Production builds go through EAS in a later phase.
