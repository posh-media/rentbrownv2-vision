"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatBps, formatDateTime, formatDuration, formatMoney } from "@rentbrown/utils";
import { StatePanel } from "@rentbrown/ui";

import { usePlan } from "../../../../lib/data/hooks";
import { DetailRow } from "../../../../components/detail-drawer";
import { BackLink, PageHeader, TableSkeleton } from "../../../../components/page-header";
import { PermissionGate } from "../../../../components/permission-gate";
import { StatusCell } from "../../../../components/status-cell";

function PlanDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: plan, isLoading, isError } = usePlan(id);

  if (isLoading) {
    return (
      <div>
        <BackLink href="/plans" label="Plans" />
        <TableSkeleton rows={6} cols={4} />
      </div>
    );
  }
  if (isError || !plan) {
    return (
      <div>
        <BackLink href="/plans" label="Plans" />
        <StatePanel tone="error" title="Plan not found" copy="This plan may not exist in the mock catalogue." />
      </div>
    );
  }

  return (
    <div>
      <BackLink href="/plans" label="Plans" />
      <PageHeader
        title={plan.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusCell status={plan.status} />
            <Link href={`/properties/${plan.propertyId}`} className="text-xs font-semibold text-primary hover:underline">
              {plan.propertyName} →
            </Link>
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section className="financial-card p-4">
            <h2 className="eyebrow mb-2 text-muted-foreground">Economics</h2>
            <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-2">
              <div>
                <DetailRow label="Slot price">{formatMoney(plan.slotPrice, plan.currency)}</DetailRow>
                <DetailRow label="Expected return">{formatBps(plan.roiBps)} full term</DetailRow>
                <DetailRow label="Duration">{formatDuration(plan.duration)}</DetailRow>
                <DetailRow label="Investment fee">{formatBps(plan.investmentFeeBps)}</DetailRow>
              </div>
              <div>
                <DetailRow label="Min slots">{plan.minSlots}</DetailRow>
                <DetailRow label="Max slots / user">{plan.maxSlotsPerUser ?? "—"}</DetailRow>
                <DetailRow label="Rounds">{plan.rounds}</DetailRow>
                <DetailRow label="Updated">{formatDateTime(plan.updatedAt)}</DetailRow>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {plan.eligibility.map((e) => (
                <span key={e} className="rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                  {e}
                </span>
              ))}
            </div>
          </section>

          <section className="financial-card p-4">
            <h2 className="eyebrow mb-3 text-muted-foreground">Linked rounds</h2>
            <div className="divide-y">
              {plan.roundRows.map((round) => (
                <Link key={round.id} href={`/rounds/${round.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-surface-subtle/60">
                  <div>
                    <p className="text-sm font-semibold">Round {round.roundNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {round.allocatedSlots}/{round.totalSlots} slots allocated · {formatMoney(round.raised, round.currency)} · closes {formatDateTime(round.closesAt)}
                    </p>
                  </div>
                  <StatusCell status={round.status} />
                </Link>
              ))}
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section className="financial-card p-4">
            <h2 className="eyebrow mb-2 text-muted-foreground">Terms</h2>
            <ul className="flex flex-col gap-2 text-xs text-muted-foreground">
              {plan.terms.map((t, i) => (
                <li key={i} className="flex gap-2"><span className="text-tertiary">•</span>{t}</li>
              ))}
            </ul>
          </section>
          <section className="financial-card p-4">
            <h2 className="eyebrow mb-2 text-muted-foreground">Risk disclosures</h2>
            <ul className="flex flex-col gap-2 text-xs text-muted-foreground">
              {plan.riskDisclosures.map((t, i) => (
                <li key={i} className="flex gap-2"><span className="text-tertiary">•</span>{t}</li>
              ))}
            </ul>
          </section>
          {plan.history.length > 0 ? (
            <section className="financial-card p-4">
              <h2 className="eyebrow mb-3 text-muted-foreground">History</h2>
              <div className="flex flex-col gap-3">
                {plan.history.map((h) => (
                  <div key={h.id} className="text-xs">
                    <p className="font-semibold">{h.summary}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-tertiary">{h.actor.displayName} · {formatDateTime(h.occurredAt)}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function PlanDetailPage() {
  return (
    <PermissionGate permission="catalogue.read" mode="page">
      <PlanDetail />
    </PermissionGate>
  );
}
