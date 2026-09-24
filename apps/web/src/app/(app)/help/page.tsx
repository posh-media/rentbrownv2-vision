"use client";

import * as React from "react";
import {
  Button,
  EmptyState,
  Input,
  StatePanel,
  cn,
  toast,
} from "@rentbrown/ui";
import { BookOpen, Search } from "lucide-react";
import type { HelpArticle } from "@rentbrown/types";
import { humanizeStatus } from "@rentbrown/utils";

import { useContent } from "../../../lib/data/hooks";
import { PageHeader } from "../../../components/layout/page-header";
import { PageSkeleton } from "../../../components/layout/page-skeleton";

const CATEGORIES: Array<{ value: HelpArticle["category"] | "ALL"; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "GETTING_STARTED", label: "Getting started" },
  { value: "INVESTING", label: "Investing" },
  { value: "WALLET", label: "Wallet" },
  { value: "SECURITY", label: "Security" },
  { value: "REFERRALS", label: "Referrals" },
];

export default function HelpPage() {
  const content = useContent();
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<HelpArticle["category"] | "ALL">("ALL");

  if (content.isPending) return <PageSkeleton />;

  if (content.isError || !content.data) {
    return (
      <StatePanel
        tone="error"
        title="We couldn't load help articles"
        copy={content.error?.message}
        action={
          <Button variant="outline" size="sm" onClick={() => content.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const items = content.data.help.filter(
    (a) =>
      (category === "ALL" || a.category === category) &&
      (!query || `${a.title} ${a.summary}`.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Help & tutorials" copy="Short guides for the common things you'll do here." />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search help"
            aria-label="Search help"
            className="pl-9"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-pressed={category === c.value}
            onClick={() => setCategory(c.value)}
            className={cn(
              "min-h-9 rounded-full border px-3.5 text-xs font-bold",
              category === c.value
                ? "border-primary bg-accent text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<BookOpen />} title="No articles match" copy="Try a different search or category." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => toast.info("Article content arrives with the content phase")}
              className="financial-card flex flex-col p-5 text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            >
              <p className="eyebrow text-secondary">{humanizeStatus(a.category)}</p>
              <h2 className="mt-1.5 text-sm font-extrabold text-foreground">{a.title}</h2>
              <p className="mt-1.5 flex-1 text-xs text-muted-foreground">{a.summary}</p>
              <p className="mt-3 text-[11px] text-tertiary">{a.readMinutes} min read</p>
            </button>
          ))}
        </div>
      )}

      <StatePanel
        tone="info"
        title="Need more help?"
        copy="The support channel arrives with the content phase — this shows where it will live."
        action={
          <Button variant="outline" size="sm" onClick={() => toast.info("Support arrives with the help phase")}>
            Contact support
          </Button>
        }
      />
    </div>
  );
}
