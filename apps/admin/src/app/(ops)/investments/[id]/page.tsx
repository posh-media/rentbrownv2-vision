"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatBps, formatDateTime, formatMoney } from "@rentbrown/utils";
import { StatePanel, Timeline, type TimelineItem } from "@rentbrown/ui";

import { useAdminInvestment } from "../../../../lib/data/hooks";
import { DetailRow } from "../../../../components/detail-drawer";
import { BackLink, PageHeader, TableSkeleton } from "../../../../components/page-header";
import { PermissionGate } from "../../../../components/permission-gate";
import { StatusCell } from "../../../../components/status-cell";

function timelineFor(i: NonNullable<ReturnType<typeof useAdminInvestment>["data"]>): TimelineItem[] {
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
              </div>
            </div>
          </section>
        </div>

        <section className="financial-card h-fit p-4">
          <h2 className="eyebrow mb-4 text-muted-foreground">Status timeline</h2>
          <Timeline items={timelineFor(inv)} />
        </section>
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
