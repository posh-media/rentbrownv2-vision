"use client";

import * as React from "react";
import type { AdminLegalDocument } from "@rentbrown/types";
import { formatDate, formatDateTime } from "@rentbrown/utils";
import { Badge, StatePanel } from "@rentbrown/ui";

import { useLegalDocuments } from "../../../lib/data/hooks";
import { PageHeader, TableSkeleton } from "../../../components/page-header";
import { StatusCell } from "../../../components/status-cell";

function LegalView() {
  const { data, isLoading, isError } = useLegalDocuments();
  const [selected, setSelected] = React.useState<AdminLegalDocument | null>(null);

  if (isLoading) return <TableSkeleton rows={4} cols={5} />;
  if (isError || !data) return <StatePanel tone="error" title="Couldn't load documents" copy="The mock data source failed to respond." />;

  return (
    <div>
      <PageHeader title="Legal documents" description="Published trust documents. Content is read-only here; edits happen through the legal owner." />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Documents table */}
        <div className="financial-card overflow-hidden lg:col-span-1">
          <h2 className="eyebrow border-b bg-surface-subtle px-4 py-3 text-muted-foreground">Documents</h2>
          <div className="divide-y">
            {data.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => setSelected(doc)}
                className={`w-full px-4 py-3 text-left transition-colors hover:bg-accent ${selected?.id === doc.id ? "bg-accent" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{doc.title}</p>
                  <StatusCell status={doc.status === "PUBLISHED" ? "success" : "pending"} label={doc.status === "PUBLISHED" ? "Published" : "Draft"} />
                </div>
                <p className="mt-1 font-mono text-[10px] text-tertiary">
                  v{doc.version} · effective {formatDate(doc.effectiveAt)} · owner {doc.owner}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{doc.summary}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Read view */}
        <div className="lg:col-span-2">
          {selected ? (
            <article className="financial-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <div>
                  <h2 className="text-lg font-extrabold">{selected.title}</h2>
                  <p className="mt-0.5 font-mono text-[11px] text-tertiary">
                    v{selected.version} · effective {formatDate(selected.effectiveAt)} · last edited {formatDateTime(selected.updatedAt)} by {selected.owner}
                  </p>
                </div>
                <Badge tone="neutral" className="text-[10px]">Read-only</Badge>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{selected.summary}</p>
              <div className="mt-4 flex flex-col gap-4">
                {selected.sections.map((s) => (
                  <section key={s.heading}>
                    <h3 className="text-sm font-bold">{s.heading}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                  </section>
                ))}
              </div>
            </article>
          ) : (
            <StatePanel tone="neutral" title="Select a document" copy="Choose a document on the left to read its full content." />
          )}
        </div>
      </div>
    </div>
  );
}

export default function LegalPage() {
  return <LegalView />;
}
