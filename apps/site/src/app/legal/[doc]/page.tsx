import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { formatDate } from "@rentbrown/utils";

import { catalogue } from "../../../lib/site";

export function generateStaticParams() {
  return [{ doc: "terms" }, { doc: "privacy" }, { doc: "risk" }];
}

async function getDoc(id: string) {
  const content = await catalogue.getContent();
  return content.legal.find((d) => d.id === id) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params;
  const document = await getDoc(doc);
  if (!document) return { title: "Document not found" };
  return {
    title: document.title,
    description: document.summary,
    alternates: { canonical: `/legal/${doc}` },
  };
}

export default async function LegalDocPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const content = await catalogue.getContent();
  const document = content.legal.find((d) => d.id === doc);
  if (!document) notFound();

  const siblings = content.legal.filter((d) => d.id !== doc);

  return (
    <article className="rb-container py-12 sm:py-16">
      <Link href="/trust" className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">
        <ChevronLeft className="size-4" aria-hidden /> Trust & transparency
      </Link>

      <header className="mt-8 max-w-2xl border-b border-border pb-8">
        <p className="eyebrow text-secondary">Legal</p>
        <h1 className="mt-3 font-display text-4xl leading-[1.1] tracking-tight text-foreground sm:text-5xl">
          {document.title}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{document.summary}</p>
        <p className="mt-4 text-xs font-semibold text-tertiary">
          {document.version} · Effective {formatDate(document.effectiveAt, "long")}
        </p>
      </header>

      <div className="mt-10 max-w-2xl space-y-10">
        {document.sections.map((section, i) => (
          <section key={section.heading} aria-label={section.heading}>
            <h2 className="text-lg font-extrabold text-foreground">
              <span className="tabular mr-2 text-secondary">{i + 1}.</span>
              {section.heading}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-foreground/90">{section.body}</p>
          </section>
        ))}
      </div>

      <nav aria-label="Other legal documents" className="mt-14 border-t border-border pt-8">
        <p className="eyebrow text-secondary">Related documents</p>
        <ul className="mt-4 flex flex-wrap gap-3">
          {siblings.map((d) => (
            <li key={d.id}>
              <Link
                href={`/legal/${d.id}`}
                className="financial-card inline-block px-4 py-2.5 text-sm font-bold text-primary transition-shadow hover:shadow-md"
              >
                {d.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </article>
  );
}
