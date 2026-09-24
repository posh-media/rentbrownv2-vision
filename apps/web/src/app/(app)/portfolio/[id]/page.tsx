"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  Button,
  DataRow,
  EmptyState,
  MoneyFigure,
  StatePanel,
  StatCard,
  StatusPill,
  toast,
} from "@rentbrown/ui";
import type { Investment } from "@rentbrown/types";
import {
  formatBps,
  formatDate,
  formatDuration,
  formatMoney,
  pluralize,
} from "@rentbrown/utils";

import { useInvestment, useOpportunity } from "../../../../lib/data/hooks";
import { useRequireSession } from "../../../../lib/session";
import { propertyImage } from "../../../../lib/images";
import { labelFor, toneFor } from "../../../../lib/status";
import { PageHeader } from "../../../../components/layout/page-header";
import { PageSkeleton } from "../../../../components/layout/page-skeleton";
import { InvestmentTimeline } from "../../../../components/investments/investment-timeline";

function eyebrowFor(status: Investment["status"]): string {
  if (status === "COMPLETED") return "Matured investment";
  if (status === "PAYMENT_PENDING") return "Awaiting payment";
  return "Active investment";
}

function copyFor(inv: Investment): string {
  if (inv.status === "COMPLETED" && inv.completedAt) return `Completed on ${formatDate(inv.completedAt, "long")}`;
  if (inv.status === "PAYMENT_PENDING") return "Complete your bank transfer to confirm your slots.";
  if (inv.maturesAt) return `Matures on ${formatDate(inv.maturesAt, "long")}`;
  return "";
}

function fundingLabel(source: Investment["fundingSource"]): string {
  return source === "WALLET" ? "Wallet" : source === "BANK_TRANSFER" ? "Bank transfer" : "Debit card";
}

export default function InvestmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const session = useRequireSession();
  const investment = useInvestment(id);

  const inv = investment.data;
  const opportunity = useOpportunity(inv?.propertySlug ?? "");

  if (session.isPending || investment.isPending) return <PageSkeleton />;

  if (investment.isError) {
    return (
      <StatePanel
        tone="error"
        title="We couldn't load this investment"
        copy={investment.error.message}
        action={
          <Button variant="outline" size="sm" onClick={() => investment.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  if (!inv) {
    return (
      <EmptyState
        title="We couldn't find that investment"
        copy="It may have been removed or the link is wrong."
        action={
          <Button variant="outline" asChild>
            <Link href="/portfolio">Back to portfolio</Link>
          </Button>
        }
      />
    );
  }

  const completed = inv.status === "COMPLETED";
  const pending = inv.status === "PAYMENT_PENDING";

  return (
    <div className="flex flex-col gap-8">
      <Link
        href="/portfolio"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Back to portfolio
      </Link>

      <PageHeader eyebrow={eyebrowFor(inv.status)} title={inv.propertyName} copy={copyFor(inv)} />

      {pending ? (
        <StatePanel
          tone="warning"
          title="Awaiting your bank transfer"
          copy="Your slots are held while your transfer is verified. If capacity runs out first, your payment is refunded in full."
          action={
            <Button size="sm" asChild>
              <Link href={`/payment/${inv.reference}`}>View transfer instructions</Link>
            </Button>
          }
        />
      ) : completed ? (
        <StatePanel
          tone="success"
          title="Principal and profit credited"
          copy={
            inv.settlement
              ? `${formatMoney(inv.maturityValue, inv.currency)} was credited to your available balance on ${formatDate(inv.settlement.creditedAt)}. References ${inv.settlement.principalReference} · ${inv.settlement.profitReference}.`
              : `${formatMoney(inv.maturityValue, inv.currency)} was credited to your available balance.`
          }
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href="/wallet">View wallet</Link>
            </Button>
          }
        />
      ) : (
        <StatePanel
          tone="success"
          title="Investment is active"
          copy={`Your principal is allocated. ${inv.daysRemaining ?? "—"} days remain until maturity.`}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard
          label="Principal"
          value={<MoneyFigure amount={inv.principal} currency={inv.currency} size="md" />}
        />
        <StatCard
          label={completed ? "Profit credited" : "Expected profit"}
          value={<MoneyFigure amount={inv.expectedProfit} currency={inv.currency} size="md" />}
          note={completed ? undefined : "Expected, not guaranteed"}
        />
        <StatCard
          label={completed ? "Settled value" : "Maturity value"}
          value={<MoneyFigure amount={inv.maturityValue} currency={inv.currency} size="md" />}
          emphasis
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_.8fr]">
        <div className="financial-card min-w-0 p-5 sm:p-6">
          <h2 className="text-base font-bold text-foreground">Investment record</h2>
          <div className="mt-3">
            <DataRow
              label="Reference"
              value={
                <button
                  type="button"
                  className="font-semibold text-primary hover:underline"
                  onClick={() => {
                    void navigator.clipboard?.writeText(inv.reference);
                    toast.success("Reference copied");
                  }}
                >
                  {inv.reference}
                </button>
              }
            />
            <DataRow
              label="Property"
              value={
                <Link href={`/opportunities/${inv.propertySlug}`} className="font-semibold text-primary hover:underline">
                  {inv.propertyName}
                </Link>
              }
            />
            <DataRow label="Plan" value={inv.planName} />
            <DataRow label="Slots" value={pluralize(inv.slots, "slot")} />
            <DataRow label="Slot price" value={formatMoney(inv.slotPrice, inv.currency)} />
            <DataRow label="Expected return (full term)" value={formatBps(inv.roiBps)} strong />
            <DataRow label="Duration" value={formatDuration(inv.duration)} />
            <DataRow label="Funding source" value={fundingLabel(inv.fundingSource)} />
            {inv.activatedAt ? <DataRow label="Activated" value={formatDate(inv.activatedAt)} /> : null}
            {inv.maturesAt ? <DataRow label="Matures" value={formatDate(inv.maturesAt)} /> : null}
            {inv.completedAt ? <DataRow label="Completed" value={formatDate(inv.completedAt)} /> : null}
            <DataRow label="Status" value={<StatusPill tone={toneFor(inv.status)}>{labelFor(inv.status)}</StatusPill>} />
            {inv.settlement ? (
              <>
                <DataRow label="Principal settlement" value={inv.settlement.principalReference} />
                <DataRow label="Profit settlement" value={inv.settlement.profitReference} />
              </>
            ) : null}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <div className="financial-card p-5 sm:p-6">
            <h2 className="mb-4 text-base font-bold text-foreground">Progress</h2>
            <InvestmentTimeline events={inv.timeline} />
          </div>
          <Link
            href={`/opportunities/${inv.propertySlug}`}
            className="financial-card group flex items-center gap-4 p-4 transition-shadow hover:shadow-md"
          >
            <Image
              src={propertyImage(inv.propertyImage)}
              alt={`${inv.propertyName}, fictional property`}
              width={96}
              height={72}
              className="aspect-[4/3] w-24 shrink-0 rounded-md object-cover"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-foreground">{inv.propertyName}</span>
              <span className="block text-xs text-muted-foreground">{inv.locationLabel}</span>
              <span className="mt-1 block text-xs font-bold text-primary group-hover:underline">
                View opportunity →
              </span>
            </span>
          </Link>
        </div>
      </div>

      <StatePanel
        tone="info"
        title="No early exit"
        copy={
          opportunity.data?.plan.terms[0] ??
          "Principal cannot be withdrawn before maturity. It is returned to your wallet together with expected profit at settlement."
        }
      />
    </div>
  );
}
