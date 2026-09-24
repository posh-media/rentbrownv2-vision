"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, EmptyState, StatePanel, StatusPill } from "@rentbrown/ui";
import { formatDate } from "@rentbrown/utils";

import { useContent } from "../../../../lib/data/hooks";
import { PageHeader } from "../../../../components/layout/page-header";
import { PageSkeleton } from "../../../../components/layout/page-skeleton";

export default function LegalDocPage() {
  const { doc } = useParams<{ doc: string }>();
  const content = useContent();

  if (content.isPending) return <PageSkeleton />;

  if (content.isError || !content.data) {
    return (
      <StatePanel
        tone="error"
        title="We couldn't load this document"
        copy={content.error?.message}
        action={
          <Button variant="outline" size="sm" onClick={() => content.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const document = content.data.legal.find((d) => d.id === doc);
  if (!document) {
    return (
      <EmptyState
        title="Document not found"
        copy="Available documents: terms, privacy and risk."
        action={
          <Button variant="outline" asChild>
            <Link href="/legal/terms">Terms of service</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_16rem]">
      <div className="min-w-0">
        <PageHeader
          eyebrow="Legal"
          title={document.title}
          actions={
            <div className="flex gap-1.5">
              <StatusPill tone="neutral">{document.version}</StatusPill>
              <StatusPill tone="neutral">Effective {formatDate(document.effectiveAt)}</StatusPill>
            </div>
          }
        />
        <StatePanel tone="info" title="Summary" copy={document.summary} className="mt-6" />
        <div className="mt-8 flex flex-col gap-8">
          {document.sections.map((s, i) => (
            <section key={s.heading} id={`section-${i}`}>
              <h2 className="text-lg font-extrabold text-foreground">{s.heading}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{s.body}</p>
            </section>
          ))}
        </div>
        <nav aria-label="Legal documents" className="mt-10 flex flex-wrap gap-2">
          {content.data.legal.map((d) => (
            <Button key={d.id} variant={d.id === doc ? "primary" : "outline"} size="sm" asChild>
              <Link href={`/legal/${d.id}`}>{d.title}</Link>
            </Button>
          ))}
        </nav>
      </div>
      <aside className="hidden lg:block">
        <div className="sticky top-24">
          <p className="eyebrow mb-3 text-muted-foreground">On this page</p>
          <ul className="flex flex-col gap-2">
            {document.sections.map((s, i) => (
              <li key={s.heading}>
                <a href={`#section-${i}`} className="text-sm font-semibold text-muted-foreground hover:text-foreground">
                  {s.heading}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
