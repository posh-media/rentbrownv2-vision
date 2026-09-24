"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import {
  Button,
  DataRow,
  EmptyState,
  SkeletonCard,
  StatePanel,
  StatusPill,
  Timeline,
  type TimelineItem,
  toast,
} from "@rentbrown/ui";
import type { Withdrawal, WithdrawalStatus } from "@rentbrown/types";
import { formatDateTime, formatMoney, humanizeStatus } from "@rentbrown/utils";

import { useWithdrawal } from "../../../../../lib/data/hooks";
import { useRequireSession } from "../../../../../lib/session";
import { labelFor } from "../../../../../lib/status";
import { PageHeader } from "../../../../../components/layout/page-header";

const PREVIEW: Record<string, WithdrawalStatus> = {
  review: "UNDER_REVIEW",
  completed: "COMPLETED",
  rejected: "REJECTED",
};

function titleFor(status: WithdrawalStatus): string {
  switch (status) {
    case "COMPLETED":
      return "Withdrawal completed";
    case "REJECTED":
    case "FAILED":
      return "Withdrawal rejected";
    default:
      return "Withdrawal submitted";
  }
}

function toTimeline(w: Withdrawal): TimelineItem[] {
  const firstOpen = w.timeline.findIndex((t) => t.at === null);
  return w.timeline.map((t, i) => ({
    id: `${t.status}-${i}`,
    label: humanizeStatus(t.status),
    at: t.at,
    note: t.note,
    state: t.at !== null ? "done" : i === firstOpen ? "current" : "upcoming",
  }));
}

export default function WithdrawalStatusPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const session = useRequireSession();
  const withdrawal = useWithdrawal(id);
  const preview = PREVIEW[searchParams.get("state") ?? ""];

  if (session.isPending || (withdrawal.isPending && !preview)) {
    return <SkeletonCard className="mx-auto h-96 max-w-3xl" />;
  }

  if (withdrawal.isError && !preview) {
    return (
      <StatePanel
        tone="error"
        title="We couldn't load this withdrawal"
        copy={withdrawal.error.message}
        action={
          <Button variant="outline" size="sm" onClick={() => withdrawal.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const w = withdrawal.data;
  if (!w && !preview) {
    return (
      <EmptyState
        title="We couldn't find that withdrawal"
        copy="The reference may be wrong."
        action={
          <Button variant="outline" asChild>
            <Link href="/wallet">Back to wallet</Link>
          </Button>
        }
      />
    );
  }

  const status = preview ?? w!.status;
  const failed = status === "REJECTED" || status === "FAILED";
  const done = status === "COMPLETED";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <PageHeader title={titleFor(status)} copy={w ? w.reference : undefined} />
        {preview ? <StatusPill tone="info" className="w-fit">Preview state</StatusPill> : null}
      </div>

      <div className="financial-card p-6 sm:p-10">
        {done ? (
          <StatePanel
            tone="success"
            icon={<CheckCircle2 />}
            title="Paid"
            copy={
              w
                ? `${formatMoney(w.netAmount, w.currency)} was paid to ${w.destination.bankName} ${w.destination.accountNumberMasked}.`
                : "Your withdrawal was paid."
            }
          />
        ) : failed ? (
          <StatePanel
            tone="error"
            icon={<XCircle />}
            title={status === "REJECTED" ? "Withdrawal rejected" : "Withdrawal failed"}
            copy={`${w?.rejectionReason ?? "The request could not be completed."} Reserved funds were returned to your available balance.`}
          />
        ) : (
          <StatePanel
            tone="pending"
            icon={<Clock3 />}
            title="Under review"
            copy={
              w
                ? `You will receive ${formatMoney(w.netAmount, w.currency)} in your ${w.destination.bankName} account when completed. Reviews typically complete within 1 business day.`
                : "Your withdrawal is under review."
            }
          />
        )}

        {w ? (
          <div className="mt-6">
            <DataRow label="Amount" value={formatMoney(w.amount, w.currency)} />
            <DataRow label="Fee" value={formatMoney(w.fee, w.currency)} />
            <DataRow label="Amount received" value={formatMoney(w.netAmount, w.currency)} strong />
            <DataRow label="Destination" value={`${w.destination.bankName} ${w.destination.accountNumberMasked}`} />
            <DataRow label="Reference" value={w.reference} />
            <DataRow label="Requested" value={formatDateTime(w.requestedAt)} />
            {w.completedAt ? <DataRow label="Completed" value={formatDateTime(w.completedAt)} /> : null}
            <DataRow label="Status" value={<StatusPill tone={done ? "success" : failed ? "error" : "pending"}>{labelFor(status)}</StatusPill>} />
          </div>
        ) : null}

        {w ? (
          <div className="mt-8">
            <h2 className="mb-4 text-sm font-bold text-foreground">Progress</h2>
            <Timeline items={toTimeline(w)} />
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/wallet">Return to wallet</Link>
          </Button>
          <Button variant="ghost" onClick={() => toast.info("Support arrives with the help phase")}>
            Contact support
          </Button>
        </div>
      </div>
    </div>
  );
}
