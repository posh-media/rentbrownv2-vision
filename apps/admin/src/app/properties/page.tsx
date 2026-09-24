"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { AdminPropertyRow } from "@rentbrown/types";
import { formatDate, formatMoney } from "@rentbrown/utils";

import { useProperties } from "../../lib/data/hooks";
import { propertyImage } from "../../lib/images";
import { ColumnDef, DataTable } from "../../components/data-table";
import { FilterBar } from "../../components/filter-bar";
import { PageHeader } from "../../components/page-header";
import { PermissionGate } from "../../components/permission-gate";
import { StatusCell } from "../../components/status-cell";

const PAGE_SIZE = 12;

const columns: ColumnDef<AdminPropertyRow>[] = [
  {
    id: "name",
    header: "Property",
    sortable: true,
    cell: (p) => (
      <div className="flex items-center gap-3">
        <span className="relative block size-10 shrink-0 overflow-hidden rounded-md bg-surface-sunken">
          <Image src={propertyImage(p.images[0] ?? "ikoyi-residences")} alt="" fill sizes="40px" className="object-cover" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{p.name}</p>
          <p className="truncate text-xs text-muted-foreground">{p.location.label} · {p.type}</p>
        </div>
      </div>
    ),
  },
  { id: "status", header: "Status", sortable: true, cell: (p) => <StatusCell status={p.status} /> },
  { id: "plans", header: "Plans", align: "right", cell: (p) => <span className="tabular">{p.plans}</span> },
  { id: "openRounds", header: "Open rounds", align: "right", cell: (p) => <span className="tabular">{p.openRounds}</span> },
  {
    id: "totalRaised",
    header: "Raised",
    sortable: true,
    align: "right",
    cell: (p) => <span className="tabular font-semibold">{formatMoney(p.totalRaised, p.currency)}</span>,
  },
  {
    id: "evidenceCount",
    header: "Evidence",
    align: "right",
    cell: (p) => (
      <span className="text-xs">
        {p.evidenceCount} docs{p.evidencePending > 0 ? <span className="ml-1 font-semibold text-[var(--warning-fg)]">({p.evidencePending} pending)</span> : ""}
      </span>
    ),
  },
  { id: "updatedAt", header: "Updated", sortable: true, cell: (p) => <span className="tabular text-xs">{formatDate(p.updatedAt)}</span> },
];

function PropertiesList() {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<string | undefined>("-totalRaised");
  const [page, setPage] = React.useState(1);
  const { data, isLoading, isError, refetch } = useProperties({ query: query || undefined, sort, page, pageSize: PAGE_SIZE });

  return (
    <div>
      <PageHeader title="Properties" description="Catalogue assets with publication status, raised totals and evidence coverage." />
      <FilterBar query={query} onQueryChange={(v) => { setQuery(v); setPage(1); }} placeholder="Search name, area, type…" />
      <DataTable
        columns={columns}
        page={data}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        sort={sort}
        onSortChange={(s) => { setSort(s); setPage(1); }}
        onPageChange={setPage}
        onRowClick={(p) => router.push(`/properties/${p.id}`)}
        rowKey={(p) => p.id}
        emptyTitle="No properties"
        emptyCopy="The catalogue is empty."
      />
    </div>
  );
}

export default function PropertiesPage() {
  return (
    <PermissionGate permission="catalogue.read" mode="page">
      <PropertiesList />
    </PermissionGate>
  );
}
