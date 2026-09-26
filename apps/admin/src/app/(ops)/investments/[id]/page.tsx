"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { InvestmentStatus } from "@rentbrown/types";
import { formatBps, formatDateTime, formatMoney, idempotencyKey } from "@rentbrown/utils";
import { Button, StatePanel, Timeline, toast, type TimelineItem } from "@rentbrown/ui";

import {
  useAdminInvestment,
  useMarkInvestmentReview,
  useResolveInvestmentReview,
} from "../../../../lib/data/hooks";
import { usePermissions } from "../../../../lib/data/provider";
import { DetailRow } from "../../../../components/detail-drawer";
import { BackLink, PageHeader, TableSkeleton } from "../../../../components/page-header";
import { PermissionGate } from "../../../../components/permission-gate";
import { StatusCell } from "../../../../components/status-cell";

function timelineFor(i: NonNullable<ReturnType<typeof useAdminInvestment>["data"]>): TimelineItem[] {
  // Real lifecycle events win when the backend provides them (Phase 6B);
  // otherwise derive the rail from timestamps as before.
  if (i.events?.length) {
    const items: TimelineItem[] = i.events.map((e) => ({
      id: e.id,
      label: e.actor === "ADMIN" ? `${e.label} (admin)` : e.label,
      at: e.at,
      state: "done",
    }));
    if (i.maturesAt && !["COMPLETED", "FAILED", "REFUNDED"].includes(i.status)) {
      items.push({ id: "matures", label: "Maturity", at: i.maturesAt, state: "upcoming" });
      if (i.status !== "SETTLING") items.push({ id: "settled", label: "Settled", at: null, state: "upcoming" });
    }
    return items;
  }
  const items: TimelineItem[] = [
    { id: "created", label: "Created", at: i.createdAt, state: "done", reference: i.reference },
    { id: "activated", label: "Activated", at: i.activatedAt, state: i.activatedAt ? "done" : "current" },
    { id: "matures", label: "Maturity", at: i.maturesAt, state: i.settledAt ? "done" : i.activatedAt ? "upcoming" : "upcoming" },
    { id: "settled", label: "Settled", at: i.settledAt, state: i.settledAt ? "done" : "upcoming" },
  ];
  if (i.status === "PAYMENT_PENDING") items[1] = { ...items[1]!, label: "Awaiting payment", state: "current" };
  if (i.status === "FAILED" || i.status === "REFUNDED") {
    items[2] = { ...items[2]!, state: "upcoming" };
    items[3] = { id: "ended", label: i.status === "FAILED" ? "Failed" : "Refunded", at: i.settledAt, state: "done" };
  }
  return items;
}

const RESOLVE_OPTIONS: InvestmentStatus[] = ["ACTIVE", "FAILED", "REFUNDED"];

function ReviewActions({ investment }: { investment: NonNullable<ReturnType<typeof useAdminInvestment>["data"]> }) {
  const { has } = usePermissions();
  const [reason, setReason] = React.useState("");
  const [resolveTo, setResolveTo] = React.useState<InvestmentStatus>("ACTIVE");
  const mark = useMarkInvestmentReview();
  const resolve = useResolveInvestmentReview();
  const pending = mark.isPending || resolve.isPending;

  if (!has("finance.reconcile")) return null;

  const act = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    fn()
      .then((r) => (r.ok ? toast.success(r.message) : toast.error(r.message)))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Action failed"));

  return (
    <section className="financial-card p-4">
      <h2 className="eyebrow mb-2 text-muted-foreground">Review</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Audited status change only — investment economics are never editable.
      </p>
      <textarea
        className="mb-3 w-full rounded-md border border-border bg-transparent p-2 text-sm"
        rows={2}
        placeholder="Reason (required — recorded in the audit log)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        {investment.status === "REVIEW_REQUIRED" ? (
          <>
            <select
              className="h-9 rounded-md border border-border bg-transparent px-2 text-sm"
              value={resolveTo}
              onChange={(e) => setResolveTo(e.target.value as InvestmentStatus)}
            >
              {RESOLVE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s.replace("_", " ").toLowerCase()}</option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={pending || !reason.trim()}
              onClick={() => act(() => resolve.mutateAsync({ investmentId: investment.id, to: resolveTo, reason: reason.trim(), idempotencyKey: idempotencyKey() }))}
            >
              Resolve review
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !reason.trim() || ["COMPLETED", "REFUNDED"].includes(investment.status)}
            onClick={() => act(() => mark.mutateAsync({ investmentId: investment.id, reason: reason.trim(), idempotencyKey: idempotencyKey() }))}
          >
            Mark for review
          </Button>
        )}
      </div>
    </section>
  );
}

function InvestmentDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: inv, isLoading, isError } = useAdminInvestment(id);

  if (isLoading) {
    return (
      <div>
        <BackLink href="/investments" label="Investments" />
        <TableSkeleton rows={6} cols={4} />
      </div>
    );
  }
  if (isError || !inv) {
    return (
      <div>
        <BackLink href="/investments" label="Investments" />
        <StatePanel tone="error" title="Investment not found" copy="This position may not exist in the mock dataset." />
      </div>
    );
  }

  return (
    <div>
      <BackLink href="/investments" label="Investments" />
      <PageHeader
        title={<span className="font-mono text-lg">{inv.reference}</span>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusCell status={inv.status} />
            <StatusCell status={inv.paymentStatus} />
            <span className="text-xs text-muted-foreground">{inv.fundingSource.replace("_", " ").toLowerCase()} funded</span>
            {inv.seedTag ? (
              <span className="rounded-full bg-[var(--warning-bg)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--warning-fg)]">
                seed: {inv.seedTag}
              </span>
            ) : null}
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Three separate figures — never blended */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="financial-card p-4">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Principal</p>
              <p className="tabular mt-1 text-xl font-extrabold">{formatMoney(inv.principal, inv.currency)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{inv.slots} slots · {inv.roundNumber ? `Round ${inv.roundNumber}` : ""}</p>
            </div>
            <div className="financial-card p-4">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Expected profit</p>
              <p className="tabular mt-1 text-xl font-extrabold">{formatMoney(inv.expectedProfit, inv.currency)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{formatBps(inv.roiBps)} for the full term</p>
            </div>
            <div className="financial-card p-4">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Maturity value</p>
              <p className="tabular mt-1 text-xl font-extrabold">{formatMoney(inv.maturityValue, inv.currency)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">expected, not guaranteed</p>
            </div>
          </section>

          <section className="financial-card p-4">
            <h2 className="eyebrow mb-2 text-muted-foreground">Detail</h2>
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <div>
                <DetailRow label="Investor">
                  <Link href={`/users/${inv.userId}`} className="text-primary hover:underline">{inv.userDisplayName}</Link>
                </DetailRow>
                <DetailRow label="Property">
                  <Link href={`/properties/${inv.propertyId}`} className="text-primary hover:underline">{inv.propertyName}</Link>
                </DetailRow>
                <DetailRow label="Plan">{inv.planName}</DetailRow>
                <DetailRow label="Round">#{inv.roundNumber} · <span className="font-mono">{inv.roundId}</span></DetailRow>
              </div>
              <div>
                <DetailRow label="Created">{formatDateTime(inv.createdAt)}</DetailRow>
                <DetailRow label="Activated">{inv.activatedAt ? formatDateTime(inv.activatedAt) : "—"}</DetailRow>
                <DetailRow label="Matures">{inv.maturesAt ? formatDateTime(inv.maturesAt) : "—"}</DetailRow>
                <DetailRow label="Settled">{inv.settledAt ? formatDateTime(inv.settledAt) : "—"}</DetailRow>
                <DetailRow label="Funding reference">
                  <span className="font-mono text-xs">{inv.paymentReference ?? "—"}</span>
                </DetailRow>
              </div>
            </div>
            {inv.journals?.length ? (
              <div className="mt-4 border-t border-border pt-3">
                <h3 className="eyebrow mb-2 text-muted-foreground">Ledger journals</h3>
                <div className="flex flex-col gap-1">
                  {inv.journals.map((j) => (
                    <div key={j.reference} className="flex items-center justify-between text-xs">
                      <span className="font-mono">{j.reference}</span>
                      <span className="text-muted-foreground">{j.journalType.replace("_", " ").toLowerCase()} · {formatDateTime(j.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section className="financial-card h-fit p-4">
            <h2 className="eyebrow mb-4 text-muted-foreground">Status timeline</h2>
            <Timeline items={timelineFor(inv)} />
          </section>
          <ReviewActions investment={inv} />
        </div>
      </div>
    </div>
  );
}

export default function InvestmentDetailPage() {
  return (
    <PermissionGate permission="investments.read" mode="page">
      <InvestmentDetail />
    </PermissionGate>
  );
}
