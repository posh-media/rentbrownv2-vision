/**
 * Routes a signed-out visitor may browse inside the (app) shell. Kept
 * dependency-free so both the data provider and session hooks can use it
 * without an import cycle.
 */
const GUEST_PREFIXES = ["/explore", "/opportunities", "/legal", "/how-it-works", "/faq", "/property-proof", "/company"];

export function isGuestRoute(pathname: string): boolean {
  return GUEST_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
