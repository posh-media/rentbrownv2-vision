import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@rentbrown/supabase";

import { adminSupabaseEnv } from "./env";

/**
 * Server Supabase client bound to the request cookie store.
 * `cookieStore.set` throws inside Server Components (read-only) — the try/catch
 * is intentional; session refresh writes happen from proxy.ts and route
 * handlers where mutation is allowed.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  const env = adminSupabaseEnv();
  if (!env) return null;
  const cookieStore = await cookies();
  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component — safe to ignore, proxy.ts refreshes sessions.
        }
      },
    },
  });
}
