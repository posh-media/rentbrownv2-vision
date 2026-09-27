"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Checkbox,
  DataRow,
  Field,
  Input,
  MoneyFigure,
  MoneyInput,
  Select,
  StatePanel,
  Stepper,
  StatusPill,
  cn,
  toast,
} from "@rentbrown/ui";
import { Landmark, Star, Trash2 } from "lucide-react";
import type { MinorUnits, PayoutMethod } from "@rentbrown/types";
import { formatMoney, idempotencyKey } from "@rentbrown/utils";

import {
  useArchiveBankAccount,
  useRequestWithdrawal,
  useSaveBankAccount,
  useSetDefaultBankAccount,
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

/** Common Nigerian banks — name + CBN code. "Other" allows a manual entry. */
const BANKS: Array<{ name: string; code: string }> = [
  { name: "Access Bank", code: "044" },
  { name: "Citibank Nigeria", code: "023" },
  { name: "Ecobank Nigeria", code: "050" },
  { name: "Fidelity Bank", code: "070" },
  { name: "First Bank of Nigeria", code: "011" },
  { name: "FCMB", code: "214" },
  { name: "Globus Bank", code: "103" },
  { name: "GTBank", code: "058" },
  { name: "Heritage Bank", code: "030" },
  { name: "Jaiz Bank", code: "301" },
  { name: "Keystone Bank", code: "082" },
  { name: "Kuda Microfinance", code: "50211" },
  { name: "Moniepoint MFB", code: "50515" },
  { name: "OPay", code: "999992" },
  { name: "PalmPay", code: "999991" },
  { name: "Polaris Bank", code: "076" },
  { name: "Providus Bank", code: "101" },
  { name: "Stanbic IBTC", code: "221" },
  { name: "Sterling Bank", code: "232" },
  { name: "Union Bank", code: "032" },
  { name: "United Bank for Africa", code: "033" },
  { name: "Unity Bank", code: "215" },
  { name: "Wema Bank", code: "035" },
  { name: "Zenith Bank", code: "057" },
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

  const [addingBank, setAddingBank] = React.useState(false);
  const [bankChoice, setBankChoice] = React.useState(BANKS[0]!.name);
  const [bankName, setBankName] = React.useState("");
  const [bankCode, setBankCode] = React.useState("");
  const [accountNumber, setAccountNumber] = React.useState("");
  const [accountName, setAccountName] = React.useState("");
  const [makeDefault, setMakeDefault] = React.useState(false);
  const [bankError, setBankError] = React.useState<string | null>(null);

  const quote = useWithdrawalQuote(amount, destinationId ?? undefined);
  const requestWithdrawal = useRequestWithdrawal();
  const saveBank = useSaveBankAccount();
  const archiveBank = useArchiveBankAccount();
  const setDefaultBank = useSetDefaultBankAccount();

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

  const submit = async (pin: string) => {
    if (amount === null || !destination) return;
    setPinOpen(false);
    setError(null);
    try {
      const wd = await requestWithdrawal.mutateAsync({
        amount,
        destinationId: destination.id,
        pin,
        idempotencyKey: idempotencyKey(),
      });
      router.push(`/wallet/withdrawals/${wd.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The withdrawal could not be submitted.");
    }
  };

  const isOtherBank = bankChoice === "Other";
  const chosenBank = BANKS.find((b) => b.name === bankChoice);

  const saveBankAccount = async () => {
    setBankError(null);
    const name = isOtherBank ? bankName.trim() : (chosenBank?.name ?? "");
    const code = isOtherBank ? bankCode.trim() : (chosenBank?.code ?? "");
    if (!name || !code) {
      setBankError("Choose a bank.");
      return;
    }
    if (!/^\d{6,20}$/.test(accountNumber)) {
      setBankError("Account numbers are 6–20 digits.");
      return;
    }
    if (accountName.trim().length < 3) {
      setBankError("Enter the account name exactly as the bank has it.");
      return;
    }
    try {
      const saved = await saveBank.mutateAsync({
        bankName: name,
        bankCode: code,
        accountNumber,
        accountName: accountName.trim(),
        makeDefault,
      });
      setDestinationId(saved.id);
      setAddingBank(false);
      setAccountNumber("");
      setAccountName("");
      toast.success("Bank account saved");
    } catch (e) {
      setBankError(e instanceof Error ? e.message : "Couldn't save the account — try again.");
    }
  };

  const archive = async (m: PayoutMethod) => {
    try {
      await archiveBank.mutateAsync(m.id);
      if (destinationId === m.id) setDestinationId(null);
      toast.success(`${m.bankName} ${m.accountNumberMasked} removed`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove the account.");
    }
  };

  const makeDefaultFn = async (m: PayoutMethod) => {
    try {
      await setDefaultBank.mutateAsync(m.id);
      toast.success(`${m.bankName} is now your default`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the default account.");
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
              {q && q.minAmount > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Minimum withdrawal {formatMoney(q.minAmount, q.currency)}
                </p>
              ) : null}
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
                    <div
                      key={m.id}
                      role="radio"
                      aria-checked={selected}
                      tabIndex={0}
                      onClick={() => setDestinationId(m.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setDestinationId(m.id);
                        }
                      }}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-4 text-left transition-colors",
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
                      <span className="flex shrink-0 items-center gap-1.5">
                        {m.isDefault ? (
                          <StatusPill tone="info">Default</StatusPill>
                        ) : (
                          <button
                            type="button"
                            title="Make default"
                            aria-label={`Make ${m.bankName} ${m.accountNumberMasked} default`}
                            disabled={setDefaultBank.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              void makeDefaultFn(m);
                            }}
                            className="rounded-md p-1.5 text-tertiary hover:bg-surface-subtle hover:text-foreground"
                          >
                            <Star className="size-3.5" aria-hidden />
                          </button>
                        )}
                        {m.verified ? <StatusPill tone="success">Verified</StatusPill> : null}
                        <button
                          type="button"
                          title="Remove account"
                          aria-label={`Remove ${m.bankName} ${m.accountNumberMasked}`}
                          disabled={archiveBank.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            void archive(m);
                          }}
                          className="rounded-md p-1.5 text-tertiary hover:bg-surface-subtle hover:text-error"
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </button>
                      </span>
                    </div>
                  );
                })}
                {methods.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No saved accounts yet — add the bank account your payout should go to.
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => setAddingBank((v) => !v)}
                  className="flex min-h-11 items-center gap-3 rounded-lg border border-dashed border-border p-4 text-left hover:bg-surface-subtle"
                >
                  <span className="text-sm font-semibold text-muted-foreground">
                    {addingBank ? "Close bank form" : "Add new bank account"}
                  </span>
                </button>

                {addingBank ? (
                  <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
                    {bankError ? <StatePanel tone="error" title="Couldn't save" copy={bankError} /> : null}
                    <Field label="Bank" htmlFor="wd-bank">
                      <Select id="wd-bank" value={bankChoice} onChange={(e) => setBankChoice(e.target.value)}>
                        {BANKS.map((b) => (
                          <option key={b.code} value={b.name}>
                            {b.name}
                          </option>
                        ))}
                        <option value="Other">Other bank</option>
                      </Select>
                    </Field>
                    {isOtherBank ? (
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Bank name" htmlFor="wd-bank-name">
                          <Input id="wd-bank-name" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Titan Trust Bank" />
                        </Field>
                        <Field label="Bank code" htmlFor="wd-bank-code">
                          <Input id="wd-bank-code" value={bankCode} onChange={(e) => setBankCode(e.target.value)} placeholder="CBN code" />
                        </Field>
                      </div>
                    ) : null}
                    <Field label="Account number" htmlFor="wd-acct">
                      <Input
                        id="wd-acct"
                        inputMode="numeric"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 20))}
                        placeholder="10-digit NUBAN"
                      />
                    </Field>
                    <Field label="Account name" htmlFor="wd-acct-name">
                      <Input
                        id="wd-acct-name"
                        value={accountName}
                        onChange={(e) => setAccountName(e.target.value)}
                        placeholder="Exactly as registered with the bank"
                      />
                    </Field>
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Checkbox checked={makeDefault} onCheckedChange={(v) => setMakeDefault(v === true)} />
                      Make this my default account
                    </label>
                    <Button size="sm" className="self-start" disabled={saveBank.isPending} onClick={() => void saveBankAccount()}>
                      {saveBank.isPending ? "Saving…" : "Save account"}
                    </Button>
                  </div>
                ) : null}
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
        onConfirm={(pin) => void submit(pin)}
      />
    </div>
  );
}
