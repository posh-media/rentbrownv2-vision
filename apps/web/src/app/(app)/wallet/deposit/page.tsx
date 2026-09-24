"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  MoneyInput,
  StatePanel,
  Stepper,
  cn,
} from "@rentbrown/ui";
import { CreditCard, Landmark } from "lucide-react";
import type { DepositMethod, MinorUnits } from "@rentbrown/types";
import { formatMoney, idempotencyKey } from "@rentbrown/utils";

import { useCreateDeposit, useWallet } from "../../../../lib/data/hooks";
import { useRequireSession } from "../../../../lib/session";
import { PageHeader } from "../../../../components/layout/page-header";
import { PageSkeleton } from "../../../../components/layout/page-skeleton";

const CHIPS = [10_000, 50_000, 100_000, 250_000]; // major units

const methods: Array<{ source: DepositMethod; icon: typeof Landmark; label: string; hint: string; recommended?: boolean }> = [
  { source: "BANK_TRANSFER", icon: Landmark, label: "Bank transfer", hint: "Usually credited within minutes", recommended: true },
  { source: "CARD", icon: CreditCard, label: "Debit card", hint: "Cards issued by Nigerian banks" },
];

export default function DepositPage() {
  const session = useRequireSession();
  const wallet = useWallet();
  const createDeposit = useCreateDeposit();
  const router = useRouter();

  const [step, setStep] = React.useState(0);
  const [amount, setAmount] = React.useState<MinorUnits | null>(null);
  const [method, setMethod] = React.useState<DepositMethod>("BANK_TRANSFER");
  const [error, setError] = React.useState<string | null>(null);

  if (session.isPending || wallet.isPending) return <PageSkeleton />;
  if (wallet.isError) {
    return (
      <StatePanel
        tone="error"
        title="We couldn't load deposit options"
        copy={wallet.error.message}
        action={
          <Button variant="outline" size="sm" onClick={() => wallet.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const min = wallet.data.policies.minDeposit;
  const amountOk = amount !== null && amount >= min;

  const submit = async () => {
    if (amount === null) return;
    setError(null);
    try {
      const intent = await createDeposit.mutateAsync({ amount, method, idempotencyKey: idempotencyKey() });
      router.push(`/wallet/deposit/${intent.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The deposit could not be started.");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <Stepper steps={["Amount", "Method", "Transfer"]} current={step} />
      <PageHeader title="Add money to your wallet" copy="Deposits are free. Your balance updates when the transfer is confirmed." />

      {error ? <StatePanel tone="error" title="Deposit failed" copy={error} /> : null}

      {step === 0 ? (
        <div className="financial-card p-5 sm:p-6">
          <h2 className="text-base font-bold text-foreground">How much would you like to add?</h2>
          <div className="mt-4">
            <MoneyInput
              value={amount}
              onValueChange={setAmount}
              aria-label="Deposit amount"
              className="h-14 text-lg"
              autoFocus
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setAmount(chip * 100)}
                className={cn(
                  "min-h-9 rounded-full border px-3 text-xs font-bold",
                  amount === chip * 100
                    ? "border-primary bg-accent text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {formatMoney(chip * 100)}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Minimum {formatMoney(min, "NGN")} · No deposit fee
          </p>
          <Button size="lg" className="mt-5 w-full" disabled={!amountOk} onClick={() => setStep(1)}>
            Continue
          </Button>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="financial-card p-5 sm:p-6">
          <h2 className="text-base font-bold text-foreground">Choose a method</h2>
          <div role="radiogroup" aria-label="Deposit method" className="mt-4 flex flex-col gap-2.5">
            {methods.map((m) => {
              const Icon = m.icon;
              const selected = method === m.source;
              return (
                <button
                  key={m.source}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setMethod(m.source)}
                  className={cn(
                    "flex min-h-11 items-start gap-3 rounded-lg border p-4 text-left transition-colors",
                    selected ? "border-primary bg-accent" : "border-border hover:bg-surface-subtle",
                  )}
                >
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", selected ? "bg-primary text-primary-foreground" : "bg-secondary-soft text-primary")}>
                    <Icon className="size-4.5" aria-hidden />
                  </span>
                  <span>
                    <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                      {m.label}
                      {m.recommended ? (
                        <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold text-[var(--success-fg)]">
                          Recommended
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{m.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setStep(0)} className="sm:w-auto">
              Back
            </Button>
            <Button
              size="lg"
              className="flex-1"
              disabled={createDeposit.isPending}
              onClick={() => void submit()}
            >
              {createDeposit.isPending ? "Starting…" : `Continue · ${formatMoney(amount ?? 0)}`}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
