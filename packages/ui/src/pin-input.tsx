"use client";

import * as React from "react";

import { cn } from "./lib/cn";

export interface PinInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  label?: string;
}

/** Masked 6-cell PIN input with auto-advance and paste support. */
export function PinInput({ length = 6, value, onChange, onComplete, disabled, label = "Transaction PIN" }: PinInputProps) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([]);
  const cells = Array.from({ length }, (_, i) => value[i] ?? "");

  const setDigit = (i: number, digit: string) => {
    const next = (value.slice(0, i) + digit + value.slice(i + 1)).slice(0, length);
    onChange(next);
    if (digit && i < length - 1) refs.current[i + 1]?.focus();
    if (next.length === length && !next.includes(" ")) onComplete?.(next);
  };

  return (
    <div role="group" aria-label={label} className="flex gap-2.5">
      {cells.map((cell, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="password"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1} of ${length}`}
          maxLength={1}
          disabled={disabled}
          value={cell}
          className={cn(
            "size-11 rounded-md border border-input bg-card text-center text-lg font-bold text-foreground shadow-xs",
            "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
            "disabled:cursor-not-allowed disabled:bg-[var(--disabled-bg)]",
          )}
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, "");
            if (!d) return;
            if (d.length > 1) {
              // Pasted / autocompleted run of digits
              const next = d.slice(0, length);
              onChange(next);
              refs.current[Math.min(next.length, length - 1)]?.focus();
              if (next.length === length) onComplete?.(next);
              return;
            }
            setDigit(i, d);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              e.preventDefault();
              if (cell) setDigit(i, "");
              else if (i > 0) {
                refs.current[i - 1]?.focus();
                setDigit(i - 1, "");
              }
            } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
            else if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus();
          }}
          onPaste={(e) => {
            e.preventDefault();
            const d = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
            if (!d) return;
            onChange(d);
            refs.current[Math.min(d.length, length - 1)]?.focus();
            if (d.length === length) onComplete?.(d);
          }}
        />
      ))}
    </div>
  );
}
