import * as React from "react";

import { cn } from "./lib/cn";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  copy?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, copy, action, className, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong px-6 py-12 text-center",
        className,
      )}
      {...props}
    >
      {icon ? <div className="text-tertiary [&_svg]:size-8">{icon}</div> : null}
      <h3 className="text-base font-bold text-foreground">{title}</h3>
      {copy ? <p className="max-w-sm text-sm text-muted-foreground">{copy}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
