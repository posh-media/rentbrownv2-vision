"use client";

import Link from "next/link";
import { Button, StatePanel } from "@rentbrown/ui";

import { useContent } from "../../../lib/data/hooks";
import { PageHeader } from "../../../components/layout/page-header";
import { PageSkeleton } from "../../../components/layout/page-skeleton";

export default function HowItWorksPage() {
  const content = useContent();

  if (content.isPending) return <PageSkeleton />;
  if (content.isError || !content.data) {
    return (
      <StatePanel
        tone="error"
        title="We couldn't load this page"
        copy={content.error?.message}
        action={
          <Button variant="outline" size="sm" onClick={() => content.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="How it works"
        title="Investing, step by step"
        copy="From discovering a round to seeing principal and profit settle in your wallet."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {content.data.howItWorks.map((s) => (
          <div key={s.step} className="financial-card p-5 sm:p-6">
            <p className="eyebrow text-secondary">{s.step}</p>
            <h2 className="mt-2 text-lg font-extrabold text-foreground">{s.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/explore">Explore opportunities</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/faq">Read the FAQ</Link>
        </Button>
      </div>
    </div>
  );
}
