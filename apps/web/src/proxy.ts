import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Public routes — anything else requires an authenticated Supabase user.
 * Trailing "/*" means "the bare path AND everything under it"; trailing "*"
 * means a plain prefix match.
 */
const PUBLIC_PATHS = [
  "/",
  "/explore",
  "/opportunities/*",
  "/how-it-works",
  "/faq",
  "/legal/*",
  "/company",
  "/property-proof",
  "/help",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/*",
  "/robots.txt",
  "/sitemap.xml",
  "/_next/*",
  "/properties/*",
  "/favicon*",
];

const AUTH_PAGES = new Set(["/login", "/signup"]);

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((pattern) => {
    if (pattern.endsWith("/*")) {
      const base = pattern.slice(0, -2);
      return pathname === base || pathname.startsWith(`${base}/`);
    }
    if (pattern.endsWith("*")) {
      return pathname.startsWith(pattern.slice(0, -1));
    }
    return pathname === pattern;
  });
}

/**
 * Session refresh + route guard (Supabase `updateSession` pattern).
 * Refreshed auth cookies are written onto the outgoing response — never
 * directly on the request — and the response object is re-created after a
 * refresh so downstream handlers see the new cookies.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // No Supabase env (pure prototype build) — let client-side guards decide.
  if (!url || !anonKey) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
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

  // getUser() verifies the token with Supabase — never trust raw JWT claims.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(redirectUrl, 307);
  }

  if (user && AUTH_PAGES.has(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl, 307);
  }

  return response;
}

export const config = {
  matcher: [
    // Skip static assets, image optimization and common file extensions
    // (getUser() is a network call — never pay it for asset requests).
    "/((?!_next/static|_next/image|images|.*\\.(?:svg|png|jpe?g|webp|avif|gif|ico|xml|txt|json|woff2?|css|js|map)$).*)",
  ],
};
