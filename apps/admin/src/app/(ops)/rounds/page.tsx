"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { AdminRoundRow, InvestmentRoundStatus } from "@rentbrown/types";
import { formatDate, formatMoney } from "@rentbrown/utils";
import { ProgressBar } from "@rentbrown/ui";

import { useRounds } from "../../../lib/data/hooks";
import { ColumnDef, DataTable } from "../../../components/data-table";
import { FilterBar, FilterSelect } from "../../../components/filter-bar";
import { PageHeader } from "../../../components/page-header";
import { PermissionGate } from "../../../components/permission-gate";
import { StatusCell } from "../../../components/status-cell";

const PAGE_SIZE = 15;

const columns: ColumnDef<AdminRoundRow>[] = [
  {
    id: "propertyName",
    header: "Round",
    sortable: true,
    cell: (r) => (
      <div className="min-w-0">
        <p className="truncate font-semibold text-foreground">{r.propertyName} · R{r.roundNumber}</p>
        <p className="truncate text-xs text-muted-foreground">{r.planName}</p>
      </div>
    ),
  },
  { id: "status", header: "Status", sortable: true, cell: (r) => <StatusCell status={r.status} /> },
  {
    id: "allocatedPct",
    header: "Capacity",
    sortable: true,
    cell: (r) => (
      <div className="w-36">
        <ProgressBar value={r.allocatedPct} size="sm" tone={r.allocatedPct >= 90 ? "warning" : "success"} />
        <p className="mt-1 text-[10px] tabular text-muted-foreground">
          {r.allocatedSlots + r.reservedSlots}/{r.totalSlots} · {r.allocatedPct}%
        </p>
      </div>
    ),
  },
  {
    id: "raised",
    header: "Raised",
    sortable: true,
    align: "right",
    cell: (r) => <span className="tabular font-semibold">{formatMoney(r.raised, r.currency)}</span>,
  },
  { id: "investors", header: "Investors", sortable: true, align: "right", cell: (r) => <span className="tabular">{r.investors}</span> },
  {
    id: "slotPrice",
    header: "Slot",
    align: "right",
    cell: (r) => <span className="tabular text-xs">{formatMoney(r.slotPrice, r.currency)}</span>,
  },
  {
    id: "closesAt",
    header: "Closes",
    sortable: true,
    cell: (r) => <span className="tabular text-xs">{formatDate(r.closesAt)}</span>,
  },
];

function RoundsList() {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("ALL");
  const [sort, setSort] = React.useState<string | undefined>("-opensAt");
  const [page, setPage] = React.useState(1);
  const { data, isLoading, isError, refetch } = useRounds({
    query: query || undefined,
    status: status === "ALL" ? undefined : [status as InvestmentRoundStatus],
    sort,
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <div>
      <PageHeader title="Investment rounds" description="Capacity, allocation and raised totals across every round." />
      <FilterBar query={query} onQueryChange={(v) => { setQuery(v); setPage(1); }} placeholder="Search property or plan…">
        <FilterSelect
          label="Round status"
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={[
            { value: "ALL", label: "All statuses" },
            { value: "OPEN", label: "Open" },
            { value: "NEARING_CAPACITY", label: "Nearing capacity" },
            { value: "SCHEDULED", label: "Scheduled" },
            { value: "SOLD_OUT", label: "Sold out" },
            { value: "CLOSED", label: "Closed" },
            { value: "SETTLED", label: "Settled" },
          ]}
        />
      </FilterBar>
      <DataTable
        columns={columns}
        page={data}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        sort={sort}
        onSortChange={(s) => { setSort(s); setPage(1); }}
        onPageChange={setPage}
        onRowClick={(r) => router.push(`/rounds/${r.id}`)}
        rowKey={(r) => r.id}
        emptyTitle="No rounds"
        emptyCopy="No rounds match the current filters."
      />
    </div>
  );
}

export default function RoundsPage() {
  return (
    <PermissionGate permission="catalogue.read" mode="page">
      <RoundsList />
    </PermissionGate>
  );
}
