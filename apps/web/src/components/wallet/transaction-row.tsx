"use client";

import * as React from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Gift,
  Landmark,
  RotateCcw,
  TrendingUp,
} from "lucide-react";
import {
  Button,
  DataRow,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Skeleton,
  StatusPill,
  cn,
  toast,
} from "@rentbrown/ui";
import type { Transaction, TransactionType } from "@rentbrown/types";
import { formatDateTime, formatListDate, formatMoney, humanizeStatus } from "@rentbrown/utils";

import { useDataSource } from "../../lib/data/provider";
import { labelFor, toneFor } from "../../lib/status";

const typeIcon: Partial<Record<TransactionType, typeof ArrowDownLeft>> = {
  DEPOSIT: ArrowDownLeft,
  WITHDRAWAL: ArrowUpRight,
  WITHDRAWAL_FEE: ArrowUpRight,
  INVESTMENT: Building2,
  MATURITY_PRINCIPAL: Landmark,
  MATURITY_PROFIT: TrendingUp,
  REFERRAL_REWARD: Gift,
  BONUS_TRANSFER: Gift,
  REFUND: RotateCcw,
  REVERSAL: RotateCcw,
  WITHDRAWAL_RELEASE: RotateCcw,
};

export function accountLabel(account: Transaction["account"]): string {
  return humanizeStatus(account);
}

export function TransactionRow({
  transaction,
  now,
  onSelect,
}: {
  transaction: Transaction;
  now: string;
  onSelect?: (id: string) => void;
}) {
  const Icon = typeIcon[transaction.type] ?? ArrowDownLeft;
  const credit = transaction.direction === "CREDIT";
  return (
    <button
      type="button"
      onClick={() => onSelect?.(transaction.id)}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-ring sm:px-5"
    >
      <span
        aria-hidden
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          credit ? "bg-success-soft text-[var(--success-fg)]" : "bg-surface-subtle text-muted-foreground",
        )}
      >
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-foreground">{transaction.title}</span>
        <span className="block text-[11px] text-tertiary">
          {formatListDate(transaction.occurredAt, now)} · {transaction.reference}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className={cn("tabular text-sm font-bold", credit ? "text-[var(--success-fg)]" : "text-foreground")}>
          {credit ? "+" : "−"}
          {formatMoney(transaction.amount, transaction.currency, { symbol: true })}
        </span>
        {transaction.status !== "SUCCESSFUL" ? (
          <StatusPill tone={toneFor(transaction.status)}>{labelFor(transaction.status)}</StatusPill>
        ) : null}
      </span>
    </button>
  );
}

function relatedLink(t: Transaction): { href: string; label: string } | null {
  if (!t.related) return null;
  switch (t.related.kind) {
    case "investment":
      return { href: `/portfolio/${t.related.id}`, label: "View investment" };
    case "withdrawal":
      return { href: `/wallet/withdrawals/${t.related.id}`, label: "View withdrawal" };
    case "referral":
      return { href: "/referrals", label: "View referrals" };
    case "deposit":
      return { href: `/wallet/deposit/${t.related.id}`, label: "View deposit" };
    default:
      return null;
  }
}

function TransactionDetail({ transaction }: { transaction: Transaction }) {
  const related = relatedLink(transaction);
  return (
    <div className="mt-2">
      <DataRow label="Amount" value={formatMoney(transaction.amount, transaction.currency)} strong />
      <DataRow label="Type" value={humanizeStatus(transaction.type)} />
      <DataRow label="Status" value={<StatusPill tone={toneFor(transaction.status)}>{labelFor(transaction.status)}</StatusPill>} />
      <DataRow label="Account" value={accountLabel(transaction.account)} />
      <DataRow label="Date/time" value={formatDateTime(transaction.occurredAt)} />
      <DataRow
        label="Reference"
        value={
          <button
            type="button"
            className="font-semibold text-primary hover:underline"
            onClick={() => {
              void navigator.clipboard?.writeText(transaction.reference);
              toast.success("Reference copied");
            }}
          >
            {transaction.reference}
          </button>
        }
      />
      {transaction.providerReference ? <DataRow label="Provider reference" value={transaction.providerReference} /> : null}
      <DataRow label="Description" value={transaction.description} />
      {transaction.balanceAfter !== undefined ? (
        <DataRow label="Balance after" value={formatMoney(transaction.balanceAfter, transaction.currency)} />
      ) : null}
      {related ? (
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <a href={related.href}>{related.label}</a>
        </Button>
      ) : null}
    </div>
  );
}

/** Detail surface — vaul Sheet below lg, Dialog on lg+. */
export function TransactionDetailSheet({
  transactionId,
  open,
  onOpenChange,
}: {
  transactionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ds = useDataSource();
  const [tx, setTx] = React.useState<Transaction | null>(null);
  const [isDesktop, setIsDesktop] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    if (open && transactionId) {
      void ds.getTransaction(transactionId).then((t) => {
        if (!cancelled) setTx(t);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [open, transactionId, ds]);

  const body = tx ? <TransactionDetail transaction={tx} /> : <Skeleton className="mt-4 h-48" />;
  const title = tx?.title ?? "Transaction";

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>
  );
}
