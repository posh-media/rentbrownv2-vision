import { FileCheck2, FileText, Ruler, Scale, ShieldCheck, ScrollText, Handshake } from "lucide-react";
import { StatusPill } from "@rentbrown/ui";
import type { ProofDocument, ProofDocumentType } from "@rentbrown/types";
import { formatDate } from "@rentbrown/utils";

import { labelFor, toneFor } from "../../lib/status";

const icons: Record<ProofDocumentType, typeof FileCheck2> = {
  TITLE: FileCheck2,
  VALUATION: Scale,
  INSPECTION: Ruler,
  COST_SCHEDULE: ScrollText,
  INSURANCE: ShieldCheck,
  LEGAL_OPINION: Scale,
  OPERATOR_AGREEMENT: Handshake,
};

export function ProofDocumentCard({ document }: { document: ProofDocument }) {
  const Icon = icons[document.type] ?? FileText;
  return (
    <div className="financial-card flex flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-9 items-center justify-center rounded-md bg-secondary-soft text-primary">
          <Icon className="size-4.5" aria-hidden />
        </span>
        <StatusPill tone={toneFor(document.status)}>{labelFor(document.status)}</StatusPill>
      </div>
      <h3 className="text-sm font-bold text-foreground">{document.title}</h3>
      <p className="text-xs text-muted-foreground">{document.summary}</p>
      <p className="mt-auto pt-1 text-[11px] text-tertiary">
        Reviewed by {document.reviewedBy} · {formatDate(document.reviewedAt)} · {document.version}
      </p>
    </div>
  );
}
