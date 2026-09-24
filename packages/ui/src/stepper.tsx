import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "./lib/cn";

export interface StepperProps {
  steps: string[];
  current: number; // 1-based
  className?: string;
}

/** Numbered steps header for linear flows (checkout etc.). */
export function Stepper({ steps, current, className }: StepperProps) {
  return (
    <ol aria-label="Progress" className={cn("flex items-center gap-2", className)}>
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "upcoming";
        return (
          <li key={label} className="flex items-center gap-2" aria-current={state === "current" ? "step" : undefined}>
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full border text-xs font-bold",
                state === "done" && "border-success bg-success text-success-foreground",
                state === "current" && "border-primary bg-primary text-primary-foreground",
                state === "upcoming" && "border-border-strong bg-card text-muted-foreground",
              )}
            >
              {state === "done" ? <Check className="size-3.5" aria-hidden /> : n}
            </span>
            <span
              className={cn(
                "text-sm font-semibold",
                state === "upcoming" ? "text-muted-foreground" : "text-foreground",
                state !== "current" && "hidden sm:inline",
              )}
            >
              {label}
            </span>
            {n < steps.length ? <span aria-hidden className="mx-1 h-px w-6 bg-border-strong" /> : null}
          </li>
        );
      })}
    </ol>
  );
}
