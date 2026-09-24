"use client";

import * as React from "react";
import { Building2, Search } from "lucide-react";
import {
  Button,
  EmptyState,
  Input,
  SegmentedControl,
  Select,
  StatePanel,
  toast,
} from "@rentbrown/ui";
import type { InvestmentRoundStatus, OpportunityFilter } from "@rentbrown/types";
import { pluralize } from "@rentbrown/utils";

import { useOpportunities } from "../../../lib/data/hooks";
import { PageHeader } from "../../../components/layout/page-header";
import { OpportunityGrid, OpportunityGridSkeleton } from "../../../components/opportunities/opportunity-grid";

type StatusFilter = "ALL" | InvestmentRoundStatus;

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "NEARING_CAPACITY", label: "Nearing capacity" },
  { value: "SOLD_OUT", label: "Sold out" },
  { value: "SCHEDULED", label: "Coming soon" },
];

const sortOptions = [
  { value: "NEWEST", label: "Newest" },
  { value: "CLOSING_SOON", label: "Closing soon" },
  { value: "ROI", label: "Highest return" },
  { value: "SLOT_PRICE", label: "Lowest slot price" },
] as const;

export default function ExplorePage() {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("ALL");
  const [sort, setSort] = React.useState<(typeof sortOptions)[number]["value"]>("NEWEST");

  const filter: OpportunityFilter = React.useMemo(
    () => ({
      status: status === "ALL" ? "ALL" : [status],
      query: query.trim() || undefined,
      sort,
    }),
    [status, query, sort],
  );

  const opportunities = useOpportunities(filter);
  const items = opportunities.data ?? [];
  const filtered = query.trim() !== "" || status !== "ALL";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Investment marketplace"
        title="Explore opportunities"
        copy="Compare open rounds by slot price, expected return, duration and evidence. All properties and figures are fictional prototype data."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1 lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tertiary" aria-hidden />
          <Input
            aria-label="Search opportunities"
            placeholder="Search by property, location or plan"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <SegmentedControl
          label="Round status"
          options={statusOptions}
          value={status}
          onChange={setStatus}
        />
        <div className="lg:ml-auto">
          <Select aria-label="Sort opportunities" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {opportunities.isPending ? (
        <OpportunityGridSkeleton />
      ) : opportunities.isError ? (
        <StatePanel
          tone="error"
          title="We couldn't load opportunities"
          copy={opportunities.error.message}
          action={
            <Button variant="outline" size="sm" onClick={() => opportunities.refetch()}>
              Retry
            </Button>
          }
        />
      ) : items.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={<Building2 />}
            title={`No matches${query.trim() ? ` for “${query.trim()}”` : ""}`}
            copy="Try a different search or clear the filters."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setStatus("ALL");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Building2 />}
            title="No open opportunities right now"
            copy="New rounds appear here after document review. We'll notify you."
            action={
              <Button variant="outline" onClick={() => toast.success("We'll notify you when a round opens")}>
                Notify me
              </Button>
            }
          />
        )
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{pluralize(items.length, "opportunity", "opportunities")}</p>
          <OpportunityGrid opportunities={items} />
        </>
      )}
    </div>
  );
}
