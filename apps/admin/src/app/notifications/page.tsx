"use client";

import * as React from "react";
import { formatDateTime, humanizeStatus } from "@rentbrown/utils";
import { Badge, StatePanel } from "@rentbrown/ui";

import { useNotificationOverview } from "../../lib/data/hooks";
import { PageHeader, TableSkeleton } from "../../components/page-header";
import { PermissionGate } from "../../components/permission-gate";
import { StatusCell } from "../../components/status-cell";

function NotificationsView() {
  const { data, isLoading, isError } = useNotificationOverview();

  if (isLoading) return <TableSkeleton rows={8} cols={5} />;
  if (isError || !data) return <StatePanel tone="error" title="Couldn't load notifications" copy="The mock data source failed to respond." />;

  return (
    <div>
      <PageHeader title="Notifications" description="Template catalogue and recent deliveries across in-app, push and email." />

      {/* Channel stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {data.byChannel.map((c) => (
          <div key={c.channel} className="financial-card p-4">
            <p className="eyebrow text-muted-foreground">{humanizeStatus(c.channel)}</p>
            <div className="mt-3 flex items-end gap-4">
              <div>
                <p className="tabular text-xl font-extrabold">{c.sent}</p>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">sent</p>
              </div>
              <div>
                <p className="tabular text-xl font-extrabold text-[var(--success-fg)]">{c.delivered}</p>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">delivered</p>
              </div>
              <div>
                <p className="tabular text-xl font-extrabold text-[var(--error-fg)]">{c.failed}</p>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">failed</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Templates */}
        <section className="financial-card overflow-hidden">
          <h2 className="eyebrow border-b bg-surface-subtle px-4 py-3 text-muted-foreground">Templates ({data.templates.length})</h2>
          <div className="divide-y">
            {data.templates.map((t) => (
              <div key={t.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{t.title}</p>
                    <p className="font-mono text-[11px] text-tertiary">{t.key} · {humanizeStatus(t.category)}</p>
                  </div>
                  <StatusCell status={t.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t.body}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {t.channels.map((ch) => (
                    <Badge key={ch} tone="neutral" className="text-[9px]">{ch}</Badge>
                  ))}
                  <span className="text-[10px] text-tertiary">updated {formatDateTime(t.updatedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Deliveries */}
        <section className="financial-card overflow-hidden">
          <h2 className="eyebrow border-b bg-surface-subtle px-4 py-3 text-muted-foreground">Recent deliveries</h2>
          <div className="divide-y">
            {data.recentDeliveries.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{d.userDisplayName}</p>
                  <p className="font-mono text-[10px] text-tertiary">
                    {d.templateKey} · {d.channel} · {formatDateTime(d.sentAt)}
                    {d.error ? ` · ${d.error}` : ""}
                  </p>
                </div>
                <StatusCell status={d.status} className="shrink-0" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <PermissionGate permission="notifications.read" mode="page">
      <NotificationsView />
    </PermissionGate>
  );
}
