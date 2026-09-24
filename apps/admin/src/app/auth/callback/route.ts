import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "../../../lib/supabase/server";

/**
 * Auth callback for email links (invites, confirmations, recovery).
 * Exchanges the PKCE code for a session, then sends the user onward.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
