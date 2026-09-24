"use client";

import * as React from "react";
import { cn } from "@rentbrown/ui";
import type { InvestmentRoundStatus, Opportunity } from "@rentbrown/types";

import { OpportunityCard } from "./opportunity-card";

/**
 * Small client island: status filter pills + the card grid. The full
 * opportunity set is server-rendered into the page — filtering happens in
 * memory so /explore stays fully static.
 */
const FILTERS: Array<{ key: string; label: string; match: InvestmentRoundStatus[] | "ALL" }> = [
  { key: "all", label: "All", match: "ALL" },
  { key: "open", label: "Open", match: ["OPEN", "NEARING_CAPACITY"] },
  { key: "sold-out", label: "Sold out", match: ["SOLD_OUT"] },
  { key: "coming-soon", label: "Coming soon", match: ["SCHEDULED"] },
];

export function ExploreBrowser({ opportunities }: { opportunities: Opportunity[] }) {
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]>(FILTERS[0] ?? { key: "all", label: "All", match: "ALL" });
  const visible =
    filter.match === "ALL" ? opportunities : opportunities.filter((o) => filter.match.includes(o.round.status));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by round status">
        {FILTERS.map((f) => {
          const count =
            f.match === "ALL" ? opportunities.length : opportunities.filter((o) => f.match.includes(o.round.status)).length;
          const active = f.key === filter.key;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground",
              )}
            >
              {f.label}
              <span className={cn("tabular ml-1.5 text-xs", active ? "opacity-80" : "text-tertiary")}>{count}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
        Showing {visible.length} of {opportunities.length} opportunities
      </p>

      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((o) => (
          <OpportunityCard key={o.round.id} opportunity={o} />
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface-subtle p-6 text-sm text-muted-foreground">
          Nothing matches that filter right now — try another status.
        </p>
      ) : null}
    </div>
  );
}

