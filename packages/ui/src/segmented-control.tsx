"use client";

import * as React from "react";

import { cn } from "./lib/cn";

export interface SegmentedControlProps<T extends string> {
  options: Array<{ value: T; label: React.ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  label?: string;
  className?: string;
}

/** Chip group with roving tabindex (arrow keys move between options). */
export function SegmentedControl<T extends string>({ options, value, onChange, label, className }: SegmentedControlProps<T>) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));

  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex flex-wrap gap-1 rounded-md bg-surface-sunken p-1", className)}>
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (selectedIndex === -1 && i === 0) ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => {
              const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (!dir) return;
              e.preventDefault();
              const next = (i + dir + options.length) % options.length;
              refs.current[next]?.focus();
              onChange(options[next]!.value);
            }}
            className={cn(
              "min-h-11 rounded-sm px-3.5 text-sm font-semibold transition-colors motion-reduce:transition-none",
              "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
              selected ? "bg-card text-primary shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
