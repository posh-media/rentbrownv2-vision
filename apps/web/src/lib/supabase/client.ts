"use client";

import { createBrowserClient } from "@supabase/ssr";
import { resolveSupabaseEnv } from "@rentbrown/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

/**
 * Singleton Supabase browser client. Cookie-backed storage (via @supabase/ssr)
 * keeps the session in sync with the server client used by the proxy and
 * route handlers. Returns null when env vars are absent so callers can fall
 * back to the mock data source.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (browserClient) return browserClient;
  // NEXT_PUBLIC_* vars are inlined at build time — reference them literally;
  // a bare `process.env` is not populated in the browser bundle.
  const env = resolveSupabaseEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!env) return null;
  browserClient = createBrowserClient(env.url, env.anonKey);
  return browserClient;
}
