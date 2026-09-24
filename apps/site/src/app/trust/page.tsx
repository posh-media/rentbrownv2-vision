import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { siteContent } from "@rentbrown/mock-data";
import type { ProofDocumentType } from "@rentbrown/types";

import { CtaBand } from "../../components/cta-band";
import { SectionHeading } from "../../components/section-heading";
import { catalogue } from "../../lib/site";

export const metadata: Metadata = {
  title: "Trust & transparency",
  description:
    "How RentBrown presents evidence: reviewed property documents with dates and versions, honest availability, qualified language — and what this prototype does not claim.",
  alternates: { canonical: "/trust" },
};

/** What each proof-document type is meant to establish. */
const PROOF_TYPES: Array<{ type: ProofDocumentType; label: string; body: string }> = [
  { type: "TITLE", label: "Title summary", body: "A summary of the registered title and encumbrance search for the parcel — who owns it, and what sits against it." },
  { type: "VALUATION", label: "Independent valuation", body: "An open-market valuation prepared by an estate surveyor, so the figures can be checked against a third-party view." },
  { type: "INSPECTION", label: "Inspection report", body: "A dated inspection covering condition, occupancy and facilities — with a version that shows when it was last refreshed." },
  { type: "COST_SCHEDULE", label: "Cost schedule", body: "For development rounds: a quantity surveyor's breakdown of remaining works and contingency." },
  { type: "INSURANCE", label: "Insurance schedule", body: "A summary of building and liability cover in place, where applicable." },
  { type: "LEGAL_OPINION", label: "Legal opinion", body: "An opinion on the structures behind the round — pre-sale agreements, escrow arrangements, and so on." },
  { type: "OPERATOR_AGREEMENT", label: "Operator agreement", body: "The agreement between the issuer and the property operator — fees, responsibilities and reserve arrangements." },
];

const NO_CLAIMS = [
  "This prototype makes no regulatory claims of any kind. Production claims will be stated only when verified.",
  "Returns are always described as expected, never guaranteed. Settlement depends on the issuer meeting its obligations.",
  "No property, figure, document, person or record shown is real — everything is fictional fixture data.",
  "There is no insurance promise, no deposit protection scheme and no principal guarantee in this design.",
  "No licence, registration or approval is implied anywhere in the product.",
];

export default async function TrustPage() {
  const content = await catalogue.getContent();
  const { siteTrust } = siteContent;

  return (
    <>
      <section aria-label="Trust and transparency" className="band-inverse">
        <div className="rb-container py-16 sm:py-24">
          <div className="max-w-3xl">
            <p className="eyebrow text-primary-foreground/60">{siteTrust.eyebrow}</p>
            <h1 className="mt-4 font-display text-4xl leading-[1.08] tracking-tight sm:text-5xl">{siteTrust.title}</h1>
            <p className="mt-6 text-base leading-relaxed text-primary-foreground/75 sm:text-lg">{siteTrust.body}</p>
          </div>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {siteTrust.points.map((p) => (
              <div key={p.title} className="border-l-2 border-primary-foreground/25 pl-5">
                <h2 className="text-base font-extrabold">{p.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-primary-foreground/75">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How evidence works */}
      <section aria-label="How evidence works" className="rb-container py-16 sm:py-20">
        <SectionHeading
          eyebrow="Property proof"
          title="How the evidence works"
          body="Every opportunity links to the documents behind its property. Each document shows its type, its reviewer, the date it was reviewed and a version — so you can see what was checked and when."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROOF_TYPES.map((t) => (
            <div key={t.type} className="financial-card p-5">
              <div className="flex items-center gap-2.5">
                <FileText className="size-4 text-secondary" aria-hidden />
                <h2 className="text-sm font-extrabold text-foreground">{t.label}</h2>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{t.body}</p>
            </div>
          ))}
          <div className="financial-card flex flex-col justify-center bg-surface-subtle p-5">
            <p className="text-sm leading-relaxed text-foreground">
              See it in action — every opportunity page carries its full proof table.
            </p>
            <Link
              href="/explore/the-terraces-ikoyi"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-extrabold text-primary hover:underline"
            >
              View a proof table <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* Legal documents */}
      <section aria-label="Legal documents" className="border-y border-border bg-surface-subtle py-16 sm:py-20">
        <div className="rb-container">
          <SectionHeading
            eyebrow="Legal"
            title="The documents behind the product"
            body="Versioned, dated and written to be read — not hidden in a footer."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {content.legal.map((doc) => (
              <Link
                key={doc.id}
                href={`/legal/${doc.id}`}
                className="financial-card group flex flex-col p-6 transition-shadow hover:shadow-md"
              >
                <p className="eyebrow text-secondary">{doc.version}</p>
                <h2 className="mt-3 font-display text-xl tracking-tight text-foreground">{doc.title}</h2>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{doc.summary}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-extrabold text-primary group-hover:underline">
                  Read document <ArrowRight className="size-4" aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* What we don't claim */}
      <section aria-label="What we do not claim" className="rb-container py-16 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHeading
            eyebrow="Honesty, in writing"
            title="What we don't claim"
            body="A marketing site is the easiest place to overstate. So here is the opposite list — kept deliberately visible."
          />
          <ul className="space-y-3">
            {NO_CLAIMS.map((c) => (
              <li key={c} className="financial-card flex gap-3 p-4">
                <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-warning-dot" />
                <p className="text-sm leading-relaxed text-foreground">{c}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="rb-container pb-4">
        <CtaBand />
      </div>
    </>
  );
}
