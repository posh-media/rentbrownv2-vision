import Link from "next/link";
import { StatusPill } from "@rentbrown/ui";
import type { KycSummary } from "@rentbrown/types";

import { labelFor, toneFor } from "../../lib/status";

const copy: Record<KycSummary["status"], string> = {
  VERIFIED: "Your identity is verified — full limits apply.",
  PENDING_REVIEW: "Documents received. Reviews usually complete within one business day.",
  IN_PROGRESS: "Finish the remaining steps to unlock withdrawals.",
  NOT_STARTED: "Verify your identity to unlock withdrawals and higher limits.",
  REJECTED: "One of your documents needs attention before you can continue.",
};

export function KycStatusCard({ kyc }: { kyc: KycSummary }) {
  return (
    <div className="financial-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-foreground">Identity verification</h3>
        <StatusPill tone={toneFor(kyc.status)}>{labelFor(kyc.status)}</StatusPill>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{copy[kyc.status]}</p>
      {kyc.status !== "VERIFIED" ? (
        <Link href="/account/kyc" className="mt-3 inline-block text-xs font-bold text-primary hover:underline">
          Continue verification
        </Link>
      ) : null}
    </div>
  );
}
