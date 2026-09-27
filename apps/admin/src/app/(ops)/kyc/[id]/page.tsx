"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatDateTime, humanizeStatus, idempotencyKey } from "@rentbrown/utils";
import { Button, Field, StatePanel, Textarea, toast } from "@rentbrown/ui";
import { ExternalLink, FileText } from "lucide-react";

import { useDecideKyc, useKycCase } from "../../../../lib/data/hooks";
import { useDataSource } from "../../../../lib/data/provider";
import { DetailRow } from "../../../../components/detail-drawer";
import { BackLink, PageHeader, TableSkeleton } from "../../../../components/page-header";
import { PermissionGate } from "../../../../components/permission-gate";
import { StatusCell } from "../../../../components/status-cell";

type Decision = "APPROVE" | "REJECT" | "REQUEST_MORE_INFO";

const DECISION_META: Record<Decision, { label: string; variant: "primary" | "destructive" | "outline"; hint: string }> = {
  APPROVE: { label: "Approve", variant: "primary", hint: "e.g. Documents verified — BVN matches legal name." },
  REQUEST_MORE_INFO: { label: "Request info", variant: "outline", hint: "e.g. Please upload a utility bill dated within 3 months." },
  REJECT: { label: "Reject", variant: "destructive", hint: "e.g. Document could not be validated." },
};

function DocumentViewer({ submissionId, hasSelfie, hasPoa }: { submissionId: string; hasSelfie?: boolean; hasPoa?: boolean }) {
  const ds = useDataSource();
  const [opening, setOpening] = React.useState<string | null>(null);

  const open = async (kind: "selfie" | "poa") => {
    setOpening(kind);
    try {
      const url = await ds.getKycDocumentUrl(submissionId, kind);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open the document.");
    } finally {
      setOpening(null);
    }
  };

  return (
    <section className="financial-card p-4">
      <h2 className="eyebrow mb-3 text-muted-foreground">Documents</h2>
      <div className="flex flex-col gap-2">
        {([
          { kind: "selfie" as const, label: "Selfie photo", present: hasSelfie },
          { kind: "poa" as const, label: "Proof of address", present: hasPoa },
        ]).map((d) => (
          <div key={d.kind} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-muted-foreground">
                <FileText className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{d.label}</p>
                <p className="text-[11px] text-muted-foreground">Private storage — signed 60-second link, view audited.</p>
              </div>
            </div>
            {d.present ? (
              <Button size="sm" variant="outline" disabled={opening !== null} onClick={() => void open(d.kind)}>
                <ExternalLink className="mr-1.5 size-3.5" aria-hidden />
                {opening === d.kind ? "Opening…" : "Open"}
              </Button>
            ) : (
              <span className="text-xs text-tertiary">Not uploaded</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function KycDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: kase, isLoading, isError } = useKycCase(id);
  const mutation = useDecideKyc();
  const [pending, setPending] = React.useState<Decision | null>(null);
  const [reason, setReason] = React.useState("");

  if (isLoading) {
    return (
      <div>
        <BackLink href="/kyc" label="KYC review" />
        <TableSkeleton rows={6} cols={3} />
      </div>
    );
  }
  if (isError || !kase) {
    return (
      <div>
        <BackLink href="/kyc" label="KYC review" />
        <StatePanel tone="error" title="Case not found" copy="This KYC submission does not exist or you don't have access to it." />
      </div>
    );
  }

  const actionable = kase.queue === "PENDING" || kase.queue === "NEEDS_ACTION";

  const decide = (decision: Decision) => {
    mutation.mutate(
      { caseId: kase.id, decision, reason: reason.trim(), idempotencyKey: idempotencyKey("kyc") },
      {
        onSuccess: (res) => {
          toast.success(res.message, { description: `Audit: ${res.auditId}` });
          setPending(null);
          setReason("");
          router.push("/kyc");
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div>
      <BackLink href="/kyc" label="KYC review" />
      <PageHeader
        title={kase.userDisplayName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusCell status={kase.status} />
            <StatusCell status="info" label={kase.queue.replace("_", " ")} />
            <span className="text-xs text-muted-foreground">
              {kase.tier === "TIER_2" ? "Tier 2" : "Tier 1"} · submitted {formatDateTime(kase.submittedAt)} · waiting {kase.ageLabel}
            </span>
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Applicant details — present on the real adapter; hidden on the demo path */}
          {kase.legalName !== undefined || kase.bvn !== undefined ? (
            <section className="financial-card p-4">
              <h2 className="eyebrow mb-2 text-muted-foreground">Applicant</h2>
              <DetailRow label="Legal name">{kase.legalName ?? <span className="text-tertiary">Not provided</span>}</DetailRow>
              <DetailRow label="Gender">{kase.gender ?? <span className="text-tertiary">Not provided</span>}</DetailRow>
              <DetailRow label="BVN" mono>{kase.bvn ?? <span className="text-tertiary">Not provided</span>}</DetailRow>
              <DetailRow label="Address document">{kase.poaType ? kase.poaType.replace(/_/g, " ").toLowerCase() : <span className="text-tertiary">Not provided</span>}</DetailRow>
              {kase.attemptNo ? <DetailRow label="Attempt">#{kase.attemptNo}</DetailRow> : null}
            </section>
          ) : null}

          {/* Document summary */}
          <section className="financial-card p-4">
            <h2 className="eyebrow mb-2 text-muted-foreground">Document</h2>
            <DetailRow label="Type">{kase.documentType.replace("_", " ")}</DetailRow>
            <DetailRow label="Number" mono>{kase.documentNumberMasked}</DetailRow>
            <DetailRow label="Submitted">{formatDateTime(kase.submittedAt)}</DetailRow>
            <DetailRow label="Reviewer">{kase.reviewer ?? "Unassigned"}</DetailRow>
            {kase.decisionNote ? <DetailRow label="Decision note">{kase.decisionNote}</DetailRow> : null}
          </section>

          <DocumentViewer submissionId={kase.id} hasSelfie={kase.hasSelfie} hasPoa={kase.hasPoa} />

          {/* Checks */}
          <section className="financial-card p-4">
            <h2 className="eyebrow mb-3 text-muted-foreground">Checks</h2>
            <div className="flex flex-col gap-2">
              {kase.checks.map((check) => (
                <div key={check.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{check.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{check.detail}</p>
                  </div>
                  <StatusCell status={check.status} className="shrink-0" />
                </div>
              ))}
            </div>
          </section>

          {/* Transition timeline */}
          {kase.events && kase.events.length > 0 ? (
            <section className="financial-card p-4">
              <h2 className="eyebrow mb-3 text-muted-foreground">Timeline</h2>
              <div className="flex flex-col gap-2">
                {kase.events.map((e, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {e.from ? `${humanizeStatus(e.from)} → ` : ""}
                        {humanizeStatus(e.to)}
                      </p>
                      {e.note ? <p className="mt-0.5 text-xs text-muted-foreground">{e.note}</p> : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] font-bold uppercase text-tertiary">{e.source}</p>
                      <p className="tabular text-xs text-muted-foreground">{formatDateTime(e.at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {/* Decision panel */}
        <section className="financial-card h-fit p-4">
          <h2 className="eyebrow mb-3 text-muted-foreground">Decision</h2>
          {actionable ? (
            <PermissionGate permission="kyc.review" mode="disable">
              <div className="flex flex-col gap-3">
                {(Object.keys(DECISION_META) as Decision[]).map((d) => (
                  <Button key={d} size="sm" variant={DECISION_META[d].variant} disabled={mutation.isPending} onClick={() => setPending(pending === d ? null : d)}>
                    {DECISION_META[d].label}
                  </Button>
                ))}
                {pending ? (
                  <div className="rounded-md border border-border p-3">
                    <Field label={`Reason — ${DECISION_META[pending].label}`} htmlFor="kyc-reason">
                      <Textarea
                        id="kyc-reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={DECISION_META[pending].hint}
                      />
                    </Field>
                    <Button
                      size="sm"
                      className="mt-3 w-full"
                      disabled={reason.trim().length < 3 || mutation.isPending}
                      onClick={() => decide(pending)}
                    >
                      {mutation.isPending ? "Recording…" : `Confirm ${DECISION_META[pending].label.toLowerCase()}`}
                    </Button>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Recorded to the audit trail and shown to the applicant. Rejected applicants can resubmit.
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Every decision requires a reason — it goes to the audit trail and the user-facing note.</p>
                )}
              </div>
            </PermissionGate>
          ) : (
            <p className="text-xs text-muted-foreground">
              This case is decided ({kase.queue.toLowerCase().replace("_", " ")}). {kase.reviewer ? `Reviewed by ${kase.reviewer}.` : ""}
            </p>
          )}
          <p className="mt-4 border-t pt-3 text-[11px] text-tertiary">
            <Link href={`/users/${kase.userId}`} className="font-semibold text-primary hover:underline">
              View applicant profile →
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}

export default function KycDetailPage() {
  return (
    <PermissionGate permission="kyc.read" mode="page">
      <KycDetail />
    </PermissionGate>
  );
}
