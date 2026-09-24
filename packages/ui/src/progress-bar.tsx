import * as React from "react";
import type { StatusTone } from "@rentbrown/design-tokens";
import { clamp } from "@rentbrown/utils";

import { cn } from "./lib/cn";

const fillClasses: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning-dot",
  error: "bg-error-dot",
  info: "bg-info-dot",
  pending: "bg-pending-dot",
  neutral: "bg-neutral-dot",
};

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0–100 */
  value: number;
  tone?: StatusTone;
  size?: "sm" | "md";
  label?: string;
}

export function ProgressBar({ value, tone = "success", size = "md", label, className, ...props }: ProgressBarProps) {
  const pct = clamp(value, 0, 100);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className={cn("w-full overflow-hidden rounded-full bg-surface-sunken", size === "sm" ? "h-1.5" : "h-2.5", className)}
      {...props}
    >
      <div
        className={cn("h-full rounded-full transition-[width] motion-reduce:transition-none", fillClasses[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
