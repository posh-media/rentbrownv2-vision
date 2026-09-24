import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Eye, FileCheck, Layers, Wallet } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  MoneyFigure,
  ProgressBar,
} from "@rentbrown/ui";
import { siteContent } from "@rentbrown/mock-data";
import { formatBps, formatDuration, formatMoney, pluralize } from "@rentbrown/utils";

import { OpportunityCard } from "../components/opportunity-card";
import { SectionHeading } from "../components/section-heading";
import { CtaBand } from "../components/cta-band";
import { catalogue, propertyImage } from "../lib/site";

export const metadata: Metadata = {
  title: "Property-backed investing, clearly structured",
  alternates: { canonical: "/" },
};

const DIFFERENTIATOR_ICONS = [Layers, FileCheck, Wallet, Eye];

export default async function HomePage() {
  const [heroOpportunity, opportunities, content] = await Promise.all([
    catalogue.getOpportunity("the-terraces-ikoyi"),
    catalogue.listOpportunities(),
    catalogue.getContent(),
  ]);

  const hero = siteContent.siteHero;
  const featured = opportunities.slice(0, 3);
  const faqs = content.faqs.slice(0, 4);
  const articles = siteContent.learnArticles.slice(0, 3);
  const { siteHowItWorks, siteDifferentiators, siteTrust, siteReferral } = siteContent;

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section aria-label="Introduction" className="hero-wash border-b border-border">
        <div className="rb-container grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div>
            <p className="reveal eyebrow text-secondary">{hero.eyebrow}</p>
            <h1 className="reveal reveal-1 mt-4 font-display text-4xl leading-[1.08] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              {hero.headline}
            </h1>
            <p className="reveal reveal-2 mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {hero.subline}
            </p>
            <div className="reveal reveal-3 mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" asChild>
                <Link href={hero.primaryCta.href}>{hero.primaryCta.label}</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href={hero.secondaryCta.href}>
                  {hero.secondaryCta.label} <ArrowRight aria-hidden />
                </Link>
              </Button>
            </div>
            <p className="reveal reveal-3 mt-5 max-w-md text-xs leading-relaxed text-muted-foreground">
              {hero.footnote}
            </p>
          </div>

          {/* Layered composition: property card + floating glass figures */}
          {heroOpportunity ? (
            <div className="reveal reveal-2 relative mx-auto w-full max-w-lg lg:max-w-none">
              <div className="overflow-hidden rounded-2xl border border-border shadow-lg">
                <Image
                  src={propertyImage(heroOpportunity.property.images[0] ?? "ikoyi-residences")}
                  alt={`${heroOpportunity.property.name}, ${heroOpportunity.property.location.label} — fictional property`}
                  width={720}
                  height={470}
                  priority
                  sizes="(min-width: 1024px) 45vw, 100vw"
                  className="aspect-[16/11] w-full object-cover"
                />
              </div>

              {/* Floating per-slot card */}
              <div className="glass-strong absolute -bottom-8 left-4 w-64 rounded-xl p-4 sm:left-8">
                <p className="eyebrow text-secondary">Per slot · {heroOpportunity.property.name}</p>
                <MoneyFigure
                  amount={heroOpportunity.perSlot.principal}
                  currency={heroOpportunity.plan.currency}
                  size="lg"
                  className="mt-2"
                />
                <dl className="mt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Expected · {formatDuration(heroOpportunity.plan.duration)}</dt>
                    <dd className="tabular font-bold text-foreground">{formatBps(heroOpportunity.plan.roiBps)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-border pt-1.5">
                    <dt className="text-muted-foreground">Maturity value</dt>
                    <dd className="tabular font-bold text-foreground">
                      {formatMoney(heroOpportunity.perSlot.maturityValue, heroOpportunity.plan.currency)}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Floating capacity chip */}
              <div className="glass absolute -top-5 right-4 w-52 rounded-xl p-3.5 sm:right-8">
                <div className="flex items-baseline justify-between text-[11px] font-semibold">
                  <span className="text-muted-foreground">Round {heroOpportunity.round.roundNumber} allocated</span>
                  <span className="tabular text-foreground">{heroOpportunity.round.allocatedPct}%</span>
                </div>
                <ProgressBar
                  value={heroOpportunity.round.allocatedPct}
                  tone="success"
                  size="sm"
                  className="mt-2"
                  label="Round capacity allocated"
                />
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {pluralize(heroOpportunity.round.allocatedSlots, "slot")} of{" "}
                  {pluralize(heroOpportunity.round.totalSlots, "slot")}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section aria-label="How it works" className="rb-container py-20 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeading
            eyebrow="How it works"
            title="Six steps, nothing hidden"
            body="From account to settlement, the product shows you what your money is doing at every stage."
          />
          <Button variant="outline" asChild>
            <Link href="/how-it-works">
              See the detail <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {siteHowItWorks.map((step) => (
            <li key={step.step} className="financial-card p-6">
              <p className="font-display text-3xl text-secondary">{step.step}</p>
              <h3 className="mt-4 text-base font-extrabold text-foreground">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Featured opportunities ───────────────────────────────────────── */}
      <section aria-label="Featured opportunities" className="border-y border-border bg-surface-subtle py-20 sm:py-24">
        <div className="rb-container">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading
              eyebrow="Opportunities"
              title="Open and upcoming rounds"
              body="Every round states its slot price, expected full-term return, duration and capacity — with the property evidence attached."
            />
            <Button variant="outline" asChild>
              <Link href="/explore">
                View all {opportunities.length} <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((o) => (
              <OpportunityCard key={o.round.id} opportunity={o} />
            ))}
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            Preview data — all properties and figures are fictional. Expected returns are not guaranteed.
          </p>
        </div>
      </section>

      {/* ── Differentiators ──────────────────────────────────────────────── */}
      <section aria-label="Why RentBrown" className="rb-container py-20 sm:py-24">
        <SectionHeading
          eyebrow="Why RentBrown"
          title="Designed to be audited by its own users"
          body="Four habits that shape every screen — so you can check the numbers instead of trusting the marketing."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {siteDifferentiators.map((d, i) => {
            const Icon = DIFFERENTIATOR_ICONS[i % DIFFERENTIATOR_ICONS.length] ?? Layers;
            return (
              <div key={d.title} className="financial-card flex gap-4 p-6">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-foreground">{d.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Trust band ───────────────────────────────────────────────────── */}
      <section aria-label="Trust and transparency" className="band-inverse py-20 sm:py-24">
        <div className="rb-container">
          <SectionHeading inverse eyebrow={siteTrust.eyebrow} title={siteTrust.title} body={siteTrust.body} />
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {siteTrust.points.map((p) => (
              <div key={p.title} className="border-l-2 border-primary-foreground/25 pl-5">
                <h3 className="text-base font-extrabold">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-primary-foreground/75">{p.body}</p>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            asChild
            className="mt-10 border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
          >
            <Link href="/trust">
              How transparency works <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </section>

      {/* ── Referral band ────────────────────────────────────────────────── */}
      <section aria-label="Referrals" className="rb-container py-20 sm:py-24">
        <div className="financial-card grid items-center gap-8 p-8 sm:p-10 lg:grid-cols-[1.4fr_0.6fr]">
          <div>
            <p className="eyebrow text-secondary">{siteReferral.eyebrow}</p>
            <h2 className="mt-3 font-display text-3xl leading-tight tracking-tight text-foreground sm:text-4xl">
              {siteReferral.title}
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">{siteReferral.body}</p>
            <p className="mt-3 text-xs text-tertiary">{siteReferral.footnote}</p>
          </div>
          <div className="flex lg:justify-end">
            <Button size="lg" variant="outline" asChild>
              <Link href="/faq">
                How rewards qualify <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Learn teaser ─────────────────────────────────────────────────── */}
      <section aria-label="Learn" className="border-y border-border bg-surface-subtle py-20 sm:py-24">
        <div className="rb-container">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading
              eyebrow="Learn"
              title="Understand the structure before the slot"
              body="Short, plain-language reads on how slots, rounds, plans and wallet balances actually work."
            />
            <Button variant="outline" asChild>
              <Link href="/learn">
                All articles <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((a) => (
              <article key={a.slug} className="financial-card flex h-full flex-col p-6">
                <p className="eyebrow text-secondary">
                  {a.category.charAt(0) + a.category.slice(1).toLowerCase()} · {a.readMinutes} min read
                </p>
                <h3 className="mt-3 font-display text-xl leading-snug tracking-tight text-foreground">{a.title}</h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{a.excerpt}</p>
                <Link
                  href={`/learn/${a.slug}`}
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-extrabold text-primary hover:underline"
                >
                  Read article <ArrowRight className="size-4" aria-hidden />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ teaser ───────────────────────────────────────────────────── */}
      <section aria-label="Frequently asked questions" className="rb-container py-20 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <SectionHeading
              eyebrow="FAQ"
              title="Straight answers"
              body="The questions people actually ask before their first slot."
            />
            <Button variant="outline" asChild className="mt-6">
              <Link href="/faq">
                All questions <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
          <div className="financial-card px-6">
            <Accordion type="single" collapsible>
              {faqs.map((f) => (
                <AccordionItem key={f.id} value={f.id}>
                  <AccordionTrigger>{f.question}</AccordionTrigger>
                  <AccordionContent>{f.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <div className="rb-container pb-4">
        <CtaBand id="get-started" />
      </div>
    </>
  );
}
