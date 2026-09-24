import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../lib/supabase/server";

/**
 * OAuth-free auth callback: email confirmation + password recovery links
 * land here with a `code` we exchange for a session.
 *
 *   /auth/callback?code=…&next=/dashboard            → confirm email → next
 *   /auth/callback?code=…&type=recovery              → recovery → /reset-password
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type");
  const rawNext = searchParams.get("next") ?? "/dashboard";
  // Only allow same-origin relative redirects.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=link`);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=link`);
    }
  } catch {
    return NextResponse.redirect(`${origin}/login?error=link`);
  }

  const target = type === "recovery" ? "/reset-password" : next;
  return NextResponse.redirect(`${origin}${target}`);
}
