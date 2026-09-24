"use client";

import * as React from "react";
import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  StatePanel,
  cn,
} from "@rentbrown/ui";
import type { FaqItem } from "@rentbrown/types";
import { humanizeStatus } from "@rentbrown/utils";

import { useContent } from "../../../lib/data/hooks";
import { PageHeader } from "../../../components/layout/page-header";
import { PageSkeleton } from "../../../components/layout/page-skeleton";

const CATEGORIES: Array<FaqItem["category"] | "ALL"> = ["ALL", "BASICS", "INVESTING", "WALLET", "SECURITY", "REFERRALS"];

export default function FaqPage() {
  const content = useContent();
  const [category, setCategory] = React.useState<FaqItem["category"] | "ALL">("ALL");

  if (content.isPending) return <PageSkeleton />;
  if (content.isError || !content.data) {
    return (
      <StatePanel
        tone="error"
        title="We couldn't load the FAQ"
        copy={content.error?.message}
        action={
          <Button variant="outline" size="sm" onClick={() => content.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const items = content.data.faqs.filter((f) => category === "ALL" || f.category === category);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader eyebrow="FAQ" title="Questions, answered plainly" copy="Short answers about slots, returns, the wallet and verification." />

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              "min-h-9 rounded-full border px-3.5 text-xs font-bold",
              category === c
                ? "border-primary bg-accent text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {c === "ALL" ? "All" : humanizeStatus(c)}
          </button>
        ))}
      </div>

      <div className="financial-card px-5">
        <Accordion type="single" collapsible>
          {items.map((f) => (
            <AccordionItem key={f.id} value={f.id}>
              <AccordionTrigger>{f.question}</AccordionTrigger>
              <AccordionContent>{f.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      <StatePanel
        tone="info"
        title="Still curious?"
        copy="See the legal documents for how terms, privacy and risk disclosures will be structured."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/legal/risk">Risk disclosure</Link>
          </Button>
        }
      />
    </div>
  );
}
