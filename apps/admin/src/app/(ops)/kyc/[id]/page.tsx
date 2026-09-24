"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatDateTime, idempotencyKey } from "@rentbrown/utils";
import { Button, Field, StatePanel, Textarea, toast } from "@rentbrown/ui";

import { useDecideKyc, useKycCase } from "../../../../lib/data/hooks";
import { DetailRow } from "../../../../components/detail-drawer";
import { BackLink, PageHeader, TableSkeleton } from "../../../../components/page-header";
import { PermissionGate } from "../../../../components/permission-gate";
import { StatusCell } from "../../../../components/status-cell";

type Decision = "APPROVE" | "REJECT" | "REQUEST_MORE_INFO";

const DECISION_META: Record<Decision, { label: string; variant: "primary" | "destructive" | "outline"; hint: string }> = {
  APPROVE: { label: "Approve", variant: "primary", hint: "e.g. All checks passed — Tier 2 verified." },
  REQUEST_MORE_INFO: { label: "Request info", variant: "outline", hint: "e.g. Please upload a utility bill dated within 3 months." },
  REJECT: { label: "Reject", variant: "destructive", hint: "e.g. Document could not be validated." },
};

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
        <StatePanel tone="error" title="Case not found" copy="This KYC case may not exist in the mock dataset." />
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
          {/* Document summary */}
          <section className="financial-card p-4">
            <h2 className="eyebrow mb-2 text-muted-foreground">Document</h2>
            <DetailRow label="Type">{kase.documentType.replace("_", " ")}</DetailRow>
            <DetailRow label="Number" mono>{kase.documentNumberMasked}</DetailRow>
            <DetailRow label="Submitted">{formatDateTime(kase.submittedAt)}</DetailRow>
            <DetailRow label="Reviewer">{kase.reviewer ?? "Unassigned"}</DetailRow>
            {kase.decisionNote ? <DetailRow label="Decision note">{kase.decisionNote}</DetailRow> : null}
            <p className="mt-2 text-[11px] text-tertiary">
              Document payloads are redacted in the admin surface — only validation results are shown.
            </p>
          </section>

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
                      Writes an audit entry and updates the queue (mock).
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
