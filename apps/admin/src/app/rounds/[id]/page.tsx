"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatDateTime, formatMoney } from "@rentbrown/utils";
import { ProgressBar, StatePanel } from "@rentbrown/ui";

import { useRound } from "../../../lib/data/hooks";
import { DetailRow } from "../../../components/detail-drawer";
import { BackLink, PageHeader, TableSkeleton } from "../../../components/page-header";
import { PermissionGate } from "../../../components/permission-gate";
import { StatusCell } from "../../../components/status-cell";

function RoundDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: round, isLoading, isError } = useRound(id);

  if (isLoading) {
    return (
      <div>
        <BackLink href="/rounds" label="Rounds" />
        <TableSkeleton rows={6} cols={4} />
      </div>
    );
  }
  if (isError || !round) {
    return (
      <div>
        <BackLink href="/rounds" label="Rounds" />
        <StatePanel tone="error" title="Round not found" copy="This round may not exist in the mock catalogue." />
      </div>
    );
  }

  const tone = round.allocatedPct >= 90 ? "warning" : "success";

  return (
    <div>
      <BackLink href="/rounds" label="Rounds" />
      <PageHeader
        title={`${round.propertyName} — Round ${round.roundNumber}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusCell status={round.status} />
            <Link href={`/plans/${round.planId}`} className="text-xs font-semibold text-primary hover:underline">{round.planName} →</Link>
            <Link href={`/properties/${round.propertyId}`} className="text-xs font-semibold text-primary hover:underline">Property →</Link>
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Capacity */}
          <section className="financial-card p-5">
            <div className="flex items-end justify-between">
              <h2 className="eyebrow text-muted-foreground">Capacity</h2>
              <span className="tabular text-2xl font-extrabold">{round.allocatedPct}%</span>
            </div>
            <ProgressBar value={round.allocatedPct} tone={tone} className="mt-3" />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-md border p-3">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Total slots</p>
                <p className="tabular mt-1 text-lg font-extrabold">{round.totalSlots.toLocaleString()}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Allocated</p>
                <p className="tabular mt-1 text-lg font-extrabold">{round.allocatedSlots.toLocaleString()}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Reserved</p>
                <p className="tabular mt-1 text-lg font-extrabold">{round.reservedSlots.toLocaleString()}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Available</p>
                <p className="tabular mt-1 text-lg font-extrabold">{round.availableSlots.toLocaleString()}</p>
              </div>
            </div>
          </section>

          <section className="financial-card p-4">
            <h2 className="eyebrow mb-2 text-muted-foreground">Round detail</h2>
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <div>
                <DetailRow label="Raised">{formatMoney(round.raised, round.currency)}</DetailRow>
                <DetailRow label="Slot price">{formatMoney(round.slotPrice, round.currency)}</DetailRow>
                <DetailRow label="Investors">{round.investors}</DetailRow>
                <DetailRow label="Round id" mono>{round.id}</DetailRow>
              </div>
              <div>
                <DetailRow label="Opens">{formatDateTime(round.opensAt)}</DetailRow>
                <DetailRow label="Closes">{formatDateTime(round.closesAt)}</DetailRow>
                <DetailRow label="Projected start">{formatDateTime(round.projectedStartAt)}</DetailRow>
                <DetailRow label="Projected maturity">{formatDateTime(round.projectedMaturityAt)}</DetailRow>
              </div>
            </div>
          </section>
        </div>

        <section className="financial-card h-fit p-4">
          <h2 className="eyebrow mb-3 text-muted-foreground">Management</h2>
          <p className="text-xs text-muted-foreground">
            Round lifecycle actions (open early, extend, pause) are management intents that require{" "}
            <code className="rounded bg-surface-sunken px-1 font-mono">rounds.manage</code>. This prototype shows the read model only.
          </p>
        </section>
      </div>
    </div>
  );
}

export default function RoundDetailPage() {
  return (
    <PermissionGate permission="catalogue.read" mode="page">
      <RoundDetail />
    </PermissionGate>
  );
}
