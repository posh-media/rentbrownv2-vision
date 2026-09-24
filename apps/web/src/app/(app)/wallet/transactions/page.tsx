"use client";

import * as React from "react";
import {
  Button,
  EmptyState,
  Input,
  MoneyFigure,
  SegmentedControl,
  Select,
  StatusPill,
  StatePanel,
} from "@rentbrown/ui";
import Link from "next/link";
import { ReceiptText, Search } from "lucide-react";
import type { TransactionFilter, TransactionStatus, TransactionType } from "@rentbrown/types";
import { formatDate, humanizeStatus } from "@rentbrown/utils";
import { MOCK_NOW } from "@rentbrown/mock-data";

import { useTransactions } from "../../../../lib/data/hooks";
import { useRequireSession } from "../../../../lib/session";
import { labelFor, toneFor } from "../../../../lib/status";
import { PageHeader } from "../../../../components/layout/page-header";
import { PageSkeleton } from "../../../../components/layout/page-skeleton";
import { TransactionDetailSheet, TransactionRow, accountLabel } from "../../../../components/wallet/transaction-row";

const TYPE_OPTIONS = [
  { value: "ALL", label: "All types" },
  { value: "DEPOSIT", label: "Deposits" },
  { value: "INVESTMENT", label: "Investments" },
  { value: "MATURITY", label: "Maturity" },
  { value: "WITHDRAWAL", label: "Withdrawals" },
  { value: "REWARDS", label: "Rewards" },
];

const STATUS_OPTIONS = [
  { value: "ALL", label: "All" },
  { value: "SUCCESSFUL", label: "Successful" },
  { value: "PENDING", label: "Pending" },
  { value: "FAILED", label: "Failed" },
];

const TYPE_MAP: Record<string, TransactionType[]> = {
  DEPOSIT: ["DEPOSIT"],
  INVESTMENT: ["INVESTMENT"],
  MATURITY: ["MATURITY_PRINCIPAL", "MATURITY_PROFIT"],
  WITHDRAWAL: ["WITHDRAWAL", "WITHDRAWAL_FEE", "WITHDRAWAL_RELEASE"],
  REWARDS: ["REFERRAL_REWARD", "BONUS_TRANSFER"],
};

const STATUS_MAP: Record<string, TransactionStatus[]> = {
  SUCCESSFUL: ["SUCCESSFUL"],
  PENDING: ["PENDING", "UNDER_REVIEW"],
  FAILED: ["FAILED", "REVERSED"],
};

function monthHeading(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-NG", { month: "long", year: "numeric" });
}

export default function TransactionsPage() {
  const session = useRequireSession();
  const [query, setQuery] = React.useState("");
  const [type, setType] = React.useState("ALL");
  const [status, setStatus] = React.useState("ALL");
  const [selected, setSelected] = React.useState<string | null>(null);

  const filter: TransactionFilter = React.useMemo(
    () => ({
      type: type === "ALL" ? "ALL" : TYPE_MAP[type],
      status: status === "ALL" ? "ALL" : STATUS_MAP[status],
      query: query || undefined,
    }),
    [type, status, query],
  );
  const transactions = useTransactions(filter);

  if (session.isPending || transactions.isPending) return <PageSkeleton />;

  if (transactions.isError) {
    return (
      <StatePanel
        tone="error"
        title="We couldn't load transactions"
        copy={transactions.error.message}
        action={
          <Button variant="outline" size="sm" onClick={() => transactions.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const items = transactions.data ?? [];
  const filtered = type === "ALL" && status === "ALL" && !query;
  const groups = items.reduce<Array<{ heading: string; items: typeof items }>>((acc, t) => {
    const h = monthHeading(t.occurredAt);
    const last = acc[acc.length - 1];
    if (last && last.heading === h) last.items.push(t);
    else acc.push({ heading: h, items: [t] });
    return acc;
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Transaction history" copy="A complete record with statuses and references." />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or reference"
            aria-label="Search transactions"
            className="pl-9"
          />
        </div>
        <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type" className="lg:w-48">
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <SegmentedControl
          options={STATUS_OPTIONS}
          value={status}
          onChange={setStatus}
          aria-label="Filter by status"
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<ReceiptText />}
          title={filtered ? "No transactions yet" : "No transactions found"}
          copy={filtered ? "Deposits, investments and withdrawals will appear here." : "Try a different search or filter."}
          action={
            filtered ? (
              <Button asChild>
                <Link href="/wallet/deposit">Make a deposit</Link>
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setType("ALL");
                  setStatus("ALL");
                }}
              >
                Clear filters
              </Button>
            )
          }
        />
      ) : (
        <>
          {/* lg+ table */}
          <div className="financial-card hidden overflow-hidden lg:block">
            <table className="w-full text-sm">
              <thead className="sticky top-16 bg-muted">
                <tr className="text-left">
                  <th className="eyebrow px-5 py-3 text-muted-foreground">Transaction</th>
                  <th className="eyebrow px-4 py-3 text-muted-foreground">Reference</th>
                  <th className="eyebrow px-4 py-3 text-muted-foreground">Account</th>
                  <th className="eyebrow px-4 py-3 text-right text-muted-foreground">Amount</th>
                  <th className="eyebrow px-5 py-3 text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((t) => (
                  <tr
                    key={t.id}
                    className="cursor-pointer hover:bg-surface-subtle"
                    onClick={() => setSelected(t.id)}
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-foreground">{t.title}</p>
                      <p className="text-[11px] text-tertiary">
                        {humanizeStatus(t.type)} · {formatDate(t.occurredAt)}
                      </p>
                    </td>
                    <td className="tabular px-4 py-3.5 text-xs text-muted-foreground">{t.reference}</td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground">{accountLabel(t.account)}</td>
                    <td
                      className={`tabular px-4 py-3.5 text-right font-bold ${t.direction === "CREDIT" ? "text-[var(--success-fg)]" : "text-foreground"}`}
                    >
                      {t.direction === "CREDIT" ? "+" : "−"}
                      <MoneyFigure amount={t.amount} currency={t.currency} size="xs" className="inline" />
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusPill tone={toneFor(t.status)}>{labelFor(t.status)}</StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* <lg grouped rows */}
          <div className="flex flex-col gap-5 lg:hidden">
            {groups.map((g) => (
              <div key={g.heading}>
                <p className="eyebrow mb-2 text-muted-foreground">{g.heading}</p>
                <div className="financial-card divide-y divide-border overflow-hidden">
                  {g.items.map((t) => (
                    <TransactionRow key={t.id} transaction={t} now={MOCK_NOW} onSelect={setSelected} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <TransactionDetailSheet transactionId={selected} open={selected !== null} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}
