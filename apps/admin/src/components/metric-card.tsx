import * as React from "react";
import Link from "next/link";
import type { AdminMetric } from "@rentbrown/types";
import { formatBps, formatMoney } from "@rentbrown/utils";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@rentbrown/ui";

export function MetricValue({ metric, className }: { metric: AdminMetric; className?: string }) {
  const value =
    metric.format === "money"
      ? formatMoney(metric.value, metric.currency ?? "NGN")
      : metric.format === "percent"
        ? formatBps(metric.value)
        : Intl.NumberFormat("en-NG").format(metric.value);
  return <span className={cn("tabular text-2xl font-extrabold text-foreground", className)}>{value}</span>;
}

/** Dense ops metric card: label, big value, optional delta + link. */
export function MetricCard({ metric }: { metric: AdminMetric }) {
  const delta = metric.delta;
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="eyebrow text-muted-foreground">{metric.label}</span>
        {delta ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[11px] font-bold",
              delta.direction === "up" && "text-[var(--success-fg)]",
              delta.direction === "down" && "text-[var(--error-fg)]",
              delta.direction === "flat" && "text-muted-foreground",
            )}
          >
            {delta.direction === "up" ? <TrendingUp className="size-3" /> : delta.direction === "down" ? <TrendingDown className="size-3" /> : null}
            {delta.label}
          </span>
        ) : null}
      </div>
      <div className="mt-2.5">
        <MetricValue metric={metric} />
      </div>
    </>
  );
  const classes = cn("financial-card block p-4", metric.href && "transition-shadow hover:shadow-md");
  return metric.href ? (
    <Link href={metric.href} className={classes}>
      {inner}
    </Link>
  ) : (
    <div className={classes}>{inner}</div>
  );
}
