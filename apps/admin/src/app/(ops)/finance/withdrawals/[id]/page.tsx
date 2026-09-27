"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatDateTime, formatMoney, idempotencyKey } from "@rentbrown/utils";
import { Badge, Button, Field, StatePanel, Textarea, toast } from "@rentbrown/ui";

import { useDecideWithdrawal, useWithdrawal } from "../../../../../lib/data/hooks";
import { DetailRow } from "../../../../../components/detail-drawer";
import { BackLink, PageHeader, TableSkeleton } from "../../../../../components/page-header";
import { PermissionGate } from "../../../../../components/permission-gate";
import { StatusCell } from "../../../../../components/status-cell";

type Decision = "APPROVE" | "REJECT" | "MARK_PAID";

const DECISION_META: Record<Decision, { label: string; variant: "primary" | "destructive" | "secondary"; hint: string; applies: string[] }> = {
  APPROVE: { label: "Approve", variant: "primary", hint: "e.g. Checks passed — release for payout.", applies: ["REQUESTED", "UNDER_REVIEW"] },
  MARK_PAID: { label: "Mark paid", variant: "secondary", hint: "e.g. Confirmed via bank — NIP reference noted.", applies: ["APPROVED", "PROCESSING"] },
  REJECT: { label: "Reject", variant: "destructive", hint: "e.g. Destination unverified — release reserved funds.", applies: ["REQUESTED", "UNDER_REVIEW", "APPROVED"] },
};

function WithdrawalDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: w, isLoading, isError } = useWithdrawal(id);
  const mutation = useDecideWithdrawal();
  const [pending, setPending] = React.useState<Decision | null>(null);
  const [reason, setReason] = React.useState("");

  if (isLoading) {
    return (
      <div>
        <BackLink href="/finance/withdrawals" label="Withdrawal review" />
        <TableSkeleton rows={6} cols={3} />
      </div>
    );
  }
  if (isError || !w) {
    return (
      <div>
        <BackLink href="/finance/withdrawals" label="Withdrawal review" />
        <StatePanel tone="error" title="Withdrawal not found" copy="This withdrawal may not exist in the mock dataset." />
      </div>
    );
  }

  const available = (Object.keys(DECISION_META) as Decision[]).filter((d) => DECISION_META[d].applies.includes(w.status));

  const decide = (decision: Decision) => {
    mutation.mutate(
      { withdrawalId: w.id, decision, reason: reason.trim(), idempotencyKey: idempotencyKey("wd") },
      {
        onSuccess: (res) => {
          toast.success(res.message, { description: `Audit: ${res.auditId}` });
          setPending(null);
          setReason("");
          router.push("/finance/withdrawals");
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div>
      <BackLink href="/finance/withdrawals" label="Withdrawal review" />
      <PageHeader
        title={<span className="font-mono text-lg">{w.reference}</span>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusCell status={w.status} />
            <span className="text-xs text-muted-foreground">requested {formatDateTime(w.requestedAt)}</span>
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Amounts — read-only server math */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="financial-card p-4">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Amount</p>
              <p className="tabular mt-1 text-xl font-extrabold">{formatMoney(w.amount, w.currency)}</p>
            </div>
            <div className="financial-card p-4">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Fee</p>
              <p className="tabular mt-1 text-xl font-extrabold">{formatMoney(w.fee, w.currency)}</p>
            </div>
            <div className="financial-card p-4">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Net payout</p>
              <p className="tabular mt-1 text-xl font-extrabold">{formatMoney(w.netAmount, w.currency)}</p>
            </div>
          </section>

          <section className="financial-card p-4">
            <h2 className="eyebrow mb-2 text-muted-foreground">Request</h2>
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <div>
                <DetailRow label="User">
                  <Link href={`/users/${w.userId}`} className="text-primary hover:underline">{w.userDisplayName}</Link>
                </DetailRow>
                <DetailRow label="KYC status"><StatusCell status={w.kycStatus} /></DetailRow>
                <DetailRow label="Destination">{w.destinationLabel}</DetailRow>
              </div>
              <div>
                <DetailRow label="Requested">{formatDateTime(w.requestedAt)}</DetailRow>
                <DetailRow label="Reviewed by">{w.reviewedBy ?? "—"}</DetailRow>
                <DetailRow label="Paid at">{w.paidAt ? formatDateTime(w.paidAt) : "—"}</DetailRow>
              </div>
            </div>
            {w.destination?.accountNumber || w.destination?.accountName ? (
              <div className="mt-3 rounded-md border border-border p-3">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Destination snapshot</p>
                <div className="mt-1.5 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                  <DetailRow label="Bank">{w.destination?.bankName ?? "—"}</DetailRow>
                  <DetailRow label="Account" mono>{w.destination?.accountNumber ?? "—"}</DetailRow>
                  <DetailRow label="Name">{w.destination?.accountName ?? "—"}</DetailRow>
                  <DetailRow label="Code" mono>{w.destination?.bankCode ?? "—"}</DetailRow>
                </div>
              </div>
            ) : null}
            {w.riskFlags.length > 0 ? (
              <div className="mt-3 rounded-md border border-warning-border bg-warning-soft p-3">
                <p className="text-[10px] font-bold uppercase text-[var(--warning-fg)]">Risk flags</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {w.riskFlags.map((f) => (
                    <Badge key={f} tone="warning" className="text-[10px]">{f}</Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {/* State transitions */}
          {w.events && w.events.length > 0 ? (
            <section className="financial-card p-4">
              <h2 className="eyebrow mb-3 text-muted-foreground">Timeline</h2>
              <div className="flex flex-col gap-2">
                {w.events.map((e, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {e.from ? `${e.from.replace(/_/g, " ").toLowerCase()} → ` : ""}
                        {e.to.replace(/_/g, " ").toLowerCase()}
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

          {/* Outbound deliveries (Make.com → Telegram) */}
          {w.outbound && w.outbound.length > 0 ? (
            <section className="financial-card p-4">
              <h2 className="eyebrow mb-3 text-muted-foreground">Outbound events</h2>
              <div className="flex flex-col gap-2">
                {w.outbound.map((o, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold">{o.eventType}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {o.attempts} attempt{o.attempts === 1 ? "" : "s"}
                        {o.lastResponseCode ? ` · HTTP ${o.lastResponseCode}` : ""}
                        {o.deliveredAt ? ` · delivered ${formatDateTime(o.deliveredAt)}` : ""}
                      </p>
                    </div>
                    <StatusCell status={o.status} className="shrink-0" />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {/* Decision panel */}
        <section className="financial-card h-fit p-4">
          <h2 className="eyebrow mb-3 text-muted-foreground">Decision</h2>
          {available.length > 0 ? (
            <PermissionGate permission="finance.review_withdrawals" mode="disable">
              <div className="flex flex-col gap-3">
                {available.map((d) => (
                  <Button key={d} size="sm" variant={DECISION_META[d].variant} disabled={mutation.isPending} onClick={() => setPending(pending === d ? null : d)}>
                    {DECISION_META[d].label}
                  </Button>
                ))}
                {pending ? (
                  <div className="rounded-md border border-border p-3">
                    <Field label={`Reason — ${DECISION_META[pending].label}`} htmlFor="wd-reason">
                      <Textarea id="wd-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={DECISION_META[pending].hint} />
                    </Field>
                    <Button size="sm" className="mt-3 w-full" disabled={reason.trim().length < 3 || mutation.isPending} onClick={() => decide(pending)}>
                      {mutation.isPending ? "Recording…" : `Confirm ${DECISION_META[pending].label.toLowerCase()}`}
                    </Button>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Decisions require a reason — recorded to the audit trail with an idempotency key.</p>
                )}
              </div>
            </PermissionGate>
          ) : (
            <p className="text-xs text-muted-foreground">
              This withdrawal is final ({w.status.toLowerCase().replace("_", " ")}). No actions available.
            </p>
          )}
          <p className="mt-4 border-t pt-3 text-[11px] text-tertiary">
            Reserved funds stay in the investor&rsquo;s RESERVED ledger account until a decision posts the release or payout journal.
          </p>
        </section>
      </div>
    </div>
  );
}

export default function WithdrawalDetailPage() {
  return (
    <PermissionGate permission="finance.read" mode="page">
      <WithdrawalDetail />
    </PermissionGate>
  );
}
