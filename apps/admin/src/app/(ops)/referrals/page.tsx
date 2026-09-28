"use client";

import * as React from "react";
import type { AdminReferralRow, RewardGrantRow, RewardReceivableRow } from "@rentbrown/types";
import {
  formatBps,
  formatDate,
  formatDateTime,
  formatMoney,
  idempotencyKey,
} from "@rentbrown/utils";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from "@rentbrown/ui";

import {
  useReevaluateReferral,
  useReferralOverview,
  useReferrals,
  useReleaseBlockedReward,
  useReverseRewardGrant,
  useRewardGrants,
  useRewardReceivables,
} from "../../../lib/data/hooks";
import { ColumnDef, DataTable } from "../../../components/data-table";
import { FilterBar } from "../../../components/filter-bar";
import { MetricSkeleton, PageHeader } from "../../../components/page-header";
import { PermissionGate } from "../../../components/permission-gate";
import { StatusCell } from "../../../components/status-cell";

const PAGE_SIZE = 15;

type GrantAction = { kind: "reverse" | "release"; grant: RewardGrantRow };
type ReferralAction = { kind: "reevaluate"; referral: AdminReferralRow };
type PendingAction = GrantAction | ReferralAction | null;

const ACTION_COPY: Record<string, { title: string; hint: string; confirm: string }> = {
  reverse: {
    title: "Reverse reward grant",
    hint: "e.g. Qualifying deposit was refunded — claw back the reward.",
    confirm: "Reverse grant",
  },
  release: {
    title: "Release blocked grant",
    hint: "e.g. Fraud review cleared — issue the reward.",
    confirm: "Release grant",
  },
  reevaluate: {
    title: "Re-evaluate referral",
    hint: "e.g. Deposit confirmed after the replay window.",
    confirm: "Re-evaluate",
  },
};

function ReferralsView() {
  const overview = useReferralOverview();
  const [refQuery, setRefQuery] = React.useState("");
  const [refSort, setRefSort] = React.useState<string | undefined>("-attributedAt");
  const [refPage, setRefPage] = React.useState(1);
  const [grantQuery, setGrantQuery] = React.useState("");
  const [grantSort, setGrantSort] = React.useState<string | undefined>("-createdAt");
  const [grantPage, setGrantPage] = React.useState(1);
  const [recvQuery, setRecvQuery] = React.useState("");
  const [recvSort, setRecvSort] = React.useState<string | undefined>("-createdAt");
  const [recvPage, setRecvPage] = React.useState(1);

  const [action, setAction] = React.useState<PendingAction>(null);
  const [reason, setReason] = React.useState("");

  const reevaluate = useReevaluateReferral();
  const reverse = useReverseRewardGrant();
  const release = useReleaseBlockedReward();

  const referrals = useReferrals({
    query: refQuery || undefined,
    sort: refSort,
    page: refPage,
    pageSize: PAGE_SIZE,
  });
  const grants = useRewardGrants({
    query: grantQuery || undefined,
    sort: grantSort,
    page: grantPage,
    pageSize: PAGE_SIZE,
  });
  const receivables = useRewardReceivables({
    query: recvQuery || undefined,
    sort: recvSort,
    page: recvPage,
    pageSize: PAGE_SIZE,
  });

  const o = overview.data;

  const confirm = () => {
    if (!action) return;
    const key = idempotencyKey("rw");
    const done = {
      onSuccess: (res: { ok: boolean; message: string; auditId: string }) => {
        if (res.ok) toast.success(res.message, { description: `Audit: ${res.auditId}` });
        else toast.error(res.message);
        setAction(null);
        setReason("");
      },
      onError: (e: Error) => toast.error(e.message),
    };
    if (action.kind === "reverse")
      reverse.mutate(
        { grantId: action.grant.id, reason: reason.trim(), idempotencyKey: key },
        done,
      );
    else if (action.kind === "release")
      release.mutate(
        { grantId: action.grant.id, reason: reason.trim(), idempotencyKey: key },
        done,
      );
    else if (action.kind === "reevaluate")
      reevaluate.mutate(
        { referralId: action.referral.id, reason: reason.trim(), idempotencyKey: key },
        done,
      );
  };

  const busy = reevaluate.isPending || reverse.isPending || release.isPending;

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
    {
      id: "codeSnapshot",
      header: "Code",
      cell: (r) => <span className="font-mono text-xs">{r.codeSnapshot}</span>,
    },
    {
      id: "attributedAt",
      header: "Attributed",
      sortable: true,
      cell: (r) => <span className="tabular text-xs">{formatDate(r.attributedAt)}</span>,
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      cell: (r) => <StatusCell status={r.status} />,
    },
    {
      id: "flags",
      header: "Flags",
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.flags.length === 0 ? (
            <span className="text-tertiary">—</span>
          ) : (
            r.flags.map((f) => (
              <Badge key={f} tone="warning" className="text-[10px]">
                {f}
              </Badge>
            ))
          )}
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (r) =>
        r.status === "JOINED" || r.status === "QUALIFIED" || r.status === "PENDING" ? (
          <PermissionGate permission="referrals.manage" mode="disable">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAction({ kind: "reevaluate", referral: r });
                setReason("");
              }}
            >
              Re-evaluate
            </Button>
          </PermissionGate>
        ) : null,
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
    {
      id: "kind",
      header: "Kind",
      sortable: true,
      cell: (g) => (
        <Badge
          tone={g.kind === "SIGNUP" ? "info" : g.kind === "TASK" ? "success" : "pending"}
          className="text-[10px]"
        >
          {g.kind}
        </Badge>
      ),
    },
    {
      id: "amount",
      header: "Amount",
      sortable: true,
      align: "right",
      cell: (g) => (
        <span className="tabular font-semibold">{formatMoney(g.amount, g.currency)}</span>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      cell: (g) => <StatusCell status={g.status} />,
    },
    {
      id: "note",
      header: "Note",
      cell: (g) => (
        <span className="block max-w-72 truncate text-xs text-muted-foreground">{g.note}</span>
      ),
    },
    {
      id: "createdAt",
      header: "Created",
      sortable: true,
      cell: (g) => <span className="tabular text-xs">{formatDate(g.createdAt)}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: (g) => (
        <PermissionGate permission="finance.reconcile" mode="disable">
          <span className="flex gap-1.5">
            {g.status === "CREDITED" || g.status === "QUALIFIED" || g.status === "PENDING" ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  setAction({ kind: "reverse", grant: g });
                  setReason("");
                }}
              >
                Reverse
              </Button>
            ) : null}
            {g.status === "BLOCKED" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAction({ kind: "release", grant: g });
                  setReason("");
                }}
              >
                Release
              </Button>
            ) : null}
          </span>
        </PermissionGate>
      ),
    },
  ];

  const receivableColumns: ColumnDef<RewardReceivableRow>[] = [
    {
      id: "userDisplayName",
      header: "User",
      sortable: true,
      cell: (r) => <span className="text-xs font-semibold">{r.userDisplayName}</span>,
    },
    {
      id: "sourceGrantId",
      header: "Source grant",
      cell: (r) => <span className="font-mono text-xs">{r.sourceGrantId}</span>,
    },
    {
      id: "amount",
      header: "Amount",
      sortable: true,
      align: "right",
      cell: (r) => (
        <span className="tabular font-semibold">{formatMoney(r.amount, r.currency)}</span>
      ),
    },
    {
      id: "outstanding",
      header: "Outstanding",
      sortable: true,
      align: "right",
      cell: (r) => (
        <span className="tabular font-semibold">{formatMoney(r.outstanding, r.currency)}</span>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      cell: (r) => <StatusCell status={r.status} />,
    },
    {
      id: "createdAt",
      header: "Opened",
      sortable: true,
      cell: (r) => <span className="tabular text-xs">{formatDateTime(r.createdAt)}</span>,
    },
    {
      id: "settledAt",
      header: "Settled",
      cell: (r) => (
        <span className="tabular text-xs">{r.settledAt ? formatDateTime(r.settledAt) : "—"}</span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Referrals & rewards"
        description="Attribution, reward grants, clawback receivables and the live referral policy (server-owned values)."
      />

      {overview.isLoading ? (
        <MetricSkeleton count={4} />
      ) : o ? (
        <div className="grid gap-3 lg:grid-cols-5">
          {/* Policy card — values from the server, never hardcoded */}
          <div className="financial-card p-4 lg:col-span-2">
            <div className="flex items-center justify-between">
              <p className="eyebrow text-muted-foreground">Active policy</p>
              <Badge tone="info" className="font-mono text-[10px]">
                {o.policy.version}
              </Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <p className="text-muted-foreground">Signup reward</p>
                <p className="tabular font-extrabold">
                  {formatMoney(o.policy.signupReward, o.policy.currency)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Qualifying deposit</p>
                <p className="tabular font-extrabold">
                  {formatMoney(o.policy.qualifyingDeposit, o.policy.currency)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Deposit reward</p>
                <p className="tabular font-extrabold">{formatBps(o.policy.depositReferralBps)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Per-deposit cap</p>
                <p className="tabular font-extrabold">
                  {formatMoney(o.policy.depositReferralCap, o.policy.currency)}
                </p>
              </div>
            </div>
            {o.policy.qualificationRule ? (
              <p className="mt-3 border-t pt-2 text-[11px] text-muted-foreground">
                {o.policy.qualificationRule}
              </p>
            ) : null}
          </div>
          <div className="financial-card p-4">
            <p className="eyebrow text-muted-foreground">Attributed</p>
            <p className="tabular mt-2 text-2xl font-extrabold">{o.totals.attributed}</p>
            <p className="mt-1 text-xs text-muted-foreground">{o.totals.qualified} qualified</p>
          </div>
          <div className="financial-card p-4">
            <p className="eyebrow text-muted-foreground">Pending rewards</p>
            <p className="tabular mt-2 text-2xl font-extrabold">
              {formatMoney(o.totals.pendingRewards, o.totals.currency)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">pending + qualified grants</p>
          </div>
          <div className="financial-card p-4">
            <p className="eyebrow text-muted-foreground">Credited</p>
            <p className="tabular mt-2 text-2xl font-extrabold">
              {formatMoney(o.totals.creditedRewards, o.totals.currency)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatMoney(o.totals.reversedRewards, o.totals.currency)} reversed
            </p>
          </div>
        </div>
      ) : null}

      <Tabs defaultValue="grants" className="mt-6">
        <TabsList className="mb-4">
          <TabsTrigger value="grants">Reward grants</TabsTrigger>
          <TabsTrigger value="referrals">Referrals</TabsTrigger>
          <TabsTrigger value="receivables">Receivables</TabsTrigger>
        </TabsList>
        <TabsContent value="grants">
          <FilterBar
            query={grantQuery}
            onQueryChange={(v) => {
              setGrantQuery(v);
              setGrantPage(1);
            }}
            placeholder="Search referrer, referred…"
          />
          <DataTable
            columns={grantColumns}
            page={grants.data}
            isLoading={grants.isLoading}
            isError={grants.isError}
            onRetry={() => grants.refetch()}
            sort={grantSort}
            onSortChange={(s) => {
              setGrantSort(s);
              setGrantPage(1);
            }}
            onPageChange={setGrantPage}
            rowKey={(g) => g.id}
            emptyTitle="No grants"
            emptyCopy="No reward grants yet."
          />
        </TabsContent>
        <TabsContent value="referrals">
          <FilterBar
            query={refQuery}
            onQueryChange={(v) => {
              setRefQuery(v);
              setRefPage(1);
            }}
            placeholder="Search name, code…"
          />
          <DataTable
            columns={referralColumns}
            page={referrals.data}
            isLoading={referrals.isLoading}
            isError={referrals.isError}
            onRetry={() => referrals.refetch()}
            sort={refSort}
            onSortChange={(s) => {
              setRefSort(s);
              setRefPage(1);
            }}
            onPageChange={setRefPage}
            rowKey={(r) => r.id}
            emptyTitle="No referrals"
            emptyCopy="No referrals attributed yet."
          />
        </TabsContent>
        <TabsContent value="receivables">
          <FilterBar
            query={recvQuery}
            onQueryChange={(v) => {
              setRecvQuery(v);
              setRecvPage(1);
            }}
            placeholder="Search user, grant…"
          />
          <DataTable
            columns={receivableColumns}
            page={receivables.data}
            isLoading={receivables.isLoading}
            isError={receivables.isError}
            onRetry={() => receivables.refetch()}
            sort={recvSort}
            onSortChange={(s) => {
              setRecvSort(s);
              setRecvPage(1);
            }}
            onPageChange={setRecvPage}
            rowKey={(r) => r.id}
            emptyTitle="No receivables"
            emptyCopy="Open clawback debts appear here when credited reward value is reversed."
          />
        </TabsContent>
      </Tabs>

      <Dialog open={action !== null} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action ? ACTION_COPY[action.kind]!.title : ""}</DialogTitle>
            <DialogDescription>
              {action?.kind === "reevaluate"
                ? `${action.referral.referrerName} → ${action.referral.referredName}`
                : action
                  ? `${action.grant.kind} grant ${action.grant.id} · ${formatMoney(action.grant.amount, action.grant.currency)}`
                  : ""}
            </DialogDescription>
          </DialogHeader>
          <Field label="Reason" htmlFor="rw-action-reason">
            <Textarea
              id="rw-action-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={action ? ACTION_COPY[action.kind]!.hint : ""}
            />
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAction(null)}>
              Cancel
            </Button>
            <Button
              variant={action?.kind === "reverse" ? "destructive" : "primary"}
              disabled={reason.trim().length < 3 || busy}
              onClick={confirm}
            >
              {busy ? "Recording…" : action ? ACTION_COPY[action.kind]!.confirm : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
