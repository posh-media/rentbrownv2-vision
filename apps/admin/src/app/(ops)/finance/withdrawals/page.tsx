"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { AdminWithdrawalRow } from "@rentbrown/types";
import { formatDateTime, formatMoney } from "@rentbrown/utils";
import { Badge } from "@rentbrown/ui";

import { useWithdrawals } from "../../../../lib/data/hooks";
import { ColumnDef, DataTable } from "../../../../components/data-table";
import { FilterBar, FilterSelect } from "../../../../components/filter-bar";
import { PageHeader } from "../../../../components/page-header";
import { PermissionGate } from "../../../../components/permission-gate";
import { StatusCell } from "../../../../components/status-cell";

const PAGE_SIZE = 15;

const columns: ColumnDef<AdminWithdrawalRow>[] = [
  { id: "reference", header: "Reference", sortable: true, cell: (w) => <span className="font-mono text-xs font-semibold">{w.reference}</span> },
  {
    id: "userDisplayName",
    header: "User",
    sortable: true,
    cell: (w) => (
      <div>
        <p className="font-semibold">{w.userDisplayName}</p>
        <StatusCell status={w.kycStatus} className="mt-0.5 text-[10px]" />
      </div>
    ),
  },
  {
    id: "amount",
    header: "Amount",
    sortable: true,
    align: "right",
    cell: (w) => (
      <div>
        <p className="tabular font-semibold">{formatMoney(w.amount, w.currency)}</p>
        <p className="tabular text-[11px] text-muted-foreground">net {formatMoney(w.netAmount, w.currency)}</p>
      </div>
    ),
  },
  { id: "destinationLabel", header: "Destination", cell: (w) => <span className="text-xs">{w.destinationLabel}</span> },
  {
    id: "riskFlags",
    header: "Risk flags",
    cell: (w) => (
      <div className="flex max-w-40 flex-wrap gap-1">
        {w.riskFlags.length === 0 ? (
          <span className="text-tertiary">—</span>
        ) : (
          w.riskFlags.map((f) => (
            <Badge key={f} tone="warning" className="text-[10px]">
              {f}
            </Badge>
          ))
        )}
      </div>
    ),
  },
  { id: "status", header: "Status", sortable: true, cell: (w) => <StatusCell status={w.status} /> },
  { id: "requestedAt", header: "Requested", sortable: true, cell: (w) => <span className="tabular text-xs">{formatDateTime(w.requestedAt)}</span> },
  { id: "reviewedBy", header: "Reviewer", cell: (w) => <span className="text-xs">{w.reviewedBy ?? <span className="text-tertiary">—</span>}</span> },
];

function WithdrawalsList() {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("REVIEW");
  const [sort, setSort] = React.useState<string | undefined>("requestedAt");
  const [page, setPage] = React.useState(1);
  const { data, isLoading, isError, refetch } = useWithdrawals({
    query: query || undefined,
    status: status === "ALL" ? undefined : status === "REVIEW" ? ["REQUESTED", "UNDER_REVIEW"] : [status],
    sort,
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <div>
      <PageHeader
        title="Withdrawal review"
        description="Review queue — requests awaiting a decision first. Approve/reject/mark paid on the detail screen. Funds stay reserved until a decision."
      />
      <FilterBar query={query} onQueryChange={(v) => { setQuery(v); setPage(1); }} placeholder="Search reference, user, destination…">
        <FilterSelect
          label="Withdrawal status"
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={[
            { value: "REVIEW", label: "Awaiting review" },
            { value: "ALL", label: "All statuses" },
            { value: "REQUESTED", label: "Requested" },
            { value: "UNDER_REVIEW", label: "Under review" },
            { value: "APPROVED", label: "Approved" },
            { value: "PROCESSING", label: "Processing" },
            { value: "COMPLETED", label: "Paid" },
            { value: "REJECTED", label: "Rejected" },
            { value: "FAILED", label: "Failed" },
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
        onRowClick={(w) => router.push(`/finance/withdrawals/${w.id}`)}
        rowKey={(w) => w.id}
        emptyTitle="Queue is clear"
        emptyCopy="No withdrawals match the current filters."
      />
    </div>
  );
}

export default function WithdrawalsPage() {
  return (
    <PermissionGate permission="finance.read" mode="page">
      <WithdrawalsList />
    </PermissionGate>
  );
}
