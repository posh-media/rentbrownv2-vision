"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { AdminKycCase, KycReviewQueue } from "@rentbrown/types";
import { formatDateTime } from "@rentbrown/utils";
import { Tabs, TabsList, TabsTrigger } from "@rentbrown/ui";

import { useKycCases } from "../../lib/data/hooks";
import { ColumnDef, DataTable } from "../../components/data-table";
import { FilterBar } from "../../components/filter-bar";
import { PageHeader } from "../../components/page-header";
import { PermissionGate } from "../../components/permission-gate";
import { StatusCell } from "../../components/status-cell";

const PAGE_SIZE = 15;

const QUEUES: Array<{ id: KycReviewQueue; label: string }> = [
  { id: "PENDING", label: "Pending" },
  { id: "NEEDS_ACTION", label: "Needs action" },
  { id: "VERIFIED", label: "Verified" },
  { id: "REJECTED", label: "Rejected" },
];

const columns: ColumnDef<AdminKycCase>[] = [
  {
    id: "userDisplayName",
    header: "Applicant",
    sortable: true,
    cell: (c) => (
      <div className="min-w-0">
        <p className="truncate font-semibold text-foreground">{c.userDisplayName}</p>
        <p className="font-mono text-[11px] text-tertiary">{c.id}</p>
      </div>
    ),
  },
  { id: "tier", header: "Tier", cell: (c) => <span className="text-xs font-semibold">{c.tier === "TIER_2" ? "Tier 2" : "Tier 1"}</span> },
  {
    id: "documentType",
    header: "Document",
    sortable: true,
    cell: (c) => (
      <div>
        <p className="text-xs font-semibold">{c.documentType.replace("_", " ")}</p>
        <p className="font-mono text-[11px] text-tertiary">{c.documentNumberMasked}</p>
      </div>
    ),
  },
  {
    id: "checks",
    header: "Checks",
    cell: (c) => {
      const failed = c.checks.filter((x) => x.status === "FAILED").length;
      const pending = c.checks.filter((x) => x.status === "PENDING" || x.status === "MANUAL").length;
      return (
        <span className="text-xs text-muted-foreground">
          {c.checks.length - failed - pending} passed{failed ? ` · ${failed} failed` : ""}{pending ? ` · ${pending} open` : ""}
        </span>
      );
    },
  },
  { id: "submittedAt", header: "Submitted", sortable: true, cell: (c) => <span className="tabular text-xs">{formatDateTime(c.submittedAt)}</span> },
  { id: "ageLabel", header: "Age", cell: (c) => <span className="tabular text-xs font-semibold">{c.ageLabel}</span> },
  { id: "reviewer", header: "Reviewer", cell: (c) => <span className="text-xs">{c.reviewer ?? <span className="text-tertiary">Unassigned</span>}</span> },
  { id: "status", header: "Status", sortable: true, cell: (c) => <StatusCell status={c.status} /> },
];

function KycQueue() {
  const router = useRouter();
  const [queue, setQueue] = React.useState<KycReviewQueue>("PENDING");
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<string | undefined>("submittedAt");
  const [page, setPage] = React.useState(1);

  const { data, isLoading, isError, refetch } = useKycCases({ queue, query: query || undefined, sort, page, pageSize: PAGE_SIZE });
  const { data: all } = useKycCases({ pageSize: 100 });

  const counts = React.useMemo(() => {
    const map = new Map<KycReviewQueue, number>();
    for (const c of all?.items ?? []) map.set(c.queue, (map.get(c.queue) ?? 0) + 1);
    return map;
  }, [all]);

  return (
    <div>
      <PageHeader title="KYC review" description="Identity verification queue. Decisions are mock intents recorded to the audit trail." />

      <Tabs value={queue} onValueChange={(v) => { setQueue(v as KycReviewQueue); setPage(1); }}>
        <TabsList className="mb-4">
          {QUEUES.map((q) => (
            <TabsTrigger key={q.id} value={q.id}>
              {q.label}
              <span className="ml-1.5 rounded-full bg-surface-sunken px-1.5 py-0.5 text-[10px] font-extrabold tabular">
                {counts.get(q.id) ?? "–"}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <FilterBar query={query} onQueryChange={(v) => { setQuery(v); setPage(1); }} placeholder="Search applicant, case id…" />

      <DataTable
        columns={columns}
        page={data}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        sort={sort}
        onSortChange={(s) => { setSort(s); setPage(1); }}
        onPageChange={setPage}
        onRowClick={(c) => router.push(`/kyc/${c.id}`)}
        rowKey={(c) => c.id}
        emptyTitle="Queue is clear"
        emptyCopy="No cases in this queue right now."
      />
    </div>
  );
}

export default function KycPage() {
  return (
    <PermissionGate permission="kyc.read" mode="page">
      <KycQueue />
    </PermissionGate>
  );
}
