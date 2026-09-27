"use client";

import * as React from "react";
import { AlertCircle, Check } from "lucide-react";
import { Button, StatePanel, StatusPill, cn } from "@rentbrown/ui";
import type { KycStep, KycSummary } from "@rentbrown/types";
import { formatDate } from "@rentbrown/utils";

import { labelFor } from "../../lib/status";

function StepRow({ step }: { step: KycStep }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span
        aria-hidden
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border",
          step.state === "complete" && "border-success bg-success text-success-foreground",
          step.state === "current" && "border-primary bg-primary text-primary-foreground",
          step.state === "upcoming" && "border-border-strong bg-card text-muted-foreground",
          step.state === "action_required" && "border-error bg-error text-error-foreground",
        )}
      >
        {step.state === "complete" ? (
          <Check className="size-3.5" />
        ) : step.state === "action_required" ? (
          <AlertCircle className="size-3.5" />
        ) : (
          <span className="text-xs font-bold">{step.id === "PERSONAL" ? 1 : step.id === "IDENTITY" ? 2 : step.id === "ADDRESS" ? 3 : 4}</span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-foreground">{step.title}</p>
          <StatusPill tone={step.state === "complete" ? "success" : step.state === "action_required" ? "error" : step.state === "current" ? "info" : "neutral"}>
            {step.state === "action_required" ? "Action required" : labelFor(step.state)}
          </StatusPill>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
      </div>
    </div>
  );
}

export function KycStatusPanel({ kyc, onStart }: { kyc: KycSummary; onStart?: () => void }) {
  const panel = (() => {
    switch (kyc.status) {
      case "VERIFIED":
        return (
          <StatePanel
            tone="success"
            title={`Verified · Tier ${kyc.tier}`}
            copy={kyc.reviewedAt ? `Reviewed ${formatDate(kyc.reviewedAt)}.` : "Your identity is verified."}
          />
        );
      case "PENDING_REVIEW":
        return (
          <StatePanel
            tone="pending"
            title="Documents received — under review"
            copy={kyc.submittedAt ? `Submitted ${formatDate(kyc.submittedAt)}. Reviews usually complete within one business day.` : "Under review."}
          />
        );
      case "IN_PROGRESS":
        return <StatePanel tone="info" title="Verification in progress" copy="Finish the remaining steps below and submit for review." />;
      case "REJECTED":
        return (
          <StatePanel
            tone="error"
            title="Action required"
            copy={kyc.rejectionReason ?? "One of your documents could not be accepted."}
            action={
              <Button size="sm" onClick={onStart}>
                Update &amp; resubmit
              </Button>
            }
          />
        );
      default:
        return (
          <StatePanel
            tone="neutral"
            title="Not started"
            copy="Verification takes about five minutes and is required before withdrawals."
            action={
              <Button size="sm" onClick={onStart}>
                Start verification
              </Button>
            }
          />
        );
    }
  })();

  return (
    <div className="flex flex-col gap-6">
      {panel}

      <div className="financial-card p-5">
        <h2 className="text-base font-bold text-foreground">Verification steps</h2>
        <div className="mt-2 divide-y divide-border">
          {kyc.steps.map((s) => (
            <StepRow key={s.id} step={s} />
          ))}
        </div>
      </div>

      <div className="financial-card p-5">
        <h2 className="text-base font-bold text-foreground">What verification unlocks</h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
          {kyc.unlocks.map((u) => (
            <li key={u}>{u}</li>
          ))}
        </ul>
      </div>

      <p className="rounded-md bg-surface-subtle p-4 text-xs text-muted-foreground">
        Documents are stored privately and reviewed only by the RentBrown compliance team. Your BVN is
        never shown back to you or to other users.
      </p>
    </div>
  );
}
