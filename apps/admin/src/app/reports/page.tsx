"use client";

import * as React from "react";
import type { ReportSeries } from "@rentbrown/types";
import { formatDateTime, formatMoney } from "@rentbrown/utils";
import { StatePanel, cn } from "@rentbrown/ui";

import { useReports } from "../../lib/data/hooks";
import { PageHeader, TableSkeleton } from "../../components/page-header";
import { PermissionGate } from "../../components/permission-gate";

type Period = "7d" | "30d" | "90d";
const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

function SeriesChart({ series }: { series: ReportSeries }) {
  const max = Math.max(...series.points.map((p) => p.value), 1);
  const fmt = (v: number) => (series.format === "money" ? formatMoney(v, series.currency ?? "NGN") : v.toLocaleString());
  const W = 560;
  const H = 140;
  const PAD = 8;
  const barW = Math.max(6, (W - PAD * 2) / series.points.length - 8);

  return (
    <div className="financial-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">{series.title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{series.description}</p>
        </div>
        <p className="tabular text-lg font-extrabold">{fmt(series.points.reduce((s, p) => s + p.value, 0))}</p>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="mt-3 w-full" role="img" aria-label={series.title}>
        {series.points.map((p, i) => {
          const h = Math.max(2, (p.value / max) * (H - 10));
          const x = PAD + i * ((W - PAD * 2) / series.points.length) + 4;
          return (
            <g key={p.label}>
              <rect x={x} y={H - h} width={barW} height={h} rx={3} className="fill-primary/80" />
              {series.points.length <= 12 || i % Math.ceil(series.points.length / 8) === 0 ? (
                <text x={x + barW / 2} y={H + 14} textAnchor="middle" className="fill-muted-foreground" fontSize={9}>
                  {p.label}
                </text>
              ) : null}
            </g>
          );
        })}
        <line x1={PAD} y1={H} x2={W - PAD} y2={H} className="stroke-border" strokeWidth={1} />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-tertiary">
        <span>min {fmt(Math.min(...series.points.map((p) => p.value)))}</span>
        <span>peak {fmt(max)}</span>
      </div>
    </div>
  );
}

function ReportsView() {
  const [period, setPeriod] = React.useState<Period>("30d");
  const { data, isLoading, isError, isFetching } = useReports(period);

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Server-computed aggregates. Read-only exports for ops review."
        actions={
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                className={cn(
                  "rounded px-3 py-1 text-xs font-semibold transition-colors",
                  period === p.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      {isLoading ? (
        <TableSkeleton rows={6} cols={3} />
      ) : isError || !data ? (
        <StatePanel tone="error" title="Couldn't load reports" copy="The mock data source failed to respond." />
      ) : (
        <div className={cn(isFetching && "opacity-60 transition-opacity")}>
          <p className="mb-4 text-xs text-muted-foreground">
            {data.period.label} · generated {formatDateTime(data.asOf)}
          </p>

          <div className="grid gap-4 lg:grid-cols-3">
            {data.series.map((s) => (
              <SeriesChart key={s.id} series={s} />
            ))}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {data.tables.map((t) => (
              <div key={t.id} className="financial-card overflow-hidden">
                <h3 className="border-b bg-surface-subtle px-4 py-3 text-sm font-bold">{t.title}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        {t.columns.map((c) => (
                          <th key={c} className="px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {t.rows.map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td key={j} className="px-4 py-2.5 text-xs">
                              {typeof cell === "number" ? <span className="tabular font-semibold">{cell.toLocaleString()}</span> : cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <PermissionGate permission="reports.read" mode="page">
      <ReportsView />
    </PermissionGate>
  );
}
