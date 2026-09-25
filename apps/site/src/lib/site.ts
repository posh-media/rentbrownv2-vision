/**
 * Shared helpers for the marketing site. Server-safe: no window, no React.
 * All catalogue data flows through `createPublicCatalogueSource()` — the
 * published-catalogue seam — never straight from fixture internals.
 */
import type { ProofDocumentStatus, StatusTone } from "@rentbrown/types";
import { createPublicCatalogueSource } from "@rentbrown/mock-data";
import { absoluteUrl } from "@rentbrown/utils";

/** One shared read-only catalogue for every page render. */
export const catalogue = createPublicCatalogueSource();

/** Property image asset key → public URL (same convention as the web app). */
export function propertyImage(key: string): string {
  return `/properties/${key}.jpg`;
}

// Env origins may arrive without a scheme (e.g. "rentbrown.vercel.app") —
// absoluteUrl normalizes; it never throws at module scope.
export const SITE_URL = absoluteUrl(process.env.NEXT_PUBLIC_SITE_URL, "http://localhost:3003");
const WEB_URL = absoluteUrl(process.env.NEXT_PUBLIC_WEB_URL, "http://localhost:3000");

/** Account actions live on the investor app, not this site. */
export const appLinks = {
  signIn: `${WEB_URL}/login`,
  getStarted: `${WEB_URL}/signup`,
} as const;

export const proofStatusTone: Record<ProofDocumentStatus, StatusTone> = {
  VERIFIED: "success",
  PENDING_REVIEW: "pending",
  EXPIRED: "error",
};
