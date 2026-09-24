"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@rentbrown/supabase";

import { adminSupabaseEnv } from "./env";

let browserClient: SupabaseClient | null = null;

/**
 * Browser Supabase client (singleton). Persists the session in cookies via
 * @supabase/ssr so proxy.ts and server components see the same auth state.
 * Returns null when Supabase env is absent (DEMO MODE).
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (browserClient) return browserClient;
  const env = adminSupabaseEnv();
  if (!env) return null;
  browserClient = createBrowserClient(env.url, env.anonKey);
  return browserClient;
}
