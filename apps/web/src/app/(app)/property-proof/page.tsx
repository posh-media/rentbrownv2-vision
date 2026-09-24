"use client";

import Link from "next/link";
import { Button, StatePanel } from "@rentbrown/ui";
import { FileCheck2 } from "lucide-react";

import { useContent } from "../../../lib/data/hooks";
import { PageHeader } from "../../../components/layout/page-header";
import { PageSkeleton } from "../../../components/layout/page-skeleton";

export default function PropertyProofPage() {
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
        eyebrow="Property proof"
        title="Evidence before commitment"
        copy="Every opportunity carries reviewed documents — with reviewer, date and version — so you can see the evidence behind the numbers."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {content.data.trustPillars.map((p) => (
          <div key={p.title} className="financial-card p-5 sm:p-6">
            <span className="flex size-9 items-center justify-center rounded-md bg-secondary-soft text-primary">
              <FileCheck2 className="size-4.5" aria-hidden />
            </span>
            <h2 className="mt-3 text-base font-extrabold text-foreground">{p.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{p.body}</p>
          </div>
        ))}
      </div>
      <StatePanel
        tone="info"
        title="Fictional examples"
        copy="Documents shown in this prototype are fictional examples with a reviewer, date and version — the same structure production documents will use."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/explore">See them on an opportunity</Link>
          </Button>
        }
      />
    </div>
  );
}
