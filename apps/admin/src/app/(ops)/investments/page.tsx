"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AdminInvestmentRow, InvestmentStatus } from "@rentbrown/types";
import { formatBps, formatDate, formatMoney } from "@rentbrown/utils";

import { useAdminInvestments, useInvestmentReconciliation } from "../../../lib/data/hooks";
import { usePermissions } from "../../../lib/data/provider";
import { ColumnDef, DataTable } from "../../../components/data-table";
import { FilterBar, FilterSelect } from "../../../components/filter-bar";
import { PageHeader } from "../../../components/page-header";
import { PermissionGate } from "../../../components/permission-gate";
import { StatusCell } from "../../../components/status-cell";

const PAGE_SIZE = 15;

const columns: ColumnDef<AdminInvestmentRow>[] = [
  {
    id: "reference",
    header: "Reference",
    sortable: true,
    cell: (i) => <span className="font-mono text-xs font-semibold">{i.reference}</span>,
  },
  {
    id: "userDisplayName",
    header: "Investor",
    sortable: true,
    cell: (i) => (
      <Link href={`/users/${i.userId}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-primary hover:underline">
        {i.userDisplayName}
      </Link>
    ),
  },
  {
    id: "propertyName",
    header: "Property",
    sortable: true,
    cell: (i) => (
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold">{i.propertyName}</p>
        <p className="text-[11px] text-muted-foreground">R{i.roundNumber} · {i.slots} slots</p>
      </div>
    ),
  },
  {
    id: "principal",
    header: "Principal",
    sortable: true,
    align: "right",
    cell: (i) => <span className="tabular font-semibold">{formatMoney(i.principal, i.currency)}</span>,
  },
  {
    id: "maturityValue",
    header: "Maturity value",
    sortable: true,
    align: "right",
    cell: (i) => <span className="tabular text-muted-foreground">{formatMoney(i.maturityValue, i.currency)}</span>,
  },
  { id: "roiBps", header: "Return", align: "right", cell: (i) => <span className="tabular text-xs">{formatBps(i.roiBps)}</span> },
  { id: "status", header: "Status", sortable: true, cell: (i) => <StatusCell status={i.status} /> },
  { id: "paymentStatus", header: "Payment", cell: (i) => <StatusCell status={i.paymentStatus} /> },
  { id: "createdAt", header: "Created", sortable: true, cell: (i) => <span className="tabular text-xs">{formatDate(i.createdAt)}</span> },
];

function ReconciliationStrip() {
  const { has, ready } = usePermissions();
  const recon = useInvestmentReconciliation(ready && has("finance.reconcile"));
  if (!ready || !has("finance.reconcile") || !recon.data) return null;
  const items = recon.data;
  return (
    <section className="financial-card mb-4 p-4">
      <h2 className="eyebrow mb-1 text-muted-foreground">Investment reconciliation</h2>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--success-fg)]">No anomalies — investments, journals and round counters agree.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((a) => (
            <li key={`${a.checkName}-${a.entityId}`} className="text-xs text-[var(--error-fg)]">
              <span className="font-mono font-semibold">{a.checkName}</span> · {a.entityType} {a.entityId.slice(0, 8)} — {a.detail}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function InvestmentsList() {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("ALL");
  const [sort, setSort] = React.useState<string | undefined>("-createdAt");
  const [page, setPage] = React.useState(1);
  const { data, isLoading, isError, refetch } = useAdminInvestments({
    query: query || undefined,
    status: status === "ALL" ? undefined : [status as InvestmentStatus],
    sort,
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <div>
      <PageHeader title="Investments" description="Every investment position across the platform — principal, expected profit and maturity kept separate." />
      <ReconciliationStrip />
      <FilterBar query={query} onQueryChange={(v) => { setQuery(v); setPage(1); }} placeholder="Search reference, investor, property…">
        <FilterSelect
          label="Investment status"
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={[
            { value: "ALL", label: "All statuses" },
            { value: "PAYMENT_PENDING", label: "Payment pending" },
            { value: "ACTIVE", label: "Active" },
            { value: "MATURITY_DUE", label: "Maturing" },
            { value: "SETTLING", label: "Settling" },
            { value: "COMPLETED", label: "Completed" },
            { value: "REVIEW_REQUIRED", label: "Under review" },
            { value: "FAILED", label: "Failed" },
            { value: "REFUNDED", label: "Refunded" },
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
        onRowClick={(i) => router.push(`/investments/${i.id}`)}
        rowKey={(i) => i.id}
        emptyTitle="No investments"
        emptyCopy="No positions match the current filters."
      />
    </div>
  );
}

export default function InvestmentsPage() {
  return (
    <PermissionGate permission="investments.read" mode="page">
      <InvestmentsList />
    </PermissionGate>
  );
}
