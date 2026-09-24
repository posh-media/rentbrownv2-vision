"use client";

import * as React from "react";
import type { AdminDepositRow } from "@rentbrown/types";
import { formatDateTime, formatMoney } from "@rentbrown/utils";

import { useDeposits } from "../../../lib/data/hooks";
import { ColumnDef, DataTable } from "../../../components/data-table";
import { DetailDrawer, DetailRow } from "../../../components/detail-drawer";
import { FilterBar, FilterSelect } from "../../../components/filter-bar";
import { PageHeader } from "../../../components/page-header";
import { PermissionGate } from "../../../components/permission-gate";
import { StatusCell } from "../../../components/status-cell";

const PAGE_SIZE = 15;

const columns: ColumnDef<AdminDepositRow>[] = [
  { id: "reference", header: "Reference", sortable: true, cell: (d) => <span className="font-mono text-xs font-semibold">{d.reference}</span> },
  { id: "userDisplayName", header: "User", sortable: true, cell: (d) => <span className="font-semibold">{d.userDisplayName}</span> },
  { id: "amount", header: "Amount", sortable: true, align: "right", cell: (d) => <span className="tabular font-semibold">{formatMoney(d.amount, d.currency)}</span> },
  { id: "channelLabel", header: "Channel", cell: (d) => <span className="text-xs">{d.channelLabel}</span> },
  { id: "status", header: "Status", sortable: true, cell: (d) => <StatusCell status={d.status} /> },
  { id: "createdAt", header: "Created", sortable: true, cell: (d) => <span className="tabular text-xs">{formatDateTime(d.createdAt)}</span> },
  { id: "creditedAt", header: "Credited", cell: (d) => <span className="tabular text-xs">{d.creditedAt ? formatDateTime(d.creditedAt) : "—"}</span> },
];

function DepositsList() {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("ALL");
  const [sort, setSort] = React.useState<string | undefined>("-createdAt");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<AdminDepositRow | null>(null);
  const { data, isLoading, isError, refetch } = useDeposits({
    query: query || undefined,
    status: status === "ALL" ? undefined : [status],
    sort,
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <div>
      <PageHeader title="Deposits" description="Deposit intents and credits across all channels." />
      <FilterBar query={query} onQueryChange={(v) => { setQuery(v); setPage(1); }} placeholder="Search reference, user…">
        <FilterSelect
          label="Deposit status"
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={[
            { value: "ALL", label: "All statuses" },
            { value: "AWAITING_TRANSFER", label: "Awaiting transfer" },
            { value: "CONFIRMING", label: "Confirming" },
            { value: "CREDITED", label: "Credited" },
            { value: "FAILED", label: "Failed" },
            { value: "EXPIRED", label: "Expired" },
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
        onRowClick={setSelected}
        rowKey={(d) => d.id}
        emptyTitle="No deposits"
        emptyCopy="No deposits match the current filters."
      />

      <DetailDrawer
        open={selected !== null}
        onOpenChange={(o) => !o && setSelected(null)}
        title={selected?.reference ?? ""}
        description={selected ? `${selected.userDisplayName} · ${selected.channelLabel}` : undefined}
      >
        {selected ? (
          <div>
            <div className="mb-4 flex items-center gap-2">
              <StatusCell status={selected.status} />
              <StatusCell status="neutral" label={selected.method.replace("_", " ")} />
            </div>
            <DetailRow label="Amount">{formatMoney(selected.amount, selected.currency)}</DetailRow>
            <DetailRow label="Fee">{formatMoney(selected.fee, selected.currency)}</DetailRow>
            <DetailRow label="User">{selected.userDisplayName}</DetailRow>
            <DetailRow label="Channel">{selected.channelLabel}</DetailRow>
            <DetailRow label="Created">{formatDateTime(selected.createdAt)}</DetailRow>
            <DetailRow label="Credited">{selected.creditedAt ? formatDateTime(selected.creditedAt) : "—"}</DetailRow>
            <DetailRow label="Intent id" mono>{selected.id}</DetailRow>
          </div>
        ) : null}
      </DetailDrawer>
    </div>
  );
}

export default function DepositsPage() {
  return (
    <PermissionGate permission="finance.read" mode="page">
      <DepositsList />
    </PermissionGate>
  );
}
