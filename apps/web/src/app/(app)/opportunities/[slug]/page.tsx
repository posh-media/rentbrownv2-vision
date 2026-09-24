"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { Check, ChevronLeft } from "lucide-react";
import {
  Button,
  DataRow,
  Divider,
  EmptyState,
  MoneyFigure,
  SkeletonCard,
  StatePanel,
  StatCard,
  StatusPill,
  toast,
} from "@rentbrown/ui";
import {
  formatBps,
  formatDate,
  formatDuration,
  formatMoney,
  pluralize,
} from "@rentbrown/utils";

import { useOpportunity, useSession } from "../../../../lib/data/hooks";
import { propertyImage } from "../../../../lib/images";
import { labelFor, toneFor } from "../../../../lib/status";
import { Section } from "../../../../components/layout/section";
import { ProofDocumentCard } from "../../../../components/opportunities/proof-document-card";
import { AvailabilityBar } from "../../../../components/opportunities/availability-bar";

export default function OpportunityPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const session = useSession();
  const opportunity = useOpportunity(slug);

  if (opportunity.isPending) {
    return (
      <div className="grid gap-8 lg:grid-cols-[1.35fr_.65fr]">
        <SkeletonCard className="h-96" />
        <SkeletonCard className="h-96" />
      </div>
    );
  }

  if (opportunity.isError) {
    return (
      <StatePanel
        tone="error"
        title="We couldn't load this opportunity"
        copy={opportunity.error.message}
        action={
          <Button variant="outline" size="sm" onClick={() => opportunity.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const o = opportunity.data;
  if (!o) {
    return (
      <EmptyState
        title="Opportunity not found"
        copy="This round may have closed or the link is wrong."
        action={
          <Button variant="outline" asChild>
            <Link href="/explore">Back to opportunities</Link>
          </Button>
        }
      />
    );
  }

  const { property, plan, round, perSlot } = o;
  const investable = round.status === "OPEN" || round.status === "NEARING_CAPACITY";
  const investHref = session.data
    ? `/checkout/${round.id}`
    : `/login?next=${encodeURIComponent(`/checkout/${round.id}`)}`;

  const rows: Array<[string, React.ReactNode, { strong?: boolean }?]> = [
    ["Investment plan", plan.name],
    ["Round", `Round ${round.roundNumber}`],
    ["Round status", <StatusPill key="s" tone={toneFor(round.status)}>{labelFor(round.status)}</StatusPill>],
    ["Slot price", formatMoney(plan.slotPrice, plan.currency)],
    ["Expected return (full term)", formatBps(plan.roiBps), { strong: true }],
    ["Duration", formatDuration(plan.duration)],
    ["Minimum slots", pluralize(plan.minSlots, "slot")],
    ["Maximum per investor", plan.maxSlotsPerUser ? pluralize(plan.maxSlotsPerUser, "slot") : "No limit"],
    ["Investment fee", plan.investmentFeeBps === 0 ? "None" : formatBps(plan.investmentFeeBps)],
    ["Opens", formatDate(round.opensAt)],
    ["Closes", formatDate(round.closesAt)],
    ["Projected start", formatDate(round.projectedStartAt)],
    ["Projected maturity", formatDate(round.projectedMaturityAt)],
  ];

  return (
    <div className="flex flex-col gap-8">
      <Link
        href="/explore"
        className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
      >
        <ChevronLeft className="size-4" aria-hidden /> Back to opportunities
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1.35fr_.65fr]">
        <div className="flex min-w-0 flex-col gap-8">
          {/* Gallery */}
          <div>
            <div className="relative">
              <Image
                src={propertyImage(property.images[0] ?? "ikoyi-residences")}
                alt={`${property.name}, fictional property`}
                width={960}
                height={540}
                priority
                sizes="(min-width: 1024px) 65vw, 100vw"
                className="aspect-[16/9] w-full rounded-xl object-cover"
              />
              <span className="glass-dark absolute left-4 top-4 rounded-full px-3 py-1.5 text-xs font-bold text-primary-foreground">
                {labelFor(round.status)}
              </span>
            </div>
            {property.images.length > 1 ? (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md">
                {property.images.slice(1, 3).map((img) => (
                  <Image
                    key={img}
                    src={propertyImage(img)}
                    alt={`${property.name}, fictional property`}
                    width={320}
                    height={200}
                    className="aspect-[16/10] w-full rounded-lg object-cover"
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">{property.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {property.location.label} · {property.type} · Round {round.roundNumber}
            </p>
          </div>

          <Section title="One slot, shown separately">
            <p className="text-sm text-muted-foreground">
              Principal, expected profit and maturity value are never combined into a single number.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Principal per slot"
                value={<MoneyFigure amount={perSlot.principal} currency={plan.currency} size="sm" />}
              />
              <StatCard
                label="Expected profit per slot"
                value={<MoneyFigure amount={perSlot.expectedProfit} currency={plan.currency} size="sm" />}
              />
              <StatCard
                emphasis
                label="Maturity value per slot"
                value={<MoneyFigure amount={perSlot.maturityValue} currency={plan.currency} size="sm" tone="inverse" />}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {formatBps(plan.roiBps)} expected return over {formatDuration(plan.duration)}. Expected, not guaranteed.
            </p>
          </Section>

          <Section title="Round and terms">
            <div className="financial-card px-5 py-2">
              {rows.map(([label, value, opts]) => (
                <DataRow key={label} label={label} value={value} strong={opts?.strong} />
              ))}
            </div>
          </Section>

          <Section title="About the property">
            <p className="text-sm leading-relaxed text-foreground">{property.description}</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {property.highlights.map((h) => (
                <li key={h} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="mt-0.5 size-4 shrink-0 text-[var(--success-fg)]" aria-hidden />
                  {h}
                </li>
              ))}
            </ul>
            <div className="rounded-lg bg-surface-subtle p-4">
              <p className="eyebrow text-muted-foreground">How returns are funded</p>
              <p className="mt-2 text-sm text-foreground">{property.revenueModel}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {property.operator.name} — {property.operator.description}
              </p>
            </div>
          </Section>

          <Section title="Property proof">
            <p className="text-xs text-muted-foreground">
              Documents are fictional examples with reviewer, date and version.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {property.proofDocuments.map((doc) => (
                <ProofDocumentCard key={doc.id} document={doc} />
              ))}
            </div>
          </Section>

          {property.updates.length > 0 ? (
            <Section title="Updates">
              <ol className="flex flex-col gap-4 border-l-2 border-border pl-4">
                {property.updates.map((u) => (
                  <li key={u.id}>
                    <p className="text-sm font-bold text-foreground">{u.title}</p>
                    <p className="mt-0.5 text-xs text-tertiary">{formatDate(u.publishedAt)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{u.body}</p>
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}

          <Section title="Terms">
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-foreground">
              {plan.terms.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <StatePanel tone="warning" title="Risk disclosures">
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm opacity-90">
                {plan.riskDisclosures.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </StatePanel>
          </Section>
        </div>

        {/* Invest aside */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="financial-card hidden p-6 lg:block">
            <StatusPill tone={toneFor(round.status)}>{labelFor(round.status)}</StatusPill>
            <h2 className="mt-3 text-lg font-extrabold text-foreground">Invest in Round {round.roundNumber}</h2>
            <div className="mt-4">
              <AvailabilityBar round={round} />
              <p className="mt-2 text-xs text-muted-foreground">
                {pluralize(round.availableSlots, "slot")} of {pluralize(round.totalSlots, "slot")} available
              </p>
            </div>
            <Divider className="my-4" />
            <DataRow label="Slot price" value={formatMoney(plan.slotPrice, plan.currency)} />
            <DataRow label="Expected return" value={formatBps(plan.roiBps)} />
            <DataRow label="Duration" value={formatDuration(plan.duration)} />
            <DataRow label="Projected maturity" value={formatDate(round.projectedMaturityAt)} />
            <DataRow label="Minimum" value={pluralize(plan.minSlots, "slot")} />
            <div className="mt-4 rounded-md bg-surface-subtle p-4">
              <p className="text-[11px] font-semibold text-muted-foreground">Maturity value per slot</p>
              <MoneyFigure amount={perSlot.maturityValue} currency={plan.currency} size="md" className="mt-1" />
            </div>
            {investable ? (
              <Button size="lg" className="mt-5 w-full" asChild>
                <Link href={investHref}>Invest now</Link>
              </Button>
            ) : round.status === "SOLD_OUT" ? (
              <>
                <Button size="lg" className="mt-5 w-full" disabled>
                  Fully subscribed
                </Button>
                <Button
                  variant="outline"
                  className="mt-2 w-full"
                  onClick={() => toast.success("We'll tell you when the next round opens")}
                >
                  Notify me about the next round
                </Button>
              </>
            ) : (
              <>
                <Button size="lg" className="mt-5 w-full" disabled>
                  Opens {formatDate(round.opensAt)}
                </Button>
                <Button
                  variant="outline"
                  className="mt-2 w-full"
                  onClick={() => toast.success("We'll remind you when this round opens")}
                >
                  Remind me
                </Button>
              </>
            )}
          </div>
        </aside>
      </div>

      {/* Mobile sticky invest bar */}
      {investable ? (
        <div className="glass-strong fixed inset-x-0 bottom-14 z-30 border-t border-glass-border px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground">Slot price</p>
              <MoneyFigure amount={plan.slotPrice} currency={plan.currency} size="sm" />
            </div>
            <Button onClick={() => router.push(investHref)}>Invest now</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
