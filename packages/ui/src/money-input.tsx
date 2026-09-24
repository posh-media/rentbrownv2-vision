"use client";

import * as React from "react";
import type { CurrencyCode, MinorUnits } from "@rentbrown/types";
import { CURRENCY_SYMBOL, parseMajorToMinor } from "@rentbrown/utils";

import { cn } from "./lib/cn";
import { inputClasses } from "./field";

export interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  currency?: CurrencyCode;
  value?: MinorUnits | null;
  onValueChange?: (minor: MinorUnits | null) => void;
}

function group(int: string) {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** ₦-prefixed numeric input that groups thousands as you type and emits minor units. */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ currency = "NGN", value, onValueChange, className, id, ...props }, ref) => {
    const [text, setText] = React.useState("");

    React.useEffect(() => {
      if (value === undefined) return;
      if (value === null) {
        setText("");
        return;
      }
      const whole = Math.floor(Math.abs(value) / 100);
      const frac = Math.abs(value) % 100;
      setText(frac ? `${group(String(whole))}.${String(frac).padStart(2, "0")}` : group(String(whole)));
    }, [value]);

    return (
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground"
        >
          {CURRENCY_SYMBOL[currency]}
        </span>
        <input
          ref={ref}
          id={id}
          inputMode="decimal"
          autoComplete="off"
          className={cn(inputClasses, "tabular pl-8 font-semibold", className)}
          value={text}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d.]/g, "");
            const [w = "", ...rest] = raw.split(".");
            const frac = rest.join("").slice(0, 2);
            const next = rest.length ? `${w}.${frac}` : w;
            setText(next === "" ? "" : `${group(w)}${rest.length ? `.${frac}` : raw.endsWith(".") ? "." : ""}`);
            onValueChange?.(parseMajorToMinor(next, currency));
          }}
          {...props}
        />
      </div>
    );
  },
);
MoneyInput.displayName = "MoneyInput";
