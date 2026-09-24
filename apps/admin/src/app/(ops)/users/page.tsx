"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AccountStatus, AdminUserRow, KycStatus } from "@rentbrown/types";
import { formatMoney } from "@rentbrown/utils";
import { Badge, StatePanel } from "@rentbrown/ui";

import { useUsers } from "../../../lib/data/hooks";
import { ColumnDef, DataTable } from "../../../components/data-table";
import { FilterBar, FilterSelect } from "../../../components/filter-bar";
import { PageHeader } from "../../../components/page-header";
import { PermissionGate } from "../../../components/permission-gate";
import { StatusCell } from "../../../components/status-cell";

const PAGE_SIZE = 15;

const columns: ColumnDef<AdminUserRow>[] = [
  {
    id: "displayName",
    header: "User",
    sortable: true,
    cell: (u) => (
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary-soft text-[10px] font-extrabold text-primary">
          {u.initials}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{u.displayName}</p>
          <p className="truncate text-xs text-muted-foreground">{u.email}</p>
        </div>
      </div>
    ),
  },
  { id: "accountStatus", header: "Status", sortable: true, cell: (u) => <StatusCell status={u.accountStatus} /> },
  { id: "kycStatus", header: "KYC", sortable: true, cell: (u) => <StatusCell status={u.kycStatus} /> },
  {
    id: "activePrincipal",
    header: "Active principal",
    sortable: true,
    align: "right",
    cell: (u) => <span className="tabular font-semibold">{formatMoney(u.activePrincipal, u.currency)}</span>,
  },
  {
    id: "walletAvailable",
    header: "Available",
    sortable: true,
    align: "right",
    cell: (u) => <span className="tabular text-muted-foreground">{formatMoney(u.walletAvailable, u.currency)}</span>,
  },
  {
    id: "activeInvestments",
    header: "Inv.",
    sortable: true,
    align: "right",
    cell: (u) => <span className="tabular">{u.activeInvestments}</span>,
  },
  {
    id: "flags",
    header: "Flags",
    cell: (u) => (
      <div className="flex flex-wrap gap-1">
        {u.flags.length === 0 ? <span className="text-tertiary">—</span> : u.flags.map((f) => (
          <Badge key={f} tone={f === "pep-screen" || f === "chargeback-risk" ? "warning" : "neutral"} className="text-[10px]">
            {f}
          </Badge>
        ))}
      </div>
    ),
  },
];

function UsersTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = React.useState(searchParams.get("query") ?? "");
  const [accountStatus, setAccountStatus] = React.useState("ALL");
  const [kycStatus, setKycStatus] = React.useState("ALL");
  const [sort, setSort] = React.useState<string | undefined>("-lastActiveAt");
  const [page, setPage] = React.useState(1);

  const { data, isLoading, isError, refetch } = useUsers({
    query: query || undefined,
    accountStatus: accountStatus === "ALL" ? undefined : [accountStatus as AccountStatus],
    kycStatus: kycStatus === "ALL" ? undefined : [kycStatus as KycStatus],
    sort,
    page,
    pageSize: PAGE_SIZE,
  });

  const reset = () => setPage(1);

  return (
    <div>
      <PageHeader title="Users" description="Investor accounts, statuses and flags. Status changes are mock intents only." />
      <FilterBar
        query={query}
        onQueryChange={(v) => {
          setQuery(v);
          reset();
        }}
        placeholder="Search name, email, referral code…"
      >
        <FilterSelect
          label="Account status"
          value={accountStatus}
          onChange={(v) => {
            setAccountStatus(v);
            reset();
          }}
          options={[
            { value: "ALL", label: "All statuses" },
            { value: "ACTIVE", label: "Active" },
            { value: "RESTRICTED", label: "Restricted" },
            { value: "SUSPENDED", label: "Suspended" },
          ]}
        />
        <FilterSelect
          label="KYC status"
          value={kycStatus}
          onChange={(v) => {
            setKycStatus(v);
            reset();
          }}
          options={[
            { value: "ALL", label: "All KYC" },
            { value: "VERIFIED", label: "Verified" },
            { value: "PENDING_REVIEW", label: "Pending review" },
            { value: "IN_PROGRESS", label: "In progress" },
            { value: "NOT_STARTED", label: "Not started" },
            { value: "REJECTED", label: "Rejected" },
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
        onSortChange={(s) => {
          setSort(s);
          reset();
        }}
        onPageChange={setPage}
        onRowClick={(u) => router.push(`/users/${u.id}`)}
        rowKey={(u) => u.id}
        emptyTitle="No users found"
        emptyCopy="Try clearing the search or filters."
      />
    </div>
  );
}

export default function UsersPage() {
  return (
    <PermissionGate permission="users.read" mode="page">
      <React.Suspense fallback={<StatePanel title="Loading users…" />}>
        <UsersTable />
      </React.Suspense>
    </PermissionGate>
  );
}
