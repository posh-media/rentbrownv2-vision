"use client";

import { Copy } from "lucide-react";
import { MoneyFigure, toast } from "@rentbrown/ui";
import type { CurrencyCode, MinorUnits, VirtualAccount } from "@rentbrown/types";
import { formatDateTime } from "@rentbrown/utils";

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast.success(`${label} copied`);
        } catch {
          toast.error("Couldn't copy — select and copy manually");
        }
      }}
    >
      <Copy className="size-3.5" />
    </button>
  );
}

export function TransferInstructions({
  instructions,
  amount,
  currency,
}: {
  instructions: VirtualAccount;
  amount: MinorUnits;
  currency: CurrencyCode;
}) {
  const rows = [
    { label: "Bank", value: instructions.bankName },
    { label: "Account number", value: instructions.accountNumber, copy: true },
    { label: "Account name", value: instructions.accountName },
    { label: "Reference", value: instructions.reference, copy: true },
  ];
  return (
    <div className="mt-4 rounded-md bg-surface-subtle p-4">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3 py-2">
          <span className="text-xs font-semibold text-muted-foreground">{row.label}</span>
          <span className="flex items-center gap-1.5 text-sm font-bold text-foreground">
            {row.value}
            {row.copy ? <CopyButton value={row.value} label={row.label} /> : null}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 border-t border-border py-2">
        <span className="text-xs font-semibold text-muted-foreground">Amount</span>
        <MoneyFigure amount={amount} currency={currency} size="sm" />
      </div>
      <div className="flex items-center justify-between gap-3 py-2">
        <span className="text-xs font-semibold text-muted-foreground">Expires</span>
        <span className="text-sm font-medium text-foreground">{formatDateTime(instructions.expiresAt)}</span>
      </div>
    </div>
  );
}
