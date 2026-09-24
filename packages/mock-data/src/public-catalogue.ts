/**
 * Public (unauthenticated) catalogue — implements `PublicCatalogueSource`.
 *
 * Read-only, deterministic, zero latency, no scenario: exposes PUBLISHED plans
 * with their rounds (every status, including SCHEDULED and SOLD_OUT) so public
 * surfaces — marketing site, SEO'd explore/opportunity pages — can be rendered
 * on the server. Safe to import from React Server Components: no React, no
 * window, no mutable state. A Firebase Admin SDK adapter will replace this in
 * a later phase without touching callers.
 */
import type {
  ContentBundle,
  Opportunity,
  OpportunityFilter,
  Property,
  PublicCatalogueSource,
} from "@rentbrown/types";
import { plans, properties, rounds } from "./fixtures/catalogue";
import { content } from "./fixtures/content";
import { applyOpportunityFilter, opportunityForRound } from "./opportunities";

const clone = <T>(v: T): T => (typeof structuredClone === "function" ? structuredClone(v) : (JSON.parse(JSON.stringify(v)) as T));

export function createPublicCatalogueSource(): PublicCatalogueSource {
  const publishedPlanIds = new Set(plans.filter((p) => p.status === "PUBLISHED").map((p) => p.id));
  const publicRoundIds = rounds.filter((r) => publishedPlanIds.has(r.planId)).map((r) => r.id);
  const publishedPropertyIds = new Set(plans.filter((p) => publishedPlanIds.has(p.id)).map((p) => p.propertyId));

  const all = (): Opportunity[] => publicRoundIds.map(opportunityForRound).filter((o): o is Opportunity => o !== null);

  return {
    listOpportunities: async (filter?: OpportunityFilter) => clone(applyOpportunityFilter(all(), filter)),
    getOpportunity: async (slug: string) => {
      const property = properties.find((p) => p.slug === slug && publishedPropertyIds.has(p.id));
      if (!property) return null;
      const opp = all().find((o) => o.property.id === property.id);
      return opp ? clone(opp) : null;
    },
    listProperties: async () => clone<Property[]>(properties.filter((p) => publishedPropertyIds.has(p.id))),
    getContent: async () => clone<ContentBundle>(content),
  };
}
