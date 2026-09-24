"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useSession } from "./data/hooks";

const GUEST_PREFIXES = ["/explore", "/opportunities", "/legal", "/how-it-works", "/faq", "/property-proof", "/company"];

export function isGuestRoute(pathname: string): boolean {
  return GUEST_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Redirects to /login when the session resolves to null. Returns the session
 * query so callers can also render isPending skeletons.
 */
export function useRequireSession() {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (session.isSuccess && session.data === null && !isGuestRoute(pathname)) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [session.isSuccess, session.data, pathname, router]);

  return session;
}
