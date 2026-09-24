import { resolveSupabaseEnv, type SupabaseEnv } from "@rentbrown/supabase";

/**
 * Resolve the admin app's Supabase env. NEXT_PUBLIC_* vars are inlined at
 * build time, so the names must appear literally — never pass `process.env`
 * wholesale into the browser bundle.
 *
 * Returns null when auth is not configured: the app then runs in documented
 * DEMO MODE (no auth, mock actor) so the UI stays reviewable without a backend.
 */
export function adminSupabaseEnv(): SupabaseEnv | null {
  return resolveSupabaseEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
