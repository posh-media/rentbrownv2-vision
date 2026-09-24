"use client";

import * as React from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  MoneyFigure,
  PinInput,
} from "@rentbrown/ui";
import type { CurrencyCode, MinorUnits } from "@rentbrown/types";

export function PinConfirmDialog({
  open,
  onOpenChange,
  amount,
  currency,
  destination,
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: MinorUnits;
  currency: CurrencyCode;
  destination: string;
  loading: boolean;
  onConfirm: () => void;
}) {
  const [pin, setPin] = React.useState("");

  const handleOpenChange = (next: boolean) => {
    if (!next) setPin("");
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm with transaction PIN</DialogTitle>
          <DialogDescription>
            <MoneyFigure amount={amount} currency={currency} size="md" className="mt-1" />
            <span className="mt-1 block">to {destination}</span>
          </DialogDescription>
        </DialogHeader>
        <PinInput value={pin} onChange={setPin} onComplete={() => onConfirm()} disabled={loading} />
        <p className="mt-3 text-xs text-muted-foreground">Prototype: any 6 digits are accepted.</p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={pin.length !== 6 || loading}>
            {loading ? "Confirming…" : "Confirm investment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
