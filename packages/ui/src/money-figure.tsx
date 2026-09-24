import * as React from "react";
import type { CurrencyCode, MinorUnits } from "@rentbrown/types";
import { splitMoney } from "@rentbrown/utils";

import { cn } from "./lib/cn";

const sizeClasses = {
  xl: { symbol: "text-[0.65em]", number: "text-[2.5rem] leading-[2.75rem] font-extrabold" },
  lg: { symbol: "text-[0.65em]", number: "text-[1.875rem] leading-[2.25rem] font-extrabold" },
  md: { symbol: "text-[0.65em]", number: "text-[1.375rem] leading-[1.75rem] font-extrabold" },
  sm: { symbol: "text-[0.65em]", number: "text-base leading-[1.375rem] font-bold" },
  xs: { symbol: "text-[0.65em]", number: "text-[0.8125rem] leading-[1.125rem] font-bold" },
} as const;

const toneClasses = {
  default: "text-foreground",
  inverse: "text-primary-foreground",
  muted: "text-muted-foreground",
  success: "text-[var(--success-fg)]",
  error: "text-[var(--error-fg)]",
} as const;

export interface MoneyFigureProps extends React.HTMLAttributes<HTMLSpanElement> {
  amount: MinorUnits;
  currency?: CurrencyCode;
  size?: keyof typeof sizeClasses;
  tone?: keyof typeof toneClasses;
  decimals?: "auto" | "always" | "never";
  signed?: boolean;
}

/** Symbol ~65% + tabular whole + muted fraction. Never combines principal and profit. */
export const MoneyFigure = React.forwardRef<HTMLSpanElement, MoneyFigureProps>(
  (
    { amount, currency = "NGN", size = "md", tone = "default", decimals = "auto", signed = false, className, ...props },
    ref,
  ) => {
    const negative = amount < 0;
    const { symbol, whole, fraction } = splitMoney(Math.abs(Math.trunc(amount)), currency, decimals);
    const sign = signed ? (negative ? "−" : "+") : negative ? "−" : "";
    return (
      <span
        ref={ref}
        className={cn("tabular inline-flex items-baseline gap-[0.06em]", sizeClasses[size].number, toneClasses[tone], className)}
        {...props}
      >
        <span className={cn(sizeClasses[size].symbol, "font-bold")}>
          {sign}
          {symbol}
        </span>
        <span>
          {whole}
          {fraction && <span className="opacity-60">{fraction}</span>}
        </span>
      </span>
    );
  },
);
MoneyFigure.displayName = "MoneyFigure";
