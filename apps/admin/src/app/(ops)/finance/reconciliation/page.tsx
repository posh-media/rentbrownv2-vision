"use client";

import * as React from "react";
import type { ReconciliationItem } from "@rentbrown/types";
import { formatDateTime, formatMoney, humanizeStatus } from "@rentbrown/utils";
import { cn } from "@rentbrown/ui";

import { useKycReconciliation, useReconciliation, useWithdrawalReconciliation } from "../../../../lib/data/hooks";
import { ColumnDef, DataTable } from "../../../../components/data-table";
import { DetailDrawer, DetailRow } from "../../../../components/detail-drawer";
import { FilterBar, FilterSelect } from "../../../../components/filter-bar";
import { PageHeader } from "../../../../components/page-header";
import { PermissionGate } from "../../../../components/permission-gate";
import { StatusCell } from "../../../../components/status-cell";

const PAGE_SIZE = 15;

const columns: ColumnDef<ReconciliationItem>[] = [
  {
    id: "externalReference",
    header: "External ref",
    sortable: true,
    cell: (r) => (
      <div>
        <p className="font-mono text-xs font-semibold">{r.externalReference}</p>
        <p className="text-[10px] uppercase tracking-wide text-tertiary">{humanizeStatus(r.source)}</p>
      </div>
    ),
  },
  {
    id: "ledgerReference",
    header: "Ledger ref",
    cell: (r) => <span className="font-mono text-xs">{r.ledgerReference ?? <span className="font-sans text-tertiary">No match</span>}</span>,
  },
  { id: "amount", header: "Amount", sortable: true, align: "right", cell: (r) => <span className="tabular font-semibold">{formatMoney(r.amount, r.currency)}</span> },
  {
    id: "status",
    header: "Status",
    sortable: true,
    cell: (r) => <StatusCell status={r.status} />,
  },
  {
    id: "note",
    header: "Note",
    cell: (r) => <span className={cn("block max-w-72 truncate text-xs text-muted-foreground", r.status === "UNMATCHED" && "text-[var(--error-fg)]")}>{r.note}</span>,
  },
  { id: "detectedAt", header: "Detected", sortable: true, cell: (r) => <span className="tabular text-xs">{formatDateTime(r.detectedAt)}</span> },
];

function ReconciliationBoard() {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("ALL");
  const [sort, setSort] = React.useState<string | undefined>("-detectedAt");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<ReconciliationItem | null>(null);
  const { data, isLoading, isError, refetch } = useReconciliation({
    query: query || undefined,
    status: status === "ALL" ? undefined : [status],
    sort,
    page,
    pageSize: PAGE_SIZE,
  });

  const { data: all } = useReconciliation({ pageSize: 100 });
  const counts = React.useMemo(() => {
    const items = all?.items ?? [];
    return {
      unmatched: items.filter((r) => r.status === "UNMATCHED").length,
      investigating: items.filter((r) => r.status === "INVESTIGATING").length,
      matched: items.filter((r) => r.status === "MATCHED").length,
      resolved: items.filter((r) => r.status === "RESOLVED").length,
    };
  }, [all]);

  return (
    <div>
      <PageHeader title="Reconciliation" description="External money movement vs ledger entries. Unmatched items need finance review." />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="financial-card border-error-border p-3">
          <p className="text-[10px] font-bold uppercase text-[var(--error-fg)]">Unmatched</p>
          <p className="tabular mt-1 text-xl font-extrabold">{counts.unmatched}</p>
        </div>
        <div className="financial-card border-warning-border p-3">
          <p className="text-[10px] font-bold uppercase text-[var(--warning-fg)]">Investigating</p>
          <p className="tabular mt-1 text-xl font-extrabold">{counts.investigating}</p>
        </div>
        <div className="financial-card p-3">
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Matched</p>
          <p className="tabular mt-1 text-xl font-extrabold">{counts.matched}</p>
        </div>
        <div className="financial-card p-3">
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Resolved</p>
          <p className="tabular mt-1 text-xl font-extrabold">{counts.resolved}</p>
        </div>
      </div>

      <FilterBar query={query} onQueryChange={(v) => { setQuery(v); setPage(1); }} placeholder="Search reference, note…">
        <FilterSelect
          label="Reconciliation status"
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={[
            { value: "ALL", label: "All statuses" },
            { value: "UNMATCHED", label: "Unmatched" },
            { value: "INVESTIGATING", label: "Investigating" },
            { value: "MATCHED", label: "Matched" },
            { value: "RESOLVED", label: "Resolved" },
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
        rowKey={(r) => r.id}
        emptyTitle="Nothing to reconcile"
        emptyCopy="All external movements match the ledger."
      />

      <DetailDrawer
        open={selected !== null}
        onOpenChange={(o) => !o && setSelected(null)}
        title={selected?.externalReference ?? ""}
        description={selected ? humanizeStatus(selected.source) : undefined}
      >
        {selected ? (
          <div>
            <div className="mb-4"><StatusCell status={selected.status} /></div>
            <DetailRow label="Amount">{formatMoney(selected.amount, selected.currency)}</DetailRow>
            <DetailRow label="External ref" mono>{selected.externalReference}</DetailRow>
            <DetailRow label="Ledger ref" mono>{selected.ledgerReference ?? "—"}</DetailRow>
            <DetailRow label="Source">{humanizeStatus(selected.source)}</DetailRow>
            <DetailRow label="Detected">{formatDateTime(selected.detectedAt)}</DetailRow>
            <DetailRow label="Note">{selected.note}</DetailRow>
          </div>
        ) : null}
      </DetailDrawer>
    </div>
  );
}

/** Phase 8B detection-only checks: withdrawal holds/payouts and KYC pipeline. */
function IntegrityChecks() {
  const withdrawals = useWithdrawalReconciliation();
  const kyc = useKycReconciliation();
  const sections = [
    { title: "Withdrawals & payout ledger", query: withdrawals },
    { title: "KYC pipeline", query: kyc },
  ] as const;

  return (
    <div className="mt-8">
      <h2 className="eyebrow mb-3 text-muted-foreground">Ledger integrity checks</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {sections.map(({ title, query }) => {
          const items = query.data ?? [];
          return (
            <section key={title} className="financial-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold">{title}</h3>
                {query.isSuccess ? (
                  <span className="text-[11px] text-muted-foreground">
                    {items.length === 0 ? "No anomalies" : `${items.length} anomal${items.length === 1 ? "y" : "ies"}`}
                  </span>
                ) : null}
              </div>
              {query.isLoading ? (
                <p className="text-xs text-muted-foreground">Running checks…</p>
              ) : query.isError ? (
                <p className="text-xs text-[var(--error-fg)]">{query.error.message}</p>
              ) : items.length === 0 ? (
                <p className="text-xs text-muted-foreground">All checks pass — nothing flagged.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {items.map((r, i) => (
                  <div key={i} className="rounded-md border border-warning-border bg-warning-soft p-3">
                    <p className="text-xs font-bold text-[var(--warning-fg)]">{r.checkName}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {r.entityType} · {r.entityId}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{r.detail}</p>
                  </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default function ReconciliationPage() {
  return (
    <PermissionGate permission="finance.read" mode="page">
      <>
        <ReconciliationBoard />
        <IntegrityChecks />
      </>
    </PermissionGate>
  );
}
