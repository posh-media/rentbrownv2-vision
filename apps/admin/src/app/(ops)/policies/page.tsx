"use client";

import * as React from "react";
import { formatBps, formatDate, formatMoney } from "@rentbrown/utils";
import { Button, StatePanel } from "@rentbrown/ui";

import { usePolicies } from "../../../lib/data/hooks";
import { PageHeader, TableSkeleton } from "../../../components/page-header";
import { PermissionGate } from "../../../components/permission-gate";
import { StatusCell } from "../../../components/status-cell";

function PoliciesView() {
  const { data, isLoading, isError } = usePolicies();

  if (isLoading) return <TableSkeleton rows={10} cols={5} />;
  if (isError || !data) return <StatePanel tone="error" title="Couldn't load policies" copy="The mock data source failed to respond." />;

  const formatValue = (p: (typeof data.parameters)[number]) => {
    switch (p.format) {
      case "money":
        return formatMoney(p.value, p.currency ?? "NGN");
      case "bps":
        return formatBps(p.value);
      case "duration_days":
        return `${p.value}h`;
      default:
        return String(p.value);
    }
  };

  return (
    <div>
      <PageHeader
        title="Policies"
        description={
          <>
            Version <span className="font-mono font-semibold">{data.version}</span> effective {formatDate(data.effectiveFrom)}.
            Values are read-only — changes go through proposals, never direct edits.
          </>
        }
      />

      {/* Pending proposals */}
      {data.pendingProposals.length > 0 ? (
        <section className="financial-card mb-6 border-warning-border p-4">
          <h2 className="eyebrow text-[var(--warning-fg)]">Pending proposals</h2>
          <div className="mt-3 flex flex-col gap-2">
            {data.pendingProposals.map((pp) => {
              const param = data.parameters.find((p) => p.key === pp.key);
              return (
                <div key={pp.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
                  <div>
                    <p className="font-mono text-xs font-bold">{pp.key}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {param ? formatValue(param) : "?"} → <span className="font-bold text-foreground">{param ? formatValue({ ...param, value: pp.proposedValue }) : pp.proposedValue}</span>
                      {" · "}proposed by {pp.proposedBy} · {formatDate(pp.proposedAt)}
                    </p>
                  </div>
                  <StatusCell status="warning" label="Pending approval" />
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Parameter table */}
      <div className="financial-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b bg-surface-subtle text-left">
                <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Parameter</th>
                <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Current value</th>
                <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Effective from</th>
                <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Version</th>
                <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Last changed by</th>
                <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.parameters.map((p) => (
                <tr key={p.key}>
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs font-bold">{p.key}</p>
                    <p className="mt-0.5 max-w-72 text-xs text-muted-foreground">{p.label} — {p.description}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="tabular font-extrabold">{formatValue(p)}</span>
                  </td>
                  <td className="px-4 py-3 text-xs tabular">{formatDate(p.effectiveFrom)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{p.version}</td>
                  <td className="px-4 py-3 text-xs">{p.lastChangedBy}</td>
                  <td className="px-4 py-3 text-right">
                    <PermissionGate permission="policies.propose" mode="disable">
                      <Button size="sm" variant="outline" disabled>
                        Propose change
                      </Button>
                    </PermissionGate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t px-4 py-2.5 text-[11px] text-tertiary">
          Proposals require <code className="font-mono">policies.propose</code> and a second approver in production.
        </p>
      </div>
    </div>
  );
}

export default function PoliciesPage() {
  return (
    <PermissionGate permission="policies.read" mode="page">
      <PoliciesView />
    </PermissionGate>
  );
}
