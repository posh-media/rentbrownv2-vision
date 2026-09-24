import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { siteContent } from "@rentbrown/mock-data";

type LearnArticle = siteContent.LearnArticle;

import { SectionHeading } from "../../components/section-heading";

export const metadata: Metadata = {
  title: "Learn",
  description:
    "Short, plain-language reads on slots, plans, rounds, wallet balances and risk disclosures — the concepts behind every RentBrown screen.",
  alternates: { canonical: "/learn" },
};

const CATEGORY_LABELS: Record<LearnArticle["category"], string> = {
  CONCEPTS: "Concepts",
  PLATFORM: "Platform",
  PROPERTY: "Property",
  GLOSSARY: "Glossary",
};

const CATEGORY_ORDER: LearnArticle["category"][] = ["CONCEPTS", "PLATFORM", "PROPERTY", "GLOSSARY"];

export default function LearnPage() {
  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    articles: siteContent.learnArticles.filter((a) => a.category === cat),
  })).filter((g) => g.articles.length > 0);

  return (
    <section aria-label="Learn" className="rb-container py-14 sm:py-16">
      <SectionHeading
        as="h1"
        eyebrow="Learn"
        title="Understand the structure before the slot"
        body="Everything on RentBrown is built from a few ideas. These articles explain each one in plain language."
      />

      <div className="mt-12 flex flex-col gap-14">
        {grouped.map(({ cat, articles }) => (
          <section key={cat} aria-label={CATEGORY_LABELS[cat]}>
            <h2 className="eyebrow text-secondary">{CATEGORY_LABELS[cat]}</h2>
            <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {articles.map((a) => (
                <article key={a.slug} className="financial-card flex h-full flex-col p-6">
                  <p className="text-xs font-semibold text-muted-foreground">{a.readMinutes} min read</p>
                  <h3 className="mt-2 font-display text-xl leading-snug tracking-tight text-foreground">{a.title}</h3>
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
          </section>
        ))}
      </div>
    </section>
  );
}
