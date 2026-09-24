import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createClient,
  resolveSupabaseEnv,
  type SupabaseClient,
} from "@rentbrown/supabase";

/**
 * Supabase client singleton for the investor app.
 *
 * `EXPO_PUBLIC_*` vars are inlined by Expo at bundle time (see apps/mobile/.env).
 * They are referenced explicitly (not via `process.env` wholesale) so Metro's
 * env inlining always picks them up.
 *
 * When the env is absent — e.g. a review checkout without `.env` — `supabase`
 * is null and the app runs in pure mock mode: the data provider falls back to
 * `createMockDataSource` and `useAuth()` returns null. Screens must handle that
 * gracefully (it's the demo/review configuration).
 */
const env = resolveSupabaseEnv({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
});

export const supabase: SupabaseClient | null = env
  ? createClient(env.url, env.anonKey, {
      auth: {
        // RN has no localStorage — sessions persist in AsyncStorage.
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // No window.location on device — recovery links are fed in manually
        // via `establishRecoverySession` from the /reset-password route.
        detectSessionInUrl: false,
      },
    })
  : null;

/** True when this build talks to the live Supabase backend. */
export const hasLiveAuth = supabase != null;

/**
 * Re-send the signup confirmation email.
 * `AuthGateway` intentionally has no resend method, so this stays behind the
 * lib seam — screens never import `@supabase/supabase-js` themselves.
 */
export async function resendConfirmationEmail(email: string): Promise<void> {
  if (!supabase) throw new Error("Account backend is not configured on this build.");
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: email.trim().toLowerCase(),
  });
  if (error) throw new Error(error.message);
}

/**
 * Establish a recovery session from a `rentbrown://reset-password` deep link.
 *
 * Supabase can emit three redirect shapes depending on the project's auth
 * settings; all are handled:
 *   PKCE      `rentbrown://reset-password?code=…`
 *               → exchangeCodeForSession (the code verifier written by
 *                 resetPasswordForEmail is already in AsyncStorage)
 *   OTP hash  `…?token_hash=…&type=recovery` → verifyOtp
 *   Implicit  `…#access_token=…&refresh_token=…&type=recovery` → setSession
 *
 * Link errors (`?error=…` / `#error_description=…`) throw readable messages.
 */
export async function establishRecoverySession(url: string): Promise<void> {
  if (!supabase) throw new Error("Account backend is not configured on this build.");

  const hashIndex = url.indexOf("#");
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex + 1) : "";
  const queryIndex = beforeHash.indexOf("?");
  const params = {
    ...parseParams(hash),
    ...parseParams(queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : ""),
  };

  if (params.error) {
    throw new Error(params.error_description ?? "This reset link is not valid.");
  }
  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw new Error(error.message);
    return;
  }
  if (params.token_hash) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: params.token_hash, type: "recovery" });
    if (error) throw new Error(error.message);
    return;
  }
  if (params.access_token && params.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (error) throw new Error(error.message);
    return;
  }
  throw new Error("This reset link is missing its recovery token. Request a fresh link.");
}

function parseParams(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of s.split("&")) {
    if (!pair) continue;
    const i = pair.indexOf("=");
    const key = i < 0 ? pair : pair.slice(0, i);
    const value = i < 0 ? "" : pair.slice(i + 1);
    try {
      out[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, " "));
    } catch {
      out[key] = value;
    }
  }
  return out;
}
