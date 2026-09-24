"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { AdminPlanRow } from "@rentbrown/types";
import { formatBps, formatDuration, formatMoney } from "@rentbrown/utils";

import { usePlans } from "../../../lib/data/hooks";
import { ColumnDef, DataTable } from "../../../components/data-table";
import { FilterBar } from "../../../components/filter-bar";
import { PageHeader } from "../../../components/page-header";
import { PermissionGate } from "../../../components/permission-gate";
import { StatusCell } from "../../../components/status-cell";

const PAGE_SIZE = 15;

const columns: ColumnDef<AdminPlanRow>[] = [
  {
    id: "name",
    header: "Plan",
    sortable: true,
    cell: (p) => (
      <div className="min-w-0">
        <p className="truncate font-semibold text-foreground">{p.name}</p>
        <p className="truncate text-xs text-muted-foreground">{p.propertyName}</p>
      </div>
    ),
  },
  {
    id: "slotPrice",
    header: "Slot price",
    sortable: true,
    align: "right",
    cell: (p) => <span className="tabular font-semibold">{formatMoney(p.slotPrice, p.currency)}</span>,
  },
  { id: "roiBps", header: "Return", sortable: true, align: "right", cell: (p) => <span className="tabular font-semibold">{formatBps(p.roiBps)}</span> },
  { id: "duration", header: "Duration", cell: (p) => <span className="text-xs">{formatDuration(p.duration)}</span> },
  {
    id: "limits",
    header: "Limits",
    cell: (p) => (
      <span className="text-xs text-muted-foreground">
        min {p.minSlots}{p.maxSlotsPerUser ? ` · max ${p.maxSlotsPerUser}/user` : ""}
      </span>
    ),
  },
  {
    id: "eligibility",
    header: "Eligibility",
    cell: (p) => (
      <div className="flex flex-wrap gap-1">
        {p.eligibility.map((e) => (
          <span key={e} className="rounded-full border border-border bg-surface-subtle px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {e}
          </span>
        ))}
      </div>
    ),
  },
  { id: "rounds", header: "Rounds", align: "right", cell: (p) => <span className="tabular">{p.rounds}</span> },
  { id: "status", header: "Status", sortable: true, cell: (p) => <StatusCell status={p.status} /> },
];

function PlansList() {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<string | undefined>("-slotPrice");
  const [page, setPage] = React.useState(1);
  const { data, isLoading, isError, refetch } = usePlans({ query: query || undefined, sort, page, pageSize: PAGE_SIZE });

  return (
    <div>
      <PageHeader title="Investment plans" description="Slot economics, limits and eligibility for each plan in the catalogue." />
      <FilterBar query={query} onQueryChange={(v) => { setQuery(v); setPage(1); }} placeholder="Search plan or property…" />
      <DataTable
        columns={columns}
        page={data}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        sort={sort}
        onSortChange={(s) => { setSort(s); setPage(1); }}
        onPageChange={setPage}
        onRowClick={(p) => router.push(`/plans/${p.id}`)}
        rowKey={(p) => p.id}
        emptyTitle="No plans"
        emptyCopy="No investment plans in the catalogue."
      />
    </div>
  );
}

export default function PlansPage() {
  return (
    <PermissionGate permission="catalogue.read" mode="page">
      <PlansList />
    </PermissionGate>
  );
}
