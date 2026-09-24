"use client";

import * as React from "react";
import type { AdminTransactionRow } from "@rentbrown/types";
import { formatDateTime, formatMoneySigned, humanizeStatus } from "@rentbrown/utils";
import { Badge, cn } from "@rentbrown/ui";

import { useTransactions } from "../../../lib/data/hooks";
import { ColumnDef, DataTable } from "../../../components/data-table";
import { DetailDrawer, DetailRow } from "../../../components/detail-drawer";
import { FilterBar, FilterSelect } from "../../../components/filter-bar";
import { PageHeader } from "../../../components/page-header";
import { PermissionGate } from "../../../components/permission-gate";
import { StatusCell } from "../../../components/status-cell";

const PAGE_SIZE = 15;

function TransactionsList() {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("ALL");
  const [sort, setSort] = React.useState<string | undefined>("-occurredAt");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<AdminTransactionRow | null>(null);
  const { data, isLoading, isError, refetch } = useTransactions({
    query: query || undefined,
    status: status === "ALL" ? undefined : [status],
    sort,
    page,
    pageSize: PAGE_SIZE,
  });

  const columns: ColumnDef<AdminTransactionRow>[] = [
    { id: "reference", header: "Reference", sortable: true, cell: (t) => <span className="font-mono text-xs font-semibold">{t.reference}</span> },
    { id: "userDisplayName", header: "User", sortable: true, cell: (t) => <span className="font-semibold">{t.userDisplayName}</span> },
    { id: "type", header: "Type", sortable: true, cell: (t) => <span className="text-xs">{humanizeStatus(t.type)}</span> },
    {
      id: "amount",
      header: "Amount",
      sortable: true,
      align: "right",
      cell: (t) => (
        <span className={cn("tabular font-semibold", t.direction === "CREDIT" ? "text-[var(--success-fg)]" : "text-foreground")}>
          {formatMoneySigned(t.direction === "DEBIT" ? -t.amount : t.amount, t.currency)}
        </span>
      ),
    },
    { id: "account", header: "Account", cell: (t) => <span className="text-xs">{humanizeStatus(t.account)}</span> },
    { id: "status", header: "Status", sortable: true, cell: (t) => <StatusCell status={t.status} /> },
    {
      id: "reversesId",
      header: "Reversal",
      cell: (t) =>
        t.reversesId ? (
          <Badge tone="neutral" className="font-mono text-[10px]">↩ {t.reversesId}</Badge>
        ) : t.status === "REVERSED" ? (
          <Badge tone="neutral" className="text-[10px]">reversed</Badge>
        ) : (
          <span className="text-tertiary">—</span>
        ),
    },
    { id: "occurredAt", header: "Occurred", sortable: true, cell: (t) => <span className="tabular text-xs">{formatDateTime(t.occurredAt)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Transactions" description="Full ledger view — corrections are new entries (reversals), never edits." />
      <FilterBar query={query} onQueryChange={(v) => { setQuery(v); setPage(1); }} placeholder="Search reference, user, type…">
        <FilterSelect
          label="Transaction status"
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={[
            { value: "ALL", label: "All statuses" },
            { value: "SUCCESSFUL", label: "Successful" },
            { value: "PENDING", label: "Pending" },
            { value: "UNDER_REVIEW", label: "Under review" },
            { value: "FAILED", label: "Failed" },
            { value: "REVERSED", label: "Reversed" },
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
        rowKey={(t) => t.id}
        emptyTitle="No transactions"
        emptyCopy="No ledger entries match the current filters."
      />

      <DetailDrawer
        open={selected !== null}
        onOpenChange={(o) => !o && setSelected(null)}
        title={selected?.reference ?? ""}
        description={selected ? `${humanizeStatus(selected.type)} · ${selected.userDisplayName}` : undefined}
      >
        {selected ? (
          <div>
            <div className="mb-4 flex items-center gap-2">
              <StatusCell status={selected.status} />
              <StatusCell status="neutral" label={selected.direction === "CREDIT" ? "Credit" : "Debit"} />
            </div>
            <DetailRow label="Amount">{formatMoneySigned(selected.direction === "DEBIT" ? -selected.amount : selected.amount, selected.currency)}</DetailRow>
            <DetailRow label="Account">{humanizeStatus(selected.account)}</DetailRow>
            <DetailRow label="Type">{humanizeStatus(selected.type)}</DetailRow>
            <DetailRow label="User">{selected.userDisplayName}</DetailRow>
            <DetailRow label="Occurred">{formatDateTime(selected.occurredAt)}</DetailRow>
            <DetailRow label="Entry id" mono>{selected.id}</DetailRow>
            {selected.reversesId ? <DetailRow label="Reverses" mono>{selected.reversesId}</DetailRow> : null}
          </div>
        ) : null}
      </DetailDrawer>
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <PermissionGate permission="finance.read" mode="page">
      <TransactionsList />
    </PermissionGate>
  );
}
