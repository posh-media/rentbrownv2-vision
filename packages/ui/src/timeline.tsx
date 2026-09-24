import { Check } from "lucide-react";
import { formatDate } from "@rentbrown/utils";
import type { ISODateString } from "@rentbrown/types";

import { cn } from "./lib/cn";

export interface TimelineItem {
  id?: string;
  label: string;
  at: ISODateString | null;
  state: "done" | "current" | "upcoming";
  note?: string;
  reference?: string;
}

/** Vertical status timeline shared by investments, withdrawals and deposits. */
export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol className={cn("flex flex-col", className)}>
      {items.map((item, i) => (
        <li key={item.id ?? `${item.label}-${i}`} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              aria-hidden
              className={cn(
                "flex size-6 items-center justify-center rounded-full border",
                item.state === "done" && "border-success bg-success text-success-foreground",
                item.state === "current" && "border-primary bg-primary text-primary-foreground ring-4 ring-primary/15 motion-safe:animate-pulse motion-reduce:animate-none",
                item.state === "upcoming" && "border-border-strong bg-card text-muted-foreground",
              )}
            >
              {item.state === "done" ? <Check className="size-3" /> : <span className="size-1.5 rounded-full bg-current" />}
            </span>
            {i < items.length - 1 ? <span aria-hidden className="w-px flex-1 bg-border" /> : null}
          </div>
          <div className="min-w-0 pb-5">
            <p className={cn("text-sm font-semibold", item.state === "upcoming" ? "text-muted-foreground" : "text-foreground")}>
              {item.label}
            </p>
            <p className="text-xs text-tertiary">
              {item.at ? formatDate(item.at) : "—"}
              {item.reference ? ` · ${item.reference}` : ""}
            </p>
            {item.note ? <p className="mt-0.5 text-xs text-muted-foreground">{item.note}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
