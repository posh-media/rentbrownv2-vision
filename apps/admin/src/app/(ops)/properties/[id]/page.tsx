"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatBps, formatDate, formatDateTime, formatMoney } from "@rentbrown/utils";
import { StatePanel } from "@rentbrown/ui";

import { useProperty } from "../../../../lib/data/hooks";
import { propertyImage } from "../../../../lib/images";
import { humanizeStatus } from "@rentbrown/utils";
import { DetailRow } from "../../../../components/detail-drawer";
import { BackLink, PageHeader, TableSkeleton } from "../../../../components/page-header";
import { PermissionGate } from "../../../../components/permission-gate";
import { StatusCell } from "../../../../components/status-cell";

function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: property, isLoading, isError } = useProperty(id);

  if (isLoading) {
    return (
      <div>
        <BackLink href="/properties" label="Properties" />
        <TableSkeleton rows={6} cols={4} />
      </div>
    );
  }
  if (isError || !property) {
    return (
      <div>
        <BackLink href="/properties" label="Properties" />
        <StatePanel tone="error" title="Property not found" copy="This property may not exist in the mock catalogue." />
      </div>
    );
  }

  return (
    <div>
      <BackLink href="/properties" label="Properties" />
      <PageHeader
        title={property.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusCell status={property.status} />
            <span className="text-xs text-muted-foreground">{property.type} · {property.location.label}</span>
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Hero + facts */}
          <section className="financial-card overflow-hidden">
            <div className="relative h-44 w-full bg-surface-sunken">
              <Image src={propertyImage(property.images[0] ?? "ikoyi-residences")} alt="" fill sizes="800px" className="object-cover" />
            </div>
            <div className="p-4">
              <p className="text-sm text-muted-foreground">{property.summary}</p>
              <p className="mt-2 text-xs text-muted-foreground">{property.description}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-md border p-3">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Raised</p>
                  <p className="tabular mt-1 font-extrabold">{formatMoney(property.totalRaised, property.currency)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Plans</p>
                  <p className="tabular mt-1 font-extrabold">{property.plans}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Open rounds</p>
                  <p className="tabular mt-1 font-extrabold">{property.openRounds}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Evidence</p>
                  <p className="tabular mt-1 font-extrabold">{property.evidenceCount} docs</p>
                </div>
              </div>
            </div>
          </section>

          {/* Evidence */}
          <section className="financial-card p-4">
            <h2 className="eyebrow mb-3 text-muted-foreground">Evidence documents</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-4">Document</th>
                    <th className="pb-2 pr-4">Type</th>
                    <th className="pb-2 pr-4">Reviewed</th>
                    <th className="pb-2 pr-4">Version</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {property.proofDocuments.map((doc) => (
                    <tr key={doc.id}>
                      <td className="py-2.5 pr-4">
                        <p className="font-semibold">{doc.title}</p>
                        <p className="text-xs text-muted-foreground">{doc.summary}</p>
                      </td>
                      <td className="py-2.5 pr-4 text-xs">{humanizeStatus(doc.type)}</td>
                      <td className="py-2.5 pr-4 text-xs">
                        {doc.reviewedBy}
                        <br />
                        <span className="text-tertiary">{formatDate(doc.reviewedAt)}</span>
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs">{doc.version}</td>
                      <td className="py-2.5"><StatusCell status={doc.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Plans + rounds */}
          <section className="financial-card p-4">
            <h2 className="eyebrow mb-3 text-muted-foreground">Plans</h2>
            <div className="divide-y">
              {property.planRows.map((plan) => (
                <Link key={plan.id} href={`/plans/${plan.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-surface-subtle/60">
                  <div>
                    <p className="text-sm font-semibold">{plan.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(plan.slotPrice, plan.currency)}/slot · {formatBps(plan.roiBps)} · {plan.duration.value} {plan.duration.unit.toLowerCase()}
                    </p>
                  </div>
                  <StatusCell status={plan.status} />
                </Link>
              ))}
            </div>
            <h2 className="eyebrow mb-3 mt-5 text-muted-foreground">Rounds</h2>
            <div className="divide-y">
              {property.roundRows.map((round) => (
                <Link key={round.id} href={`/rounds/${round.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-surface-subtle/60">
                  <div>
                    <p className="text-sm font-semibold">Round {round.roundNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {round.allocatedSlots}/{round.totalSlots} slots · {formatMoney(round.raised, round.currency)} raised · {round.investors} investors
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
            <h2 className="eyebrow mb-2 text-muted-foreground">Operator</h2>
            <DetailRow label="Name">{property.operator.name}</DetailRow>
            <p className="mt-2 text-xs text-muted-foreground">{property.operator.description}</p>
            <h2 className="eyebrow mb-2 mt-4 text-muted-foreground">Revenue model</h2>
            <p className="text-xs text-muted-foreground">{property.revenueModel}</p>
            <DetailRow label="Updated">{formatDateTime(property.updatedAt)}</DetailRow>
          </section>

          <section className="financial-card p-4">
            <h2 className="eyebrow mb-3 text-muted-foreground">History</h2>
            {property.history.length === 0 ? (
              <p className="text-xs text-muted-foreground">No audit events reference this property.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {property.history.map((h) => (
                  <div key={h.id} className="text-xs">
                    <p className="font-semibold">{h.summary}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-tertiary">{h.actor.displayName} · {formatDateTime(h.occurredAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default function PropertyDetailPage() {
  return (
    <PermissionGate permission="catalogue.read" mode="page">
      <PropertyDetail />
    </PermissionGate>
  );
}
