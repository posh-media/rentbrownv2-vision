"use client";

import Link from "next/link";
import { CreditCard, Landmark, WalletCards } from "lucide-react";
import { cn } from "@rentbrown/ui";
import type { FundingSource, InvestmentQuote } from "@rentbrown/types";
import { formatMoney } from "@rentbrown/utils";

const meta: Record<FundingSource, { icon: typeof WalletCards; label: string; hint: string }> = {
  WALLET: { icon: WalletCards, label: "Wallet", hint: "Pay instantly from your available balance" },
  BANK_TRANSFER: { icon: Landmark, label: "Bank transfer", hint: "We'll give you a unique transfer reference" },
  CARD: { icon: CreditCard, label: "Debit card", hint: "Cards issued by Nigerian banks" },
};

export function FundingSourcePicker({
  options,
  currency,
  value,
  onChange,
}: {
  options: InvestmentQuote["fundingOptions"];
  currency: InvestmentQuote["currency"];
  value: FundingSource | null;
  onChange: (source: FundingSource) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Funding source" className="flex flex-col gap-2.5">
      {options.map((option) => {
        const m = meta[option.source];
        const Icon = m.icon;
        const selected = value === option.source;
        return (
          <button
            key={option.source}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={!option.available}
            disabled={!option.available}
            onClick={() => onChange(option.source)}
            className={cn(
              "flex min-h-11 items-start gap-3 rounded-lg border p-4 text-left transition-colors",
              selected ? "border-primary bg-accent" : "border-border hover:bg-surface-subtle",
              !option.available && "cursor-not-allowed opacity-60",
            )}
          >
            <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", selected ? "bg-primary text-primary-foreground" : "bg-secondary-soft text-primary")}>
              <Icon className="size-4.5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-foreground">{m.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {option.source === "WALLET" && option.walletAvailable !== undefined
                  ? `Available: ${formatMoney(option.walletAvailable, currency)}`
                  : m.hint}
              </span>
              {!option.available && option.reason ? (
                <span className="mt-1 block text-xs font-medium text-[var(--warning-fg)]">
                  {option.reason}{" "}
                  <Link href="/wallet/deposit" className="font-bold text-primary underline" onClick={(e) => e.stopPropagation()}>
                    Deposit funds
                  </Link>
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
