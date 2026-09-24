"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  SkeletonCard,
  StatePanel,
  Stepper,
  cn,
} from "@rentbrown/ui";
import type { FundingSource } from "@rentbrown/types";
import { formatMoney, idempotencyKey, pluralize } from "@rentbrown/utils";

import {
  useInvestmentQuote,
  useOpportunities,
  useSubmitInvestment,
} from "../../../../lib/data/hooks";
import { useRequireSession } from "../../../../lib/session";
import { PageHeader } from "../../../../components/layout/page-header";
import { SlotStepper } from "../../../../components/checkout/slot-stepper";
import { FundingSourcePicker } from "../../../../components/checkout/funding-source-picker";
import { QuoteSummary } from "../../../../components/checkout/quote-summary";
import { PinConfirmDialog } from "../../../../components/checkout/pin-confirm-dialog";

export default function CheckoutPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const session = useRequireSession();

  const [slots, setSlots] = React.useState<number | null>(null);
  const [funding, setFunding] = React.useState<FundingSource | null>(null);
  const [terms, setTerms] = React.useState(false);
  const [pinOpen, setPinOpen] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const quote = useInvestmentQuote(roundId, slots ?? (Number(searchParams.get("slots")) || 1));
  const submit = useSubmitInvestment();
  const opportunities = useOpportunities();

  const opportunity = (opportunities.data ?? []).find((o) => o.round.id === roundId);
  const effectiveSlots = slots ?? quote.data?.slots ?? 1;

  // Debounce slot changes → quote refetch (placeholder keeps previous quote).
  const debounce = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const setSlotsDebounced = (n: number) => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setSlots(n), 250);
  };

  if (session.isPending || quote.isPending) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_.75fr]">
        <div className="flex flex-col gap-6">
          <SkeletonCard className="h-40" />
          <SkeletonCard className="h-56" />
        </div>
        <SkeletonCard className="h-96" />
      </div>
    );
  }

  if (quote.isError) {
    return (
      <StatePanel
        tone="error"
        title="We couldn't prepare this investment"
        copy={quote.error.message}
        action={
          <Button variant="outline" size="sm" onClick={() => quote.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const q = quote.data;
  const anyFunding = q.fundingOptions.some((f) => f.available);
  const selectedOption = q.fundingOptions.find((f) => f.source === funding);
  const activeFunding = selectedOption?.available ? funding : null;
  const canSubmit = terms && activeFunding !== null && !submit.isPending;

  const doSubmit = async (source: FundingSource) => {
    setSubmitError(null);
    try {
      const submission = await submit.mutateAsync({
        roundId,
        slots: q.slots,
        fundingSource: source,
        idempotencyKey: idempotencyKey(),
      });
      router.push(`/payment/${submission.reference}`);
    } catch (e) {
      setPinOpen(false);
      setSubmitError(e instanceof Error ? e.message : "The investment could not be submitted.");
    }
  };

  const onConfirm = () => {
    if (!activeFunding) return;
    if (activeFunding === "WALLET") {
      setPinOpen(true);
    } else {
      void doSubmit(activeFunding);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <Stepper steps={["Confirm", "Pay"]} current={1} />
      <PageHeader
        title="Confirm your investment"
        copy="Review every amount and the key terms before choosing how to pay."
      />

      {submitError ? (
        <StatePanel tone="error" title="Submission failed" copy={submitError} />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_.75fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="financial-card p-5 sm:p-6">
            <h2 className="text-base font-bold text-foreground">Number of slots</h2>
            <div className="mt-4">
              <SlotStepper value={effectiveSlots} min={q.minSlots} max={Math.max(q.maxSlots, q.minSlots)} onChange={setSlotsDebounced} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {formatMoney(q.slotPrice, q.currency)} per slot · {pluralize(q.availableSlots, "slot")} available · up to{" "}
              {pluralize(q.maxSlots, "slot")} for you
            </p>
          </div>

          <div className="financial-card p-5 sm:p-6">
            <h2 className="text-base font-bold text-foreground">Funding source</h2>
            <div className="mt-4">
              <FundingSourcePicker
                options={q.fundingOptions}
                currency={q.currency}
                value={activeFunding}
                onChange={setFunding}
              />
            </div>
          </div>

          <div className="financial-card p-5 sm:p-6">
            <h2 className="text-base font-bold text-foreground">Before you continue</h2>
            <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-2.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
                className="mt-0.5 size-4 accent-[var(--primary)]"
              />
              <span>
                I’ve read the{" "}
                {opportunity ? (
                  <Link href={`/opportunities/${opportunity.property.slug}`} className="font-bold text-primary hover:underline">
                    terms and the risk disclosures
                  </Link>
                ) : (
                  "terms and the risk disclosures"
                )}{" "}
                for this round.
              </span>
            </label>
            {opportunity?.plan.terms[0] ? (
              <p className="mt-2 text-xs text-muted-foreground">{opportunity.plan.terms[0]}</p>
            ) : null}
          </div>
        </div>

        <aside className={cn("lg:sticky lg:top-24 lg:self-start", quote.isFetching && "opacity-70 transition-opacity")}>
          {opportunity ? (
            <QuoteSummary opportunity={opportunity} quote={q}>
              <Button
                size="lg"
                className="mt-5 w-full"
                disabled={!canSubmit}
                onClick={onConfirm}
              >
                {activeFunding === "WALLET"
                  ? "Confirm with transaction PIN"
                  : "Continue to payment"}
              </Button>
              {!anyFunding ? (
                <p className="mt-2 text-center text-xs text-[var(--warning-fg)]">
                  No funding method is available for this amount.
                </p>
              ) : null}
            </QuoteSummary>
          ) : (
            <div className="financial-card p-6">
              <Button size="lg" className="w-full" disabled={!canSubmit} onClick={onConfirm}>
                Continue to payment
              </Button>
            </div>
          )}
        </aside>
      </div>

      <PinConfirmDialog
        open={pinOpen}
        onOpenChange={setPinOpen}
        amount={q.principal}
        currency={q.currency}
        destination={opportunity ? `${opportunity.property.name} — Round ${opportunity.round.roundNumber}` : "Investment"}
        loading={submit.isPending}
        onConfirm={() => void doSubmit("WALLET")}
      />
    </div>
  );
}
