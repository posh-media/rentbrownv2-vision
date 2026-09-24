import * as React from "react";

import { cn } from "@rentbrown/ui";

export interface PageHeaderProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  copy?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, copy, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow text-secondary">{eyebrow}</p> : null}
        <h1 className="mt-1 text-[1.75rem] font-extrabold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        {copy ? <p className="mt-2 max-w-2xl text-muted-foreground">{copy}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
