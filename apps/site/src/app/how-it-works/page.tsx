import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { MoneyFigure } from "@rentbrown/ui";
import { siteContent } from "@rentbrown/mock-data";
import { formatBps, formatDuration, formatMoney } from "@rentbrown/utils";

import { CtaBand } from "../../components/cta-band";
import { SectionHeading } from "../../components/section-heading";
import { catalogue, propertyImage } from "../../lib/site";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Six steps from creating an account to receiving proceeds at maturity — plus a worked, illustrative example of what one slot buys.",
  alternates: { canonical: "/how-it-works" },
};

const STEP_IMAGES = ["ikoyi-residences", "lekki-courts", "wuse-square"];

export default async function HowItWorksPage() {
  // A real published plan powers the worked example — nothing hand-computed.
  const example = await catalogue.getOpportunity("the-terraces-ikoyi");
  const steps = siteContent.siteHowItWorks;

  return (
    <>
      <section aria-label="How it works" className="hero-wash border-b border-border">
        <div className="rb-container py-16 sm:py-20">
          <SectionHeading
            as="h1"
            eyebrow="How it works"
            title="From sign-up to settlement, in six steps"
            body="Every RentBrown investment follows the same path. Terms, fees and risk disclosures sit in front of the pay button — never behind it."
          />
        </div>
      </section>

      {/* Steps — alternating image / text rows */}
      <section aria-label="The six steps" className="rb-container py-16 sm:py-20">
        <ol className="flex flex-col gap-14">
          {steps.map((step, i) => {
            const flip = i % 2 === 1;
            return (
              <li
                key={step.step}
                className="grid items-center gap-8 md:grid-cols-[0.9fr_1.1fr] md:gap-12"
              >
                <div className={flip ? "md:order-2" : ""}>
                  <div className="overflow-hidden rounded-2xl border border-border shadow-md">
                    <Image
                      src={propertyImage(STEP_IMAGES[i % STEP_IMAGES.length] ?? "ikoyi-residences")}
                      alt={`Illustrative photograph — fictional property, step ${step.step}`}
                      width={640}
                      height={400}
                      sizes="(min-width: 768px) 40vw, 100vw"
                      className="aspect-[16/10] w-full object-cover"
                    />
                  </div>
                </div>
                <div className={flip ? "md:order-1" : ""}>
                  <p className="font-display text-5xl text-secondary">{step.step}</p>
                  <h2 className="mt-4 font-display text-2xl tracking-tight text-foreground sm:text-3xl">
                    {step.title}
                  </h2>
                  <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">{step.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Worked example */}
      {example ? (
        <section aria-label="What a slot buys you" className="border-y border-border bg-surface-subtle py-16 sm:py-20">
          <div className="rb-container">
            <SectionHeading
              eyebrow="A worked example"
              title="What one slot buys you"
              body={`Using the published terms of ${example.property.name}, Round ${example.round.roundNumber} — ${example.plan.name}. Illustrative only; expected returns are not guaranteed.`}
            />
            <div className="financial-card mt-10 p-6 sm:p-8">
              <div className="grid gap-6 sm:grid-cols-3">
                <div>
                  <p className="eyebrow text-muted-foreground">You commit</p>
                  <MoneyFigure amount={example.perSlot.principal} currency={example.plan.currency} size="lg" className="mt-3" />
                  <p className="mt-2 text-xs text-muted-foreground">Principal per slot — allocated for the full term.</p>
                </div>
                <div>
                  <p className="eyebrow text-muted-foreground">The plan expects</p>
                  <p className="tabular mt-3 text-[1.875rem] font-extrabold leading-[2.25rem] text-[var(--success-fg)]">
                    +{formatMoney(example.perSlot.expectedProfit, example.plan.currency)}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatBps(example.plan.roiBps)} expected return over {formatDuration(example.plan.duration)} — full
                    term, not per month.
                  </p>
                </div>
                <div>
                  <p className="eyebrow text-muted-foreground">Expected to settle</p>
                  <MoneyFigure
                    amount={example.perSlot.maturityValue}
                    currency={example.plan.currency}
                    size="lg"
                    className="mt-3"
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Maturity value per slot — principal plus expected profit, credited at settlement.
                  </p>
                </div>
              </div>
              <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-lg bg-surface-subtle p-4">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Illustrative example based on fictional prototype data. Settlement depends on the issuer meeting its
                  obligations — review the risk disclosures on every opportunity.
                </p>
                <Link
                  href={`/explore/${example.property.slug}`}
                  className="inline-flex items-center gap-1.5 text-sm font-extrabold text-primary hover:underline"
                >
                  See this opportunity <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="rb-container py-16 sm:py-20">
        <CtaBand title="Ready to look at real terms?" body="Browse open and upcoming rounds — every figure, term and document is on the page." />
      </div>
    </>
  );
}
