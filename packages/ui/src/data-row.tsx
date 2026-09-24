import * as React from "react";
import type { StatusTone } from "@rentbrown/design-tokens";

import { cn } from "./lib/cn";

const toneText: Record<StatusTone, string> = {
  success: "text-[var(--success-fg)]",
  warning: "text-[var(--warning-fg)]",
  error: "text-[var(--error-fg)]",
  info: "text-[var(--info-fg)]",
  pending: "text-[var(--pending-fg)]",
  neutral: "text-muted-foreground",
};

export interface DataRowProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  strong?: boolean;
  tone?: StatusTone;
  hint?: React.ReactNode;
}

export function DataRow({ label, value, strong = false, tone, hint, className, ...props }: DataRowProps) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-2.5", className)} {...props}>
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-right text-sm",
          strong ? "font-bold text-foreground" : "font-medium text-foreground",
          tone && toneText[tone],
        )}
      >
        {value}
        {hint ? <span className="block text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </span>
    </div>
  );
}
