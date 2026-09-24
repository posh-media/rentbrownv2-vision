import * as React from "react";
import Link from "next/link";

import { cn } from "@rentbrown/ui";

export interface SectionProps {
  title?: React.ReactNode;
  actionHref?: string;
  actionLabel?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function Section({ title, actionHref, actionLabel, className, children }: SectionProps) {
  return (
    <section className={cn("flex flex-col gap-4", className)}>
      {title ? (
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-extrabold text-foreground">{title}</h2>
          {actionHref ? (
            <Link href={actionHref} className="text-sm font-bold text-primary hover:underline">
              {actionLabel ?? "View all"}
            </Link>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
