"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@rentbrown/ui";
import { clamp } from "@rentbrown/utils";

export interface SlotStepperProps {
  value: number;
  min: number;
  max: number;
  onChange: (slots: number) => void;
}

export function SlotStepper({ value, min, max, onChange }: SlotStepperProps) {
  const apply = (n: number) => onChange(clamp(Math.round(n), min, max));
  const chips: Array<{ label: string; slots: number }> = [
    { label: "Min", slots: min },
    { label: "5", slots: 5 },
    { label: "10", slots: 10 },
    { label: "Max", slots: max },
  ];

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Reduce slots"
          disabled={value <= min}
          onClick={() => apply(value - 1)}
          className="flex size-11 items-center justify-center rounded-md border border-border-strong text-foreground hover:bg-surface-subtle disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Minus className="size-4" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          aria-label="Number of slots"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) apply(n);
          }}
          className="tabular h-11 w-24 rounded-md border border-input bg-card text-center text-lg font-bold text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        />
        <button
          type="button"
          aria-label="Increase slots"
          disabled={value >= max}
          onClick={() => apply(value + 1)}
          className="flex size-11 items-center justify-center rounded-md border border-border-strong text-foreground hover:bg-surface-subtle disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {chips
          .filter((c) => c.slots >= min && c.slots <= max)
          .map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => apply(c.slots)}
              className={cn(
                "min-h-9 rounded-full border px-3 text-xs font-bold",
                value === c.slots
                  ? "border-primary bg-accent text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
      </div>
    </div>
  );
}
