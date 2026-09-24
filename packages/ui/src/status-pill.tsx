import * as React from "react";
import type { StatusTone } from "@rentbrown/design-tokens";

import { cn } from "./lib/cn";

const toneClasses: Record<StatusTone, string> = {
  success: "bg-success-soft text-[var(--success-fg)] border-success-border",
  warning: "bg-warning-soft text-[var(--warning-fg)] border-warning-border",
  error: "bg-error-soft text-[var(--error-fg)] border-error-border",
  info: "bg-info-soft text-[var(--info-fg)] border-info-border",
  pending: "bg-pending-soft text-[var(--pending-fg)] border-pending-border",
  neutral: "bg-neutral-soft text-neutral-fg border-neutral-border",
};

const dotClasses: Record<StatusTone, string> = {
  success: "bg-success-dot",
  warning: "bg-warning-dot",
  error: "bg-error-dot",
  info: "bg-info-dot",
  pending: "bg-pending-dot",
  neutral: "bg-neutral-dot",
};

export interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
}

export const StatusPill = React.forwardRef<HTMLSpanElement, StatusPillProps>(
  ({ tone = "neutral", className, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", dotClasses[tone])} />
      {children}
    </span>
  ),
);
StatusPill.displayName = "StatusPill";

export const Badge = StatusPill;
