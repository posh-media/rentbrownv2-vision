"use client";

import * as React from "react";
import type { AdminReferralRow, RewardGrantRow } from "@rentbrown/types";
import { formatBps, formatDate, formatDateTime, formatMoney } from "@rentbrown/utils";
import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from "@rentbrown/ui";

import { useReferralOverview, useReferrals, useRewardGrants } from "../../../lib/data/hooks";
import { ColumnDef, DataTable } from "../../../components/data-table";
import { FilterBar } from "../../../components/filter-bar";
import { MetricSkeleton, PageHeader } from "../../../components/page-header";
import { PermissionGate } from "../../../components/permission-gate";
import { StatusCell } from "../../../components/status-cell";

const PAGE_SIZE = 15;

const referralColumns: ColumnDef<AdminReferralRow>[] = [
  {
    id: "referrerName",
    header: "Referrer → Referred",
    sortable: true,
    cell: (r) => (
      <span className="text-xs font-semibold">
        {r.referrerName} <span className="text-tertiary">→</span> {r.referredName}
      </span>
    ),
  },
  { id: "codeSnapshot", header: "Code", cell: (r) => <span className="font-mono text-xs">{r.codeSnapshot}</span> },
  { id: "attributedAt", header: "Attributed", sortable: true, cell: (r) => <span className="tabular text-xs">{formatDate(r.attributedAt)}</span> },
  { id: "status", header: "Status", sortable: true, cell: (r) => <StatusCell status={r.status} /> },
  {
    id: "flags",
    header: "Flags",
    cell: (r) => (
      <div className="flex flex-wrap gap-1">
        {r.flags.length === 0 ? <span className="text-tertiary">—</span> : r.flags.map((f) => <Badge key={f} tone="warning" className="text-[10px]">{f}</Badge>)}
      </div>
    ),
  },
];

const grantColumns: ColumnDef<RewardGrantRow>[] = [
  {
    id: "referrerName",
    header: "Referrer",
    sortable: true,
    cell: (g) => (
      <div>
        <p className="text-xs font-semibold">{g.referrerName}</p>
        <p className="text-[11px] text-muted-foreground">for {g.referredName}</p>
      </div>
    ),
  },
  { id: "kind", header: "Kind", sortable: true, cell: (g) => <Badge tone={g.kind === "SIGNUP" ? "info" : "pending"} className="text-[10px]">{g.kind}</Badge> },
  { id: "amount", header: "Amount", sortable: true, align: "right", cell: (g) => <span className="tabular font-semibold">{formatMoney(g.amount, g.currency)}</span> },
  { id: "status", header: "Status", sortable: true, cell: (g) => <StatusCell status={g.status} /> },
  { id: "note", header: "Note", cell: (g) => <span className="block max-w-72 truncate text-xs text-muted-foreground">{g.note}</span> },
  { id: "createdAt", header: "Created", sortable: true, cell: (g) => <span className="tabular text-xs">{formatDate(g.createdAt)}</span> },
  { id: "creditedAt", header: "Credited", cell: (g) => <span className="tabular text-xs">{g.creditedAt ? formatDateTime(g.creditedAt) : "—"}</span> },
];

function ReferralsView() {
  const overview = useReferralOverview();
  const [refQuery, setRefQuery] = React.useState("");
  const [refSort, setRefSort] = React.useState<string | undefined>("-attributedAt");
  const [refPage, setRefPage] = React.useState(1);
  const [grantQuery, setGrantQuery] = React.useState("");
  const [grantSort, setGrantSort] = React.useState<string | undefined>("-createdAt");
  const [grantPage, setGrantPage] = React.useState(1);

  const referrals = useReferrals({ query: refQuery || undefined, sort: refSort, page: refPage, pageSize: PAGE_SIZE });
  const grants = useRewardGrants({ query: grantQuery || undefined, sort: grantSort, page: grantPage, pageSize: PAGE_SIZE });

  const o = overview.data;

  return (
    <div>
      <PageHeader title="Referrals & rewards" description="Attribution, reward grants and the live referral policy (server-owned values)." />

      {overview.isLoading ? (
        <MetricSkeleton count={4} />
      ) : o ? (
        <div className="grid gap-3 lg:grid-cols-5">
          {/* Policy card — values from fixture, never hardcoded */}
          <div className="financial-card p-4 lg:col-span-2">
            <div className="flex items-center justify-between">
              <p className="eyebrow text-muted-foreground">Active policy</p>
              <Badge tone="info" className="font-mono text-[10px]">{o.policy.version}</Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <p className="text-muted-foreground">Signup reward</p>
                <p className="tabular font-extrabold">{formatMoney(o.policy.signupReward, o.policy.currency)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Qualifying deposit</p>
                <p className="tabular font-extrabold">{formatMoney(o.policy.qualifyingDeposit, o.policy.currency)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Deposit reward</p>
                <p className="tabular font-extrabold">{formatBps(o.policy.depositReferralBps)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Per-user cap</p>
                <p className="tabular font-extrabold">{formatMoney(o.policy.depositReferralCap, o.policy.currency)}</p>
              </div>
            </div>
            <p className="mt-3 border-t pt-2 text-[11px] text-muted-foreground">{o.policy.qualificationRule}</p>
          </div>
          <div className="financial-card p-4">
            <p className="eyebrow text-muted-foreground">Attributed</p>
            <p className="tabular mt-2 text-2xl font-extrabold">{o.totals.attributed}</p>
            <p className="mt-1 text-xs text-muted-foreground">{o.totals.qualified} qualified</p>
          </div>
          <div className="financial-card p-4">
            <p className="eyebrow text-muted-foreground">Pending rewards</p>
            <p className="tabular mt-2 text-2xl font-extrabold">{formatMoney(o.totals.pendingRewards, o.totals.currency)}</p>
            <p className="mt-1 text-xs text-muted-foreground">pending + qualified grants</p>
          </div>
          <div className="financial-card p-4">
            <p className="eyebrow text-muted-foreground">Credited</p>
            <p className="tabular mt-2 text-2xl font-extrabold">{formatMoney(o.totals.creditedRewards, o.totals.currency)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{formatMoney(o.totals.reversedRewards, o.totals.currency)} reversed/blocked</p>
          </div>
        </div>
      ) : null}

      <Tabs defaultValue="grants" className="mt-6">
        <TabsList className="mb-4">
          <TabsTrigger value="grants">Reward grants</TabsTrigger>
          <TabsTrigger value="referrals">Referrals</TabsTrigger>
        </TabsList>
        <TabsContent value="grants">
          <FilterBar query={grantQuery} onQueryChange={(v) => { setGrantQuery(v); setGrantPage(1); }} placeholder="Search referrer, referred…" />
          <DataTable
            columns={grantColumns}
            page={grants.data}
            isLoading={grants.isLoading}
            isError={grants.isError}
            onRetry={() => grants.refetch()}
            sort={grantSort}
            onSortChange={(s) => { setGrantSort(s); setGrantPage(1); }}
            onPageChange={setGrantPage}
            rowKey={(g) => g.id}
            emptyTitle="No grants"
            emptyCopy="No reward grants yet."
          />
        </TabsContent>
        <TabsContent value="referrals">
          <FilterBar query={refQuery} onQueryChange={(v) => { setRefQuery(v); setRefPage(1); }} placeholder="Search name, code…" />
          <DataTable
            columns={referralColumns}
            page={referrals.data}
            isLoading={referrals.isLoading}
            isError={referrals.isError}
            onRetry={() => referrals.refetch()}
            sort={refSort}
            onSortChange={(s) => { setRefSort(s); setRefPage(1); }}
            onPageChange={setRefPage}
            rowKey={(r) => r.id}
            emptyTitle="No referrals"
            emptyCopy="No referrals attributed yet."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function ReferralsPage() {
  return (
    <PermissionGate permission="referrals.read" mode="page">
      <ReferralsView />
    </PermissionGate>
  );
}
