"use client";

import * as React from "react";
import Link from "next/link";
import {
  Button,
  DataRow,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  MoneyFigure,
  StatePanel,
  StatusPill,
  toast,
} from "@rentbrown/ui";
import { Landmark, Plus, ReceiptText } from "lucide-react";
import { formatBps, formatMoney } from "@rentbrown/utils";
import { MOCK_NOW } from "@rentbrown/mock-data";

import { useTransactions, useWallet } from "../../../lib/data/hooks";
import { useRequireSession } from "../../../lib/session";
import { PageHeader } from "../../../components/layout/page-header";
import { PageSkeleton } from "../../../components/layout/page-skeleton";
import { Section } from "../../../components/layout/section";
import { WalletBalanceCard } from "../../../components/wallet/wallet-balance-card";
import { TransactionDetailSheet, TransactionRow } from "../../../components/wallet/transaction-row";

export default function WalletPage() {
  const session = useRequireSession();
  const wallet = useWallet();
  const transactions = useTransactions();
  const [selected, setSelected] = React.useState<string | null>(null);
  const [bonusOpen, setBonusOpen] = React.useState(false);

  if (session.isPending || wallet.isPending) return <PageSkeleton tall />;

  if (wallet.isError) {
    return (
      <StatePanel
        tone="error"
        title="We couldn't load your wallet"
        copy={wallet.error.message}
        action={
          <Button variant="outline" size="sm" onClick={() => wallet.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const w = wallet.data;
  const recent = (transactions.data ?? []).slice(0, 6);
  const policies = w.policies;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Wallet"
        copy="See exactly what is available, reserved, rewarded or still pending."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/wallet/withdraw">Withdraw</Link>
            </Button>
            <Button asChild>
              <Link href="/wallet/deposit">Deposit</Link>
            </Button>
          </>
        }
      />

      <WalletBalanceCard wallet={w} />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_.6fr]">
        <Section title="Recent transactions" actionHref="/wallet/transactions" actionLabel="View all">
          {transactions.isPending ? (
            <div className="financial-card p-6 text-sm text-muted-foreground">Loading…</div>
          ) : recent.length === 0 ? (
            <EmptyState
              icon={<ReceiptText />}
              title="No transactions yet"
              copy="Deposits, investments and withdrawals will appear here with references."
              action={
                <Button asChild>
                  <Link href="/wallet/deposit">Make a deposit</Link>
                </Button>
              }
            />
          ) : (
            <div className="financial-card divide-y divide-border overflow-hidden">
              {recent.map((t) => (
                <TransactionRow key={t.id} transaction={t} now={MOCK_NOW} onSelect={setSelected} />
              ))}
            </div>
          )}
        </Section>

        <div className="flex min-w-0 flex-col gap-6">
          <div className="financial-card p-5">
            <h2 className="text-base font-bold text-foreground">Payout methods</h2>
            <div className="mt-3 flex flex-col divide-y divide-border">
              {w.payoutMethods.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">No bank accounts yet.</p>
              ) : (
                w.payoutMethods.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary-soft text-primary">
                        <Landmark className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-foreground">{m.bankName}</p>
                        <p className="truncate text-[11px] text-tertiary">
                          {m.accountName} · {m.accountNumberMasked}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {m.isDefault ? <StatusPill tone="info">Default</StatusPill> : null}
                      {m.verified ? <StatusPill tone="success">Verified</StatusPill> : null}
                    </div>
                  </div>
                ))
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 w-full"
              onClick={() => toast.info("Coming in a later phase")}
            >
              <Plus className="size-4" aria-hidden /> Add bank account
            </Button>
          </div>

          <div className="financial-card p-5">
            <h2 className="text-base font-bold text-foreground">Bonus balance</h2>
            <MoneyFigure amount={w.balances.BONUS} currency={w.currency} size="md" className="mt-2" />
            <p className="mt-1 text-xs text-muted-foreground">
              Qualified referral rewards — invest them or transfer to available.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              disabled={w.balances.BONUS <= 0}
              onClick={() => setBonusOpen(true)}
            >
              Transfer to available
            </Button>
          </div>

          <div className="financial-card p-5">
            <h2 className="text-base font-bold text-foreground">Fees &amp; limits</h2>
            <div className="mt-2">
              <DataRow
                label="Withdrawal fee"
                value={`${formatBps(policies.withdrawalFeeBps)} capped at ${formatMoney(policies.withdrawalFeeCap, w.currency)}`}
              />
              <DataRow label="Minimum withdrawal" value={formatMoney(policies.minWithdrawal, w.currency)} />
              <DataRow label="Minimum deposit" value={formatMoney(policies.minDeposit, w.currency)} />
              <DataRow label="Deposit fee" value="None" />
              <DataRow
                label="Withdrawal verification"
                value={policies.kycRequiredForWithdrawal ? "Identity verification required" : "Not required"}
              />
            </div>
          </div>
        </div>
      </div>

      <TransactionDetailSheet transactionId={selected} open={selected !== null} onOpenChange={(o) => !o && setSelected(null)} />

      <Dialog open={bonusOpen} onOpenChange={setBonusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer bonus to available?</DialogTitle>
            <DialogDescription>
              <MoneyFigure amount={w.balances.BONUS} currency={w.currency} size="md" className="mt-1" />
              <span className="mt-1 block">will move to your available balance.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBonusOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setBonusOpen(false);
                toast.success("Bonus transfers arrive with the backend phase");
              }}
            >
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
