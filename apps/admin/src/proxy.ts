import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { adminSupabaseEnv } from "./lib/supabase/env";

/**
 * Auth guard + session refresh for every request. The admin app is fully
 * private — the only public paths are the login screen, auth callbacks and
 * infrastructural assets. Everything else requires a verified Supabase user
 * (admin-role resolution happens app-side via `resolveAdminActor`).
 */
const PUBLIC_FILE = /\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$/;

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/_next") ||
    pathname === "/robots.txt" ||
    PUBLIC_FILE.test(pathname)
  );
}

export async function proxy(request: NextRequest) {
  const env = adminSupabaseEnv();

  // DEMO MODE: Supabase env absent → no auth. The app renders the mock actor
  // behind a "DEMO MODE" banner so the UI stays reviewable without a backend.
  if (!env) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() verifies the token against the auth server — do NOT use
  // getSession() here; cached claims are not trustworthy for a guard.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") {
      url.searchParams.set("next", pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(url);
  }

  // Signed-in users have no business on the login screen — bounce them in.
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|_next/webpack-hmr).*)"],
};
