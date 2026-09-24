"use client";

import { Button, DataRow, StatePanel } from "@rentbrown/ui";
import { Check } from "lucide-react";

import { useContent } from "../../../lib/data/hooks";
import { PageHeader } from "../../../components/layout/page-header";
import { PageSkeleton } from "../../../components/layout/page-skeleton";

export default function CompanyPage() {
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

  const c = content.data.company;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <PageHeader eyebrow="Company" title={c.name} copy={c.tagline} />

      <div className="financial-card p-5 sm:p-6">
        <h2 className="text-base font-bold text-foreground">Purpose</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{c.purpose}</p>
      </div>

      <div className="financial-card p-5 sm:p-6">
        <h2 className="text-base font-bold text-foreground">Standards</h2>
        <ul className="mt-3 flex flex-col gap-2.5">
          {c.standards.map((s) => (
            <li key={s} className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <Check className="mt-0.5 size-4 shrink-0 text-[var(--success-fg)]" aria-hidden />
              {s}
            </li>
          ))}
        </ul>
      </div>

      <StatePanel tone="info" title="Prototype notice" copy={c.prototypeNotice} />

      <div className="financial-card p-5 sm:p-6">
        <h2 className="text-base font-bold text-foreground">Contact</h2>
        <div className="mt-2">
          <DataRow label="Email" value={c.contact.email} />
          <DataRow label="Phone" value={c.contact.phone} />
          <DataRow label="Address" value={c.contact.address} />
        </div>
      </div>
    </div>
  );
}
