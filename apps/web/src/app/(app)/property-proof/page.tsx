import type { Metadata } from "next";
import Link from "next/link";
import { Button, StatePanel } from "@rentbrown/ui";
import { FileCheck2 } from "lucide-react";
import { createPublicCatalogueSource } from "@rentbrown/mock-data";

import { PageHeader } from "../../../components/layout/page-header";

export const metadata: Metadata = {
  title: "Property proof",
  description: "Every opportunity carries reviewed documents — with reviewer, date and version — so you can see the evidence behind the numbers.",
  alternates: { canonical: "/property-proof" },
};

export default async function PropertyProofPage() {
  const content = await createPublicCatalogueSource().getContent();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Property proof"
        title="Evidence before commitment"
        copy="Every opportunity carries reviewed documents — with reviewer, date and version — so you can see the evidence behind the numbers."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {content.trustPillars.map((p) => (
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
