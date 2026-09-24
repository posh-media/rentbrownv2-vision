import * as React from "react";
import { Skeleton } from "@rentbrown/ui";
import { cn } from "@rentbrown/ui";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Breadcrumb-ish back link used on detail pages. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
      ← {label}
    </a>
  );
}

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="financial-card overflow-hidden" aria-hidden>
      <div className="border-b bg-surface-subtle px-4 py-3">
        <Skeleton className="h-3 w-1/3" />
      </div>
      <div className="flex flex-col">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-0">
            {Array.from({ length: cols }, (_, c) => (
              <Skeleton key={c} className="h-3.5" style={{ width: `${[22, 16, 14, 18, 12, 10][c % 6]}%` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MetricSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="financial-card p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-24" />
          <Skeleton className="mt-2 h-2.5 w-16" />
        </div>
      ))}
    </div>
  );
}
