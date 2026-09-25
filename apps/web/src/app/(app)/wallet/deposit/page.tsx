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
import type { DepositMethod, MinorUnits, PaymentProvider } from "@rentbrown/types";
import { formatMoney, idempotencyKey } from "@rentbrown/utils";

import { useCreateDeposit, useDepositOptions, useWallet } from "../../../../lib/data/hooks";
import { useRequireSession } from "../../../../lib/session";
import { PageHeader } from "../../../../components/layout/page-header";
import { PageSkeleton } from "../../../../components/layout/page-skeleton";

const CHIPS = [10_000, 50_000, 100_000, 250_000]; // major units

/** Provider → wire method for the intent contract (server enforces the rail). */
const PROVIDER_METHOD: Record<PaymentProvider, DepositMethod> = {
  PAYSTACK: "CARD",
  KORAPAY: "BANK_TRANSFER",
};

const PROVIDER_META: Record<PaymentProvider, { icon: typeof Landmark; label: string; hint: string }> = {
  PAYSTACK: { icon: CreditCard, label: "Paystack", hint: "Card, bank transfer & USSD via Paystack checkout" },
  KORAPAY: { icon: Landmark, label: "KoraPay", hint: "Card & bank transfer via KoraPay checkout" },
};

export default function DepositPage() {
  const session = useRequireSession();
  const wallet = useWallet();
  const options = useDepositOptions();
  const createDeposit = useCreateDeposit();
  const router = useRouter();

  const [step, setStep] = React.useState(0);
  const [amount, setAmount] = React.useState<MinorUnits | null>(null);
  const [provider, setProvider] = React.useState<PaymentProvider | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  if (session.isPending || wallet.isPending || options.isPending) return <PageSkeleton />;
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

  const min = options.data?.minDeposit ?? wallet.data.policies.minDeposit;
  const max = options.data?.maxDeposit ?? null;
  // Server-configured providers only — a disabled rail is never selectable.
  const available = options.data?.providers.filter((p) => p.enabled) ?? [];
  const selectedProvider = provider && available.some((p) => p.id === provider)
    ? provider
    : available[0]?.id ?? null;
  const amountOk = amount !== null && amount >= min && (max === null || amount <= max);

  const submit = async () => {
    if (amount === null || selectedProvider === null) return;
    setError(null);
    try {
      const intent = await createDeposit.mutateAsync({
        amount,
        method: PROVIDER_METHOD[selectedProvider],
        provider: selectedProvider,
        idempotencyKey: idempotencyKey(),
      });
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
            Minimum {formatMoney(min, "NGN")}
            {max !== null ? ` · Maximum ${formatMoney(max, "NGN")}` : ""} · No deposit fee
          </p>
          <Button size="lg" className="mt-5 w-full" disabled={!amountOk} onClick={() => setStep(1)}>
            Continue
          </Button>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="financial-card p-5 sm:p-6">
          <h2 className="text-base font-bold text-foreground">Choose a provider</h2>
          <div role="radiogroup" aria-label="Deposit provider" className="mt-4 flex flex-col gap-2.5">
            {available.length === 0 ? (
              <StatePanel
                tone="warning"
                title="No deposit providers available"
                copy="Online deposits are temporarily unavailable. Please try again later."
              />
            ) : (
              available.map((p) => {
                const meta = PROVIDER_META[p.id];
                const Icon = meta.icon;
                const selected = selectedProvider === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setProvider(p.id)}
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
                        {meta.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{meta.hint}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setStep(0)} className="sm:w-auto">
              Back
            </Button>
            <Button
              size="lg"
              className="flex-1"
              disabled={createDeposit.isPending || selectedProvider === null}
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
