import * as React from "react";
import Link from "next/link";

import { cn } from "./lib/cn";

export interface StatCardProps extends React.HTMLAttributes<HTMLElement> {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  icon?: React.ReactNode;
  emphasis?: boolean;
  href?: string;
}

export function StatCard({ label, value, note, icon, emphasis = false, href, className, ...props }: StatCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={cn("eyebrow", emphasis ? "text-primary-foreground/70" : "text-muted-foreground")}>
          {label}
        </span>
        {icon}
      </div>
      <div className="mt-3">{value}</div>
      {note ? (
        <p className={cn("mt-2 text-xs", emphasis ? "text-primary-foreground/70" : "text-muted-foreground")}>
          {note}
        </p>
      ) : null}
    </>
  );
  const classes = cn(
    "financial-card block p-4 sm:p-5",
    emphasis && "bg-primary text-primary-foreground",
    href && "transition-shadow hover:shadow-md",
    className,
  );
  if (href) {
    return (
      <Link href={href} className={classes} {...props}>
        {body}
      </Link>
    );
  }
  return (
    <div className={classes} {...props}>
      {body}
    </div>
  );
}
