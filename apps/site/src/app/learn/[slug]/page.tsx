import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock } from "lucide-react";
import { siteContent } from "@rentbrown/mock-data";

import { CtaBand } from "../../../components/cta-band";

const CATEGORY_LABELS: Record<siteContent.LearnArticle["category"], string> = {
  CONCEPTS: "Concepts",
  PLATFORM: "Platform",
  PROPERTY: "Property",
  GLOSSARY: "Glossary",
};

export function generateStaticParams() {
  return siteContent.learnArticles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = siteContent.learnArticles.find((a) => a.slug === slug);
  if (!article) return { title: "Article not found" };
  return {
    title: article.title,
    description: article.excerpt,
    alternates: { canonical: `/learn/${slug}` },
    openGraph: { title: article.title, description: article.excerpt, type: "article" },
  };
}

export default async function LearnArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = siteContent.learnArticles.find((a) => a.slug === slug);
  if (!article) notFound();

  const related = siteContent.learnArticles.filter((a) => a.slug !== slug).slice(0, 3);

  return (
    <article className="rb-container py-12 sm:py-16">
      <Link href="/learn" className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">
        <ChevronLeft className="size-4" aria-hidden /> Back to Learn
      </Link>

      <header className="mt-8 max-w-2xl">
        <p className="eyebrow text-secondary">
          {CATEGORY_LABELS[article.category]} · {article.readMinutes} min read
        </p>
        <h1 className="mt-4 font-display text-4xl leading-[1.1] tracking-tight text-foreground sm:text-5xl">
          {article.title}
        </h1>
        <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">{article.excerpt}</p>
        <p className="mt-4 flex items-center gap-1.5 text-xs text-tertiary">
          <Clock className="size-3.5" aria-hidden /> Fictional prototype content for design review.
        </p>
      </header>

      <div className="mt-12 max-w-2xl space-y-10">
        {article.body.map((section) => (
          <section key={section.heading} aria-label={section.heading}>
            <h2 className="font-display text-2xl tracking-tight text-foreground">{section.heading}</h2>
            {section.paragraphs.map((p, i) => (
              <p key={i} className="mt-4 text-base leading-relaxed text-foreground/90">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>

      {related.length > 0 ? (
        <nav aria-label="More articles" className="mt-16 border-t border-border pt-10">
          <p className="eyebrow text-secondary">Keep reading</p>
          <ul className="mt-5 grid gap-4 sm:grid-cols-3">
            {related.map((a) => (
              <li key={a.slug}>
                <Link
                  href={`/learn/${a.slug}`}
                  className="financial-card block h-full p-5 transition-shadow hover:shadow-md"
                >
                  <p className="text-xs font-semibold text-muted-foreground">{a.readMinutes} min read</p>
                  <p className="mt-2 font-display text-lg leading-snug tracking-tight text-foreground">{a.title}</p>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <div className="mt-16">
        <CtaBand />
      </div>
    </article>
  );
}
