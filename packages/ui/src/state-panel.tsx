import * as React from "react";
import type { StatusTone } from "@rentbrown/design-tokens";

import { cn } from "./lib/cn";

const panelClasses: Record<StatusTone, string> = {
  success: "bg-success-soft border-success-border text-[var(--success-fg)]",
  warning: "bg-warning-soft border-warning-border text-[var(--warning-fg)]",
  error: "bg-error-soft border-error-border text-[var(--error-fg)]",
  info: "bg-info-soft border-info-border text-[var(--info-fg)]",
  pending: "bg-pending-soft border-pending-border text-[var(--pending-fg)]",
  neutral: "bg-neutral-soft border-neutral-border text-neutral-fg",
};

export interface StatePanelProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: StatusTone;
  icon?: React.ReactNode;
  title: string;
  copy?: React.ReactNode;
  action?: React.ReactNode;
}

/** Soft status surface for full/empty/error/pending states. */
export function StatePanel({ tone = "neutral", icon, title, copy, action, className, children, ...props }: StatePanelProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-lg border p-5", panelClasses[tone], className)}
      {...props}
    >
      <div className="flex items-start gap-3">
        {icon ? <div className="mt-0.5 shrink-0 [&_svg]:size-5">{icon}</div> : null}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold">{title}</h3>
          {copy ? <p className="mt-1 text-sm opacity-80">{copy}</p> : null}
          {children}
          {action ? <div className="mt-4 flex flex-wrap gap-2">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}
