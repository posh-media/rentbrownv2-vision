"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock3, Loader2, XCircle } from "lucide-react";
import {
  Button,
  DataRow,
  EmptyState,
  SkeletonCard,
  StatePanel,
  StatusPill,
  Stepper,
  toast,
} from "@rentbrown/ui";
import type { InvestmentSubmission, PaymentStatus } from "@rentbrown/types";
import { formatDateTime, formatMoney } from "@rentbrown/utils";

import { useSubmission } from "../../../../lib/data/hooks";
import { useRequireSession } from "../../../../lib/session";
import { TransferInstructions } from "../../../../components/checkout/transfer-instructions";

const PREVIEW_STATES: Record<string, PaymentStatus> = {
  pending: "PENDING",
  confirming: "CONFIRMING",
  success: "SUCCESSFUL",
  failed: "FAILED",
  refunded: "REFUNDED",
};

export default function PaymentPage() {
  const { reference } = useParams<{ reference: string }>();
  const searchParams = useSearchParams();
  const session = useRequireSession();
  const submission = useSubmission(reference);

  const previewState = PREVIEW_STATES[searchParams.get("state") ?? ""];

  if (session.isPending || (submission.isPending && !previewState)) {
    return <SkeletonCard className="mx-auto h-96 max-w-3xl" />;
  }

  if (submission.isError && !previewState) {
    return (
      <StatePanel
        tone="error"
        title="We couldn't load this payment"
        copy={submission.error.message}
        action={
          <Button variant="outline" size="sm" onClick={() => submission.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const data = submission.data;
  if (!data && !previewState) {
    return (
      <EmptyState
        title="We couldn't find that payment"
        copy="The reference may be wrong, or the submission expired."
        action={
          <Button variant="outline" asChild>
            <Link href="/portfolio">Go to portfolio</Link>
          </Button>
        }
      />
    );
  }

  const status: PaymentStatus = previewState ?? data!.paymentStatus;
  const sub: InvestmentSubmission | undefined = data ?? undefined;

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-3">
        <Stepper steps={["Confirm", "Pay"]} current={2} />
        {previewState ? <StatusPill tone="info">Preview state</StatusPill> : null}
      </div>

      <div className="financial-card w-full max-w-3xl p-6 sm:p-10">
        {status === "PENDING" ? (
          <>
            <StatePanel tone="warning" icon={<Clock3 />} title="Waiting for your transfer" />
            {sub?.transferInstructions ? (
              <TransferInstructions
                instructions={sub.transferInstructions}
                amount={sub.amount}
                currency={sub.currency}
              />
            ) : null}
            <p className="mt-4 text-sm text-muted-foreground">
              Slots are confirmed when your payment is verified. If capacity runs out before then, your
              payment is refunded in full.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => toast.success("Thanks — we'll confirm within minutes")}>
                I’ve sent the transfer
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/portfolio">Back to portfolio</Link>
              </Button>
            </div>
          </>
        ) : null}

        {status === "CONFIRMING" ? (
          <StatePanel
            tone="pending"
            icon={<Loader2 className="animate-spin motion-reduce:animate-none" />}
            title="Confirming your card payment"
            copy="Safe to leave — we'll notify you when it completes."
          />
        ) : null}

        {status === "SUCCESSFUL" ? (
          <>
            <StatePanel tone="success" icon={<CheckCircle2 />} title="Investment confirmed" />
            <div className="mt-4">
              <DataRow label="Reference" value={sub?.reference ?? reference} />
              <DataRow label="Funding source" value={sub ? fundingLabel(sub.fundingSource) : "—"} />
              <DataRow
                label="Amount"
                value={sub ? formatMoney(sub.amount, sub.currency) : "—"}
                strong
              />
              <DataRow label="Date" value={sub ? formatDateTime(sub.submittedAt) : "—"} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Opportunity, slots, expected profit and maturity value are on the investment record.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {sub?.investmentId ? (
                <Button asChild>
                  <Link href={`/portfolio/${sub.investmentId}`}>View investment</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/portfolio">View investment</Link>
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link href="/portfolio">Go to portfolio</Link>
              </Button>
            </div>
          </>
        ) : null}

        {status === "FAILED" ? (
          <>
            <StatePanel
              tone="error"
              icon={<XCircle />}
              title="Payment was not completed"
              copy={sub?.failureReason ?? "The payment could not be processed. No funds were taken."}
            />
            <div className="mt-6 flex flex-wrap gap-2">
              <Button onClick={() => history.back()}>Try another method</Button>
              <Button variant="ghost" asChild>
                <Link href="/explore">Explore other opportunities</Link>
              </Button>
            </div>
          </>
        ) : null}

        {status === "REFUNDED" ? (
          <StatePanel
            tone="neutral"
            title="Payment refunded"
            copy="Your payment was returned in full to the funding source."
          />
        ) : null}
      </div>
    </div>
  );
}

function fundingLabel(source: InvestmentSubmission["fundingSource"]): string {
  switch (source) {
    case "WALLET":
      return "Wallet";
    case "BANK_TRANSFER":
      return "Bank transfer";
    case "CARD":
      return "Debit card";
  }
}
