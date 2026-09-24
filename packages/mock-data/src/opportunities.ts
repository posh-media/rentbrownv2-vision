/**
 * Shared opportunity assembly + filter/sort logic used by both the
 * authenticated `MockDataSource` and the public `PublicCatalogueSource`.
 * Pure functions — safe to call from React Server Components.
 */
import type { Opportunity, OpportunityFilter } from "@rentbrown/types";
import { plans, properties, rounds } from "./fixtures/catalogue";

/** Join a round to its plan and property, computing the one-slot illustration. */
export function opportunityForRound(roundId: string): Opportunity | null {
  const round = rounds.find((r) => r.id === roundId);
  const plan = round && plans.find((p) => p.id === round.planId);
  const property = plan && properties.find((p) => p.id === plan.propertyId);
  if (!round || !plan || !property) return null;
  const expectedProfit = Math.round((plan.slotPrice * plan.roiBps) / 10_000);
  return { property, plan, round, perSlot: { principal: plan.slotPrice, expectedProfit, maturityValue: plan.slotPrice + expectedProfit } };
}

/** Apply status/query filtering and sorting to a set of opportunities. */
export function applyOpportunityFilter(items: Opportunity[], filter?: OpportunityFilter): Opportunity[] {
  let result = items;
  if (filter?.status && filter.status !== "ALL") result = result.filter((o) => (filter.status as string[]).includes(o.round.status));
  if (filter?.query) {
    const q = filter.query.toLowerCase();
    result = result.filter((o) => `${o.property.name} ${o.property.location.label} ${o.plan.name}`.toLowerCase().includes(q));
  }
  const sorted = [...result];
  switch (filter?.sort) {
    case "CLOSING_SOON": sorted.sort((a, b) => a.round.closesAt.localeCompare(b.round.closesAt)); break;
    case "ROI": sorted.sort((a, b) => b.plan.roiBps - a.plan.roiBps); break;
    case "SLOT_PRICE": sorted.sort((a, b) => a.plan.slotPrice - b.plan.slotPrice); break;
    default: sorted.sort((a, b) => b.round.opensAt.localeCompare(a.round.opensAt));
  }
  return sorted;
}
