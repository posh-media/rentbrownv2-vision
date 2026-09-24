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

const CATEGORIES: Array<FaqItem["category"] | "ALL"> = ["ALL", "BASICS", "INVESTING", "WALLET", "SECURITY", "REFERRALS"];

export function FaqView({ faqs }: { faqs: FaqItem[] }) {
  const [category, setCategory] = React.useState<FaqItem["category"] | "ALL">("ALL");
  const items = faqs.filter((f) => category === "ALL" || f.category === category);

  return (
    <>
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
    </>
  );
}
