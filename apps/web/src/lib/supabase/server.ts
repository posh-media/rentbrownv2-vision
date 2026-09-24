import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { resolveSupabaseEnv } from "@rentbrown/supabase";

/**
 * Server-side Supabase client bound to the request cookie store.
 *
 * Cookie writes are wrapped in try/catch: Server Components cannot set
 * cookies, so writes fail silently there — the proxy (`src/proxy.ts`) is
 * responsible for refreshing session cookies onto the response.
 */
export async function createSupabaseServerClient() {
  const env = resolveSupabaseEnv(process.env);
  if (!env) {
    throw new Error(
      "Supabase is not configured — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
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
          // RSC render — writes are not allowed here; the proxy refreshes.
        }
      },
    },
  });
}
