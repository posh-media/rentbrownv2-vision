"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  DataRow,
  MoneyFigure,
  MoneyInput,
  StatePanel,
  Stepper,
  StatusPill,
  cn,
} from "@rentbrown/ui";
import { Landmark } from "lucide-react";
import type { MinorUnits } from "@rentbrown/types";
import { formatMoney, idempotencyKey } from "@rentbrown/utils";

import {
  useRequestWithdrawal,
  useWallet,
  useWithdrawalQuote,
} from "../../../../lib/data/hooks";
import { useRequireSession } from "../../../../lib/session";
import { PageHeader } from "../../../../components/layout/page-header";
import { PageSkeleton } from "../../../../components/layout/page-skeleton";
import { PinConfirmDialog } from "../../../../components/checkout/pin-confirm-dialog";

const FRACTIONS = [
  { label: "25%", f: 0.25 },
  { label: "50%", f: 0.5 },
  { label: "Max", f: 1 },
];

export default function WithdrawPage() {
  const session = useRequireSession();
  const wallet = useWallet();
  const router = useRouter();

  const [step, setStep] = React.useState(0);
  const [amount, setAmount] = React.useState<MinorUnits | null>(null);
  const [destinationId, setDestinationId] = React.useState<string | null>(null);
  const [pinOpen, setPinOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const quote = useWithdrawalQuote(amount, destinationId ?? undefined);
  const requestWithdrawal = useRequestWithdrawal();

  if (session.isPending || wallet.isPending) return <PageSkeleton />;
  if (wallet.isError) {
    return (
      <StatePanel
        tone="error"
        title="We couldn't load withdrawal options"
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
  const methods = w.payoutMethods;
  const destination = methods.find((m) => m.id === destinationId) ?? methods.find((m) => m.isDefault) ?? null;
  const q = quote.data;
  const maxAmount = q?.maxAmount ?? w.balances.AVAILABLE;
  const kycBlocked = q?.blockedReason?.toLowerCase().includes("identity") ?? false;
  const pinBlocked = q?.blockedReason?.toLowerCase().includes("pin") ?? false;

  const submit = async () => {
    if (amount === null || !destination) return;
    setPinOpen(false);
    setError(null);
    try {
      const wd = await requestWithdrawal.mutateAsync({
        amount,
        destinationId: destination.id,
        idempotencyKey: idempotencyKey(),
      });
      router.push(`/wallet/withdrawals/${wd.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The withdrawal could not be submitted.");
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <Stepper steps={["Amount", "Destination", "Review"]} current={step} />
      <PageHeader title="Withdraw to your bank" copy="Fees and the amount you will receive are itemised before you confirm." />

      {error ? <StatePanel tone="error" title="Withdrawal failed" copy={error} /> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_.75fr]">
        <div className="flex min-w-0 flex-col gap-6">
          {step === 0 ? (
            <div className="financial-card p-5 sm:p-6">
              <h2 className="text-base font-bold text-foreground">How much would you like to withdraw?</h2>
              <div className="mt-4">
                <MoneyInput value={amount} onValueChange={setAmount} aria-label="Withdrawal amount" className="h-14 text-lg" autoFocus />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {FRACTIONS.map((f) => (
                  <button
                    key={f.label}
                    type="button"
                    onClick={() => setAmount(Math.floor(maxAmount * f.f))}
                    className="min-h-9 rounded-full border border-border px-3 text-xs font-bold text-muted-foreground hover:text-foreground"
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {q && amount !== null && amount > 0 ? (
                <div className="mt-4 rounded-md bg-surface-subtle p-4">
                  {q.blockedReason ? (
                    <StatePanel
                      tone={kycBlocked || pinBlocked ? "warning" : "error"}
                      title="Can't withdraw this amount"
                      copy={q.blockedReason}
                      action={
                        kycBlocked ? (
                          <Button size="sm" variant="outline" asChild>
                            <Link href="/account/kyc">Complete verification</Link>
                          </Button>
                        ) : pinBlocked ? (
                          <Button size="sm" variant="outline" asChild>
                            <Link href="/account/security">Set a transaction PIN</Link>
                          </Button>
                        ) : undefined
                      }
                    />
                  ) : (
                    <>
                      <div className="flex items-center justify-between py-1.5 text-sm">
                        <span className="text-muted-foreground">Fee ({q.feeDescription})</span>
                        <span className="tabular font-semibold text-foreground">{formatMoney(q.fee, q.currency)}</span>
                      </div>
                      <div className="flex items-center justify-between border-t border-border py-1.5">
                        <span className="text-sm font-bold text-foreground">You will receive</span>
                        <MoneyFigure amount={q.netAmount} currency={q.currency} size="sm" />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{q.estimatedArrival}</p>
                    </>
                  )}
                </div>
              ) : null}

              <Button
                size="lg"
                className="mt-5 w-full"
                disabled={!q?.eligible}
                onClick={() => setStep(1)}
              >
                Continue
              </Button>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="financial-card p-5 sm:p-6">
              <h2 className="text-base font-bold text-foreground">Choose a destination</h2>
              <div role="radiogroup" aria-label="Payout destination" className="mt-4 flex flex-col gap-2.5">
                {methods.map((m) => {
                  const selected = destination?.id === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setDestinationId(m.id)}
                      className={cn(
                        "flex min-h-11 items-center gap-3 rounded-lg border p-4 text-left transition-colors",
                        selected ? "border-primary bg-accent" : "border-border hover:bg-surface-subtle",
                      )}
                    >
                      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", selected ? "bg-primary text-primary-foreground" : "bg-secondary-soft text-primary")}>
                        <Landmark className="size-4.5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-foreground">{m.bankName}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {m.accountName} · {m.accountNumberMasked}
                        </span>
                      </span>
                      <span className="flex shrink-0 gap-1.5">
                        {m.isDefault ? <StatusPill tone="info">Default</StatusPill> : null}
                        {m.verified ? <StatusPill tone="success">Verified</StatusPill> : null}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  disabled
                  className="flex min-h-11 cursor-not-allowed items-center gap-3 rounded-lg border border-dashed border-border p-4 text-left opacity-60"
                >
                  <span className="text-sm font-semibold text-muted-foreground">Add new bank account</span>
                  <span className="ml-auto text-xs text-muted-foreground">Available after verification in a later phase</span>
                </button>
              </div>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => setStep(0)} className="sm:w-auto">
                  Back
                </Button>
                <Button size="lg" className="flex-1" disabled={!destination} onClick={() => setStep(2)}>
                  Review withdrawal
                </Button>
              </div>
            </div>
          ) : null}

          {step === 2 && q ? (
            <div className="financial-card p-5 sm:p-6">
              <h2 className="text-base font-bold text-foreground">Review your withdrawal</h2>
              <div className="mt-3">
                <DataRow label="Amount requested" value={formatMoney(q.amount, q.currency)} />
                <DataRow label="Fee" value={`${formatMoney(q.fee, q.currency)} · ${q.feeDescription}`} />
                <DataRow label="Amount to receive" value={formatMoney(q.netAmount, q.currency)} strong tone="success" />
                <DataRow
                  label="Destination"
                  value={destination ? `${destination.bankName} ${destination.accountNumberMasked}` : "—"}
                />
                <DataRow label="Estimated arrival" value={q.estimatedArrival} />
              </div>
              <p className="mt-4 rounded-md bg-surface-subtle p-3 text-xs text-muted-foreground">
                Funds move to your reserved balance while the request is reviewed.
              </p>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => setStep(1)} className="sm:w-auto">
                  Back
                </Button>
                <Button size="lg" className="flex-1" onClick={() => setPinOpen(true)} disabled={requestWithdrawal.isPending}>
                  Confirm with transaction PIN
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="financial-card p-5 sm:p-6">
            <p className="eyebrow text-muted-foreground">Available to withdraw</p>
            <MoneyFigure amount={w.balances.AVAILABLE} currency={w.currency} size="md" className="mt-2" />
            <p className="mt-2 text-xs text-muted-foreground">
              Reserved {formatMoney(w.balances.RESERVED, w.currency)} · not withdrawable
            </p>
          </div>
        </aside>
      </div>

      <PinConfirmDialog
        open={pinOpen}
        onOpenChange={setPinOpen}
        amount={amount ?? 0}
        currency={w.currency}
        destination={destination ? `${destination.bankName} ${destination.accountNumberMasked}` : "your bank account"}
        loading={requestWithdrawal.isPending}
        onConfirm={() => void submit()}
      />
    </div>
  );
}
