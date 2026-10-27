"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, MoneyInput, StatePanel, Stepper, cn } from "@rentbrown/ui";
import { CreditCard, Globe, Landmark } from "lucide-react";
import type { CurrencyCode, DepositMethod, MinorUnits, PaymentProvider } from "@rentbrown/types";
import { formatMoney, idempotencyKey } from "@rentbrown/utils";

import { useCreateDeposit, useDepositOptions, useWallet } from "../../../../lib/data/hooks";
import { useRequireSession } from "../../../../lib/session";
import { PageHeader } from "../../../../components/layout/page-header";
import { PageSkeleton } from "../../../../components/layout/page-skeleton";

const CHIPS_NGN = [10_000, 50_000, 100_000, 250_000]; // major units
const CHIPS_USD = [10, 50, 100, 250];

/** Provider → deposit currency (server re-enforces the corridor). */
const PROVIDER_CURRENCY: Record<PaymentProvider, CurrencyCode> = {
  PAYSTACK: "NGN",
  KORAPAY: "NGN",
  BACHS: "USD",
};

const PROVIDER_META: Record<
  PaymentProvider,
  { icon: typeof Landmark; label: string; hint: string }
> = {
  PAYSTACK: {
    icon: CreditCard,
    label: "Paystack",
    hint: "Card, bank transfer & USSD via Paystack checkout",
  },
  KORAPAY: { icon: Landmark, label: "KoraPay", hint: "Card & bank transfer via KoraPay checkout" },
  BACHS: { icon: Globe, label: "Bachs", hint: "USD card & crypto — settles to your USD wallet" },
};

/** Bachs corridor picker → wire method + hosted-checkout restriction. */
const BACHS_RAILS: Array<{ id: string; method: DepositMethod; label: string; hint: string }> = [
  { id: "USD_CARD", method: "CARD", label: "USD card", hint: "Visa / Mastercard charged in USD" },
  {
    id: "CRYPTO",
    method: "CRYPTO",
    label: "Crypto",
    hint: "Supported stablecoins & networks — picked at checkout",
  },
];

export default function DepositPage() {
  const session = useRequireSession();
  const wallet = useWallet();
  const options = useDepositOptions();
  const createDeposit = useCreateDeposit();
  const router = useRouter();

  const [step, setStep] = React.useState(0);
  const [amount, setAmount] = React.useState<MinorUnits | null>(null);
  const [provider, setProvider] = React.useState<PaymentProvider | null>(null);
  const [bachsRail, setBachsRail] = React.useState<(typeof BACHS_RAILS)[number]["id"]>("USD_CARD");
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

  // Server-configured providers only — a disabled rail is never selectable.
  const available = options.data?.providers.filter((p) => p.enabled) ?? [];
  const selectedProvider =
    provider && available.some((p) => p.id === provider) ? provider : (available[0]?.id ?? null);
  // Corridor → deposit currency. Bachs is the USD rail; NGN stays on
  // Paystack/KoraPay. Currency-specific minimums come from deposit_options().
  const currency = selectedProvider ? PROVIDER_CURRENCY[selectedProvider] : "NGN";
  const min =
    options.data?.currencies?.[currency]?.minDeposit ??
    (currency === "NGN" ? (options.data?.minDeposit ?? wallet.data.policies.minDeposit) : 0);
  const max = currency === "NGN" ? (options.data?.maxDeposit ?? null) : null;
  const chips = currency === "USD" ? CHIPS_USD : CHIPS_NGN;
  const rail =
    selectedProvider === "BACHS" ? (BACHS_RAILS.find((r) => r.id === bachsRail) ?? null) : null;
  const amountOk = amount !== null && amount >= min && (max === null || amount <= max);

  const submit = async () => {
    if (amount === null || selectedProvider === null) return;
    setError(null);
    try {
      const intent = await createDeposit.mutateAsync({
        amount,
        method: rail?.method ?? (selectedProvider === "KORAPAY" ? "BANK_TRANSFER" : "CARD"),
        provider: selectedProvider,
        currency,
        paymentMethodTypes: rail ? [rail.id] : undefined,
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
      <PageHeader
        title="Add money to your wallet"
        copy="Deposits are free. Your balance updates when the transfer is confirmed."
      />

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
            {chips.map((chip) => (
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
                {formatMoney(chip * 100, currency)}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Minimum {formatMoney(min, currency)}
            {max !== null ? ` · Maximum ${formatMoney(max, currency)}` : ""} · No deposit fee
          </p>
          <Button size="lg" className="mt-5 w-full" disabled={!amountOk} onClick={() => setStep(1)}>
            Continue
          </Button>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="financial-card p-5 sm:p-6">
          <h2 className="text-base font-bold text-foreground">Choose a provider</h2>
          <div
            role="radiogroup"
            aria-label="Deposit provider"
            className="mt-4 flex flex-col gap-2.5"
          >
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
                      selected
                        ? "border-primary bg-accent"
                        : "border-border hover:bg-surface-subtle",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-md",
                        selected
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary-soft text-primary",
                      )}
                    >
                      <Icon className="size-4.5" aria-hidden />
                    </span>
                    <span>
                      <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                        {meta.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {meta.hint}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {selectedProvider === "BACHS" ? (
            <div className="mt-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-tertiary">Pay with</h3>
              <div
                role="radiogroup"
                aria-label="Bachs payment method"
                className="mt-2 flex flex-col gap-2"
              >
                {BACHS_RAILS.map((r) => {
                  const selected = bachsRail === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setBachsRail(r.id)}
                      className={cn(
                        "flex min-h-11 items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors",
                        selected
                          ? "border-primary bg-accent"
                          : "border-border hover:bg-surface-subtle",
                      )}
                    >
                      <span>
                        <span className="block text-sm font-bold text-foreground">{r.label}</span>
                        <span className="block text-xs text-muted-foreground">{r.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Payment completes on the Bachs hosted checkout — your wallet updates when the
                payment is confirmed.
              </p>
            </div>
          ) : null}

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
              {createDeposit.isPending
                ? "Starting…"
                : `Continue · ${formatMoney(amount ?? 0, currency)}`}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
