import type { Opportunity } from "@rentbrown/types";

import { OpportunityCard, OpportunityCardSkeleton } from "./opportunity-card";

export function OpportunityGrid({ opportunities, compact = false }: { opportunities: Opportunity[]; compact?: boolean }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {opportunities.map((o) => (
        <OpportunityCard key={o.round.id} opportunity={o} compact={compact} />
      ))}
    </div>
  );
}

export function OpportunityGridSkeleton({ count = 6, compact = false }: { count?: number; compact?: boolean }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <OpportunityCardSkeleton key={i} compact={compact} />
      ))}
    </div>
  );
}
