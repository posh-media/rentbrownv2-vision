import * as React from "react";

import { cn } from "./lib/cn";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-surface-sunken motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

/** Multi-line text placeholder. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

/** Card-shaped placeholder. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("financial-card p-5", className)} aria-hidden>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-7 w-40" />
      <SkeletonText lines={2} className="mt-4" />
    </div>
  );
}
