"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
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
import type { DepositStatus } from "@rentbrown/types";
import { formatDateTime, formatMoney } from "@rentbrown/utils";

import { useDeposit } from "../../../../../lib/data/hooks";
import { useRequireSession } from "../../../../../lib/session";
import { TransferInstructions } from "../../../../../components/checkout/transfer-instructions";

const PREVIEW: Record<string, DepositStatus> = {
  awaiting: "AWAITING_TRANSFER",
  confirming: "CONFIRMING",
  credited: "CREDITED",
  failed: "FAILED",
  expired: "EXPIRED",
};

export default function DepositStatusPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const session = useRequireSession();
  const deposit = useDeposit(id);
  const preview = PREVIEW[searchParams.get("state") ?? ""];

  if (session.isPending || (deposit.isPending && !preview)) {
    return <SkeletonCard className="mx-auto h-96 max-w-2xl" />;
  }

  if (deposit.isError && !preview) {
    return (
      <StatePanel
        tone="error"
        title="We couldn't load this deposit"
        copy={deposit.error.message}
        action={
          <Button variant="outline" size="sm" onClick={() => deposit.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const d = deposit.data;
  if (!d && !preview) {
    return (
      <EmptyState
        title="We couldn't find that deposit"
        copy="The reference may be wrong or the deposit expired."
        action={
          <Button variant="outline" asChild>
            <Link href="/wallet">Back to wallet</Link>
          </Button>
        }
      />
    );
  }

  const status = preview ?? d!.status;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-3">
        <Stepper steps={["Amount", "Method", "Transfer"]} current={2} />
        {preview ? <StatusPill tone="info">Preview state</StatusPill> : null}
      </div>

      <div className="financial-card w-full p-6 sm:p-10">
        {status === "AWAITING_TRANSFER" ? (
          <>
            <StatePanel tone="warning" title="Complete your payment" />
            {d?.checkoutUrl ? (
              <>
                <p className="mt-4 text-sm text-muted-foreground">
                  Continue to the secure {d.method === "CARD" ? "Paystack" : "KoraPay"} checkout to pay{" "}
                  <span className="font-semibold text-foreground">{formatMoney(d.amount, d.currency)}</span>.
                  Your wallet credits automatically once the provider confirms.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Button asChild>
                    <a href={d.checkoutUrl} target="_blank" rel="noopener noreferrer">
                      Continue to payment
                    </a>
                  </Button>
                  <Button variant="outline" onClick={() => deposit.refetch()}>
                    I&apos;ve paid — check status
                  </Button>
                  <Button variant="ghost" asChild>
                    <Link href="/wallet">Back to wallet</Link>
                  </Button>
                </div>
              </>
            ) : (
              <>
                {d?.transferInstructions ? (
                  <TransferInstructions
                    instructions={d.transferInstructions}
                    amount={d.amount}
                    currency={d.currency}
                  />
                ) : null}
                <p className="mt-4 text-sm text-muted-foreground">
                  Use only a bank account in your name. Your wallet updates after confirmation.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => toast.success("Thanks — we'll confirm within minutes")}>
                    I&apos;ve sent it
                  </Button>
                  <Button variant="ghost" asChild>
                    <Link href="/wallet">Back to wallet</Link>
                  </Button>
                </div>
              </>
            )}
          </>
        ) : null}

        {status === "CONFIRMING" ? (
          <StatePanel
            tone="pending"
            icon={<Loader2 className="animate-spin motion-reduce:animate-none" />}
            title="Confirming your deposit"
            copy="We've received the transfer and are confirming it with the bank. Safe to leave — we'll notify you."
          />
        ) : null}

        {status === "CREDITED" ? (
          <>
            <StatePanel tone="success" icon={<CheckCircle2 />} title="Deposit credited" />
            <div className="mt-4">
              <DataRow label="Reference" value={d?.reference ?? "—"} />
              <DataRow label="Amount" value={d ? formatMoney(d.amount, d.currency) : "—"} strong />
              <DataRow label="Method" value={d?.method === "CARD" ? "Debit card" : "Bank transfer"} />
              {d?.creditedAt ? <DataRow label="Credited" value={formatDateTime(d.creditedAt)} /> : null}
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/explore">Explore opportunities</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/wallet">Back to wallet</Link>
              </Button>
            </div>
          </>
        ) : null}

        {status === "FAILED" || status === "EXPIRED" ? (
          <>
            <StatePanel
              tone="error"
              icon={<XCircle />}
              title={status === "EXPIRED" ? "Transfer window expired" : "Deposit was not completed"}
              copy="No funds were credited. Start a new deposit when you're ready."
            />
            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/wallet/deposit">Start again</Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/wallet">Back to wallet</Link>
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
