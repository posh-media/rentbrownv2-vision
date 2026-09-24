import * as React from "react";
import Link from "next/link";
import type { QueueSummary } from "@rentbrown/types";
import { formatRelativeDays } from "@rentbrown/utils";
import { ArrowRight } from "lucide-react";
import { cn } from "@rentbrown/ui";

/** Operational queue card: pending count, oldest age, link into the queue. */
export function QueueCard({ queue, now }: { queue: QueueSummary; now: string }) {
  const busy = queue.pending > 0;
  return (
    <Link
      href={queue.href}
      className={cn("financial-card block p-4 transition-shadow hover:shadow-md", busy && "border-warning-border")}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="eyebrow text-muted-foreground">{queue.label}</span>
        <span
          className={cn(
            "tabular rounded-full px-2 py-0.5 text-xs font-extrabold",
            busy ? "bg-warning-soft text-[var(--warning-fg)]" : "bg-success-soft text-[var(--success-fg)]",
          )}
        >
          {queue.pending}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {busy && queue.oldestAt ? `Oldest: ${formatRelativeDays(queue.oldestAt, now)}` : busy ? "Pending review" : "Clear"}
      </p>
      <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary">
        Open queue <ArrowRight className="size-3" />
      </span>
    </Link>
  );
}
