import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Check, ChevronLeft, MapPin } from "lucide-react";
import { Button, DataRow, MoneyFigure, ProgressBar, StatCard, StatusPill } from "@rentbrown/ui";
import { properties } from "@rentbrown/mock-data";
import type { Opportunity } from "@rentbrown/types";
import {
  formatBps,
  formatDate,
  formatDuration,
  formatMoney,
  humanizeStatus,
  pluralize,
  ROUND_STATUS,
} from "@rentbrown/utils";

import { CtaBand } from "../../../components/cta-band";
import { appLinks, catalogue, propertyImage, proofStatusTone } from "../../../lib/site";

export function generateStaticParams() {
  return properties.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const opportunity = await catalogue.getOpportunity(slug);
  if (!opportunity) return { title: "Opportunity not found" };
  const { property, plan } = opportunity;
  const description = `${property.summary} ${formatBps(plan.roiBps)} expected over ${formatDuration(plan.duration)} — expected, not guaranteed. Fictional prototype data.`;
  return {
    title: `${property.name} · ${plan.name}`,
    description,
    alternates: { canonical: `/explore/${slug}` },
    openGraph: {
      title: `${property.name} · ${plan.name}`,
      description,
      images: [propertyImage(property.images[0] ?? "ikoyi-residences")],
    },
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <h2 className="font-display text-2xl tracking-tight text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default async function OpportunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const opportunity: Opportunity | null = await catalogue.getOpportunity(slug);
  if (!opportunity) notFound();

  const { property, plan, round, perSlot } = opportunity;
  const status = ROUND_STATUS[round.status];
  const investable = round.status === "OPEN" || round.status === "NEARING_CAPACITY";

  const planRows: Array<[string, React.ReactNode]> = [
    ["Investment plan", plan.name],
    ["Round", `Round ${round.roundNumber}`],
    ["Slot price", formatMoney(plan.slotPrice, plan.currency)],
    ["Expected return (full term)", formatBps(plan.roiBps)],
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
    <article className="rb-container py-10 sm:py-14">
      <Link
        href="/explore"
        className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
      >
        <ChevronLeft className="size-4" aria-hidden /> Back to opportunities
      </Link>

      {/* Hero */}
      <div className="mt-6 grid items-end gap-8 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="relative">
          <Image
            src={propertyImage(property.images[0] ?? "ikoyi-residences")}
            alt={`${property.name}, ${property.location.label} — fictional property`}
            width={960}
            height={540}
            priority
            sizes="(min-width: 1024px) 62vw, 100vw"
            className="aspect-[16/9] w-full rounded-2xl border border-border object-cover shadow-md"
          />
          <span className="glass-dark absolute left-4 top-4 rounded-full px-3 py-1.5 text-xs font-bold">
            {status.label}
          </span>
        </div>
        <div>
          <p className="eyebrow text-secondary">{plan.name}</p>
          <h1 className="mt-2 font-display text-3xl leading-tight tracking-tight text-foreground sm:text-4xl">
            {property.name}
          </h1>
          <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4" aria-hidden /> {property.location.label} · {property.type} · Round{" "}
            {round.roundNumber}
          </p>
          <div className="mt-6">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-semibold text-muted-foreground">Capacity allocated</span>
              <span className="tabular font-bold text-foreground">{round.allocatedPct}%</span>
            </div>
            <ProgressBar
              value={round.allocatedPct}
              tone={round.status === "SOLD_OUT" ? "neutral" : round.allocatedPct >= 80 ? "warning" : "success"}
              className="mt-2"
              label="Capacity allocated"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {round.status === "SOLD_OUT"
                ? `Fully subscribed — ${pluralize(round.totalSlots, "slot")}`
                : round.status === "SCHEDULED"
                  ? `Opens ${formatDate(round.opensAt)} · ${pluralize(round.totalSlots, "slot")}`
                  : `${pluralize(round.availableSlots, "slot")} of ${pluralize(round.totalSlots, "slot")} available`}
            </p>
          </div>
          {investable ? (
            <Button size="lg" className="mt-6 w-full sm:w-auto" asChild>
              <a href={appLinks.getStarted}>Get started to invest</a>
            </Button>
          ) : (
            <p className="mt-6 rounded-lg border border-border bg-surface-subtle px-4 py-3 text-sm text-muted-foreground">
              {round.status === "SCHEDULED"
                ? `This round opens ${formatDate(round.opensAt)}.`
                : "This round is fully subscribed."}{" "}
              <a href={appLinks.getStarted} className="font-bold text-primary hover:underline">
                Create an account
              </a>{" "}
              to hear about the next one.
            </p>
          )}
        </div>
      </div>

      {/* Three figures */}
      <section aria-label="One slot, shown separately" className="mt-14">
        <h2 className="font-display text-2xl tracking-tight text-foreground">One slot, shown separately</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Principal, expected profit and maturity value are never merged into one number.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
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
        <p className="mt-3 text-xs text-muted-foreground">
          {formatBps(plan.roiBps)} expected return over {formatDuration(plan.duration)}. Expected, not guaranteed.
        </p>
      </section>

      <div className="mt-14 grid gap-12 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="flex min-w-0 flex-col gap-12">
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
          </Section>

          <Section title="How returns are funded">
            <div className="rounded-lg bg-surface-subtle p-4">
              <p className="text-sm text-foreground">{property.revenueModel}</p>
            </div>
          </Section>

          <Section title="Plan terms">
            <div className="financial-card px-5 py-2">
              {planRows.map(([label, value]) => (
                <DataRow key={label} label={label} value={value} />
              ))}
            </div>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-foreground">
              {plan.terms.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </Section>

          <Section title="Risk disclosures">
            <ul className="space-y-2.5">
              {plan.riskDisclosures.map((r) => (
                <li key={r} className="rounded-lg border border-warning-border bg-warning-soft px-4 py-3 text-sm text-foreground">
                  {r}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Property proof">
            <p className="text-xs text-muted-foreground">
              Documents are fictional examples — each carries a reviewer, date and version.
            </p>
            <div className="financial-card overflow-x-auto">
              <table className="w-full min-w-[38rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th scope="col" className="px-4 py-3 font-semibold">Document</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Type</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Reviewer</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Reviewed</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Version</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {property.proofDocuments.map((doc) => (
                    <tr key={doc.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground">{doc.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{doc.summary}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {humanizeStatus(doc.type)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{doc.reviewedBy}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {formatDate(doc.reviewedAt)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{doc.version}</td>
                      <td className="px-4 py-3">
                        <StatusPill tone={proofStatusTone[doc.status]}>{humanizeStatus(doc.status)}</StatusPill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {property.updates.length > 0 ? (
            <Section title="Updates">
              <ol className="flex flex-col gap-5 border-l-2 border-border pl-5">
                {property.updates.map((u) => (
                  <li key={u.id}>
                    <p className="text-sm font-bold text-foreground">{u.title}</p>
                    <p className="mt-0.5 text-xs text-tertiary">{formatDate(u.publishedAt)}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{u.body}</p>
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}
        </div>

        {/* Aside */}
        <aside className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
          <div className="financial-card p-6">
            <p className="eyebrow text-muted-foreground">Operator</p>
            <h2 className="mt-2 text-base font-extrabold text-foreground">{property.operator.name}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{property.operator.description}</p>
          </div>

          <div className="financial-card p-6">
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
            <h2 className="mt-3 text-base font-extrabold text-foreground">Invest in Round {round.roundNumber}</h2>
            <DataRow label="Slot price" value={formatMoney(plan.slotPrice, plan.currency)} />
            <DataRow label="Expected return" value={formatBps(plan.roiBps)} />
            <DataRow label="Duration" value={formatDuration(plan.duration)} />
            <DataRow label="Minimum" value={pluralize(plan.minSlots, "slot")} />
            <div className="mt-4 rounded-md bg-surface-subtle p-4">
              <p className="text-[11px] font-semibold text-muted-foreground">Maturity value per slot</p>
              <MoneyFigure amount={perSlot.maturityValue} currency={plan.currency} size="md" className="mt-1" />
            </div>
            {investable ? (
              <Button size="lg" className="mt-5 w-full" asChild>
                <a href={appLinks.getStarted}>Get started to invest</a>
              </Button>
            ) : (
              <Button size="lg" className="mt-5 w-full" disabled>
                {round.status === "SCHEDULED" ? `Opens ${formatDate(round.opensAt)}` : "Fully subscribed"}
              </Button>
            )}
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Accounts and investing live in the RentBrown app. Expected, not guaranteed.
            </p>
          </div>
        </aside>
      </div>

      <div className="mt-16">
        <CtaBand />
      </div>
    </article>
  );
}
