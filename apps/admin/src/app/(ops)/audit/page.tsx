"use client";

import * as React from "react";
import type { AuditEvent, AuditResult } from "@rentbrown/types";
import { formatDateTime, humanizeStatus } from "@rentbrown/utils";
import { Badge, cn } from "@rentbrown/ui";

import { useAuditEvents } from "../../../lib/data/hooks";
import { ColumnDef, DataTable } from "../../../components/data-table";
import { FilterBar, FilterSelect } from "../../../components/filter-bar";
import { PageHeader } from "../../../components/page-header";
import { PermissionGate } from "../../../components/permission-gate";

const PAGE_SIZE = 15;

const RESULT_TONE: Record<AuditResult, string> = {
  SUCCESS: "text-[var(--success-fg)]",
  DENIED: "text-[var(--warning-fg)]",
  FAILED: "text-[var(--error-fg)]",
};

const columns: ColumnDef<AuditEvent>[] = [
  {
    id: "occurredAt",
    header: "When",
    sortable: true,
    cell: (e) => <span className="tabular text-xs">{formatDateTime(e.occurredAt)}</span>,
  },
  {
    id: "actor",
    header: "Actor",
    sortable: true,
    cell: (e) => (
      <div>
        <p className="text-xs font-semibold">{e.actor.displayName}</p>
        <p className="font-mono text-[10px] text-tertiary">{e.actor.role}</p>
      </div>
    ),
  },
  { id: "action", header: "Action", sortable: true, cell: (e) => <span className="font-mono text-xs font-semibold">{e.action}</span> },
  {
    id: "resource",
    header: "Resource",
    cell: (e) => (
      <span className="font-mono text-[11px] text-muted-foreground">
        {e.resource.type}:{e.resource.id}
      </span>
    ),
  },
  {
    id: "result",
    header: "Result",
    sortable: true,
    cell: (e) => <span className={cn("text-xs font-bold", RESULT_TONE[e.result])}>{humanizeStatus(e.result)}</span>,
  },
  { id: "requestId", header: "Request id", cell: (e) => <span className="font-mono text-[10px] text-tertiary">{e.requestId}</span> },
  { id: "ip", header: "IP", cell: (e) => <span className="font-mono text-[10px] text-tertiary">{e.ip ?? "—"}</span> },
];

function AuditView() {
  const [query, setQuery] = React.useState("");
  const [result, setResult] = React.useState<AuditResult | "ALL">("ALL");
  const [sort, setSort] = React.useState<string | undefined>("-occurredAt");
  const [page, setPage] = React.useState(1);
  const [expanded, setExpanded] = React.useState<AuditEvent | null>(null);
  const { data, isLoading, isError, refetch } = useAuditEvents({
    query: query || undefined,
    result: result === "ALL" ? undefined : [result],
    sort,
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <div>
      <PageHeader title="Audit log" description="Immutable trail of every admin action. Click a row for the full summary." />
      <FilterBar query={query} onQueryChange={(v) => { setQuery(v); setPage(1); }} placeholder="Search actor, action, resource…">
        <FilterSelect
          label="Result"
          value={result}
          onChange={(v) => { setResult(v as AuditResult | "ALL"); setPage(1); }}
          options={[
            { value: "ALL", label: "All results" },
            { value: "SUCCESS", label: "Success" },
            { value: "DENIED", label: "Denied" },
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
        onRowClick={(e) => setExpanded(expanded?.id === e.id ? null : e)}
        rowKey={(e) => e.id}
        emptyTitle="No events"
        emptyCopy="No audit events match the current filters."
      />

      {expanded ? (
        <div className="financial-card mt-4 border-info-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-xs font-bold">{expanded.action} · {expanded.resource.type}:{expanded.resource.id}</p>
            <Badge tone="info" className="text-[10px]">{expanded.id}</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{expanded.summary}</p>
          <p className="mt-2 font-mono text-[10px] text-tertiary">
            {expanded.actor.displayName} ({expanded.actor.role}) · {formatDateTime(expanded.occurredAt)} · req {expanded.requestId}
            {expanded.ip ? ` · ${expanded.ip}` : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export default function AuditPage() {
  return (
    <PermissionGate permission="audit.read" mode="page">
      <AuditView />
    </PermissionGate>
  );
}
