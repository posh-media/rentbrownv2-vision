/**
 * Environment resolution. Every app passes its own prefixed env vars in —
 * this package never guesses which prefix applies.
 *
 * Canonical names:
 *   Next.js : NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   Expo    : EXPO_PUBLIC_SUPABASE_URL,  EXPO_PUBLIC_SUPABASE_ANON_KEY
 *   Scripts : SUPABASE_URL,              SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
 */
export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export function resolveSupabaseEnv(env: Record<string, string | undefined>): SupabaseEnv | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL;
  const anonKey =
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/$/, ""), anonKey };
}

/** Service-role key must NEVER reach a browser/mobile bundle. */
export function resolveServiceRoleEnv(env: Record<string, string | undefined>) {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return { url: url.replace(/\/$/, ""), serviceRoleKey };
}
