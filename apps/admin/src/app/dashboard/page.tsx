"use client";

import * as React from "react";
import Link from "next/link";
import { formatDateTime, formatRelativeDays } from "@rentbrown/utils";
import { StatePanel, cn } from "@rentbrown/ui";
import { AlertTriangle, ArrowRight, Info, OctagonAlert } from "lucide-react";

import { useAdminDashboard } from "../../lib/data/hooks";
import { labelFor, toneFor } from "../../lib/status";
import { MetricCard } from "../../components/metric-card";
import { MetricSkeleton, PageHeader, TableSkeleton } from "../../components/page-header";
import { QueueCard } from "../../components/queue-card";
import { StatusCell } from "../../components/status-cell";

const SEVERITY_ICON = {
  info: Info,
  warning: AlertTriangle,
  critical: OctagonAlert,
} as const;

export default function DashboardPage() {
  const { data, isLoading, isError } = useAdminDashboard();

  return (
    <div>
      <PageHeader
        title="Operations dashboard"
        description={data ? `As of ${formatDateTime(data.asOf)} · all figures from the mock ops backend.` : "Operational overview."}
      />

      {isLoading ? (
        <>
          <MetricSkeleton count={8} />
          <div className="mt-6">
            <TableSkeleton rows={5} cols={4} />
          </div>
        </>
      ) : isError || !data ? (
        <StatePanel tone="error" title="Couldn't load the dashboard" copy="The mock data source failed to respond." />
      ) : (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {data.metrics.map((m) => (
              <MetricCard key={m.id} metric={m} />
            ))}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            {/* Queues + alerts */}
            <div className="flex flex-col gap-6 lg:col-span-2">
              <section>
                <h2 className="eyebrow mb-3 text-muted-foreground">Queues</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                  {data.queues.map((q) => (
                    <QueueCard key={q.id} queue={q} now={data.asOf} />
                  ))}
                </div>
              </section>

              <section>
                <h2 className="eyebrow mb-3 text-muted-foreground">Alerts</h2>
                <div className="flex flex-col gap-2">
                  {data.alerts.map((alert) => {
                    const Icon = SEVERITY_ICON[alert.severity];
                    return (
                      <Link
                        key={alert.id}
                        href={alert.href}
                        className={cn(
                          "financial-card flex items-start gap-3 p-3.5 transition-shadow hover:shadow-md",
                          alert.severity === "critical" && "border-error-border",
                          alert.severity === "warning" && "border-warning-border",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 shrink-0 [&_svg]:size-4",
                            toneFor(alert.severity) === "error" && "text-[var(--error-fg)]",
                            toneFor(alert.severity) === "warning" && "text-[var(--warning-fg)]",
                            toneFor(alert.severity) === "info" && "text-[var(--info-fg)]",
                          )}
                        >
                          <Icon />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-foreground">{alert.title}</span>
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
                              {formatRelativeDays(alert.raisedAt, data.asOf)}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{alert.body}</span>
                        </span>
                        <ArrowRight className="mt-1 size-4 shrink-0 text-tertiary" />
                      </Link>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* Recent activity */}
            <section>
              <h2 className="eyebrow mb-3 text-muted-foreground">Recent activity</h2>
              <div className="financial-card divide-y">
                {data.recentActivity.map((event) => (
                  <div key={event.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-bold text-foreground">{event.actor.displayName}</span>
                      <StatusCell status={event.result} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{event.summary}</p>
                    <p className="mt-1 font-mono text-[10px] text-tertiary">
                      {event.action} · {labelFor(event.result)} · {formatDateTime(event.occurredAt)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
