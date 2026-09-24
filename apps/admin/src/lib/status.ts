import type { StatusTone } from "@rentbrown/types";
import {
  DEPOSIT_STATUS,
  INVESTMENT_STATUS,
  KYC_STATUS,
  PAYMENT_STATUS,
  REFERRAL_STATUS,
  ROUND_STATUS,
  TRANSACTION_STATUS,
  WITHDRAWAL_STATUS,
  humanizeStatus,
} from "@rentbrown/utils";

type Entry = { tone: StatusTone; label: string };

/** Admin-only vocabularies that have no shared map in @rentbrown/utils. */
const PROPERTY_PUBLICATION: Record<string, Entry> = {
  DRAFT: { tone: "neutral", label: "Draft" },
  IN_REVIEW: { tone: "pending", label: "In review" },
  PUBLISHED: { tone: "success", label: "Published" },
  ARCHIVED: { tone: "neutral", label: "Archived" },
};

const REWARD_GRANT: Record<string, Entry> = {
  PENDING: { tone: "pending", label: "Pending" },
  QUALIFIED: { tone: "info", label: "Qualified" },
  CREDITED: { tone: "success", label: "Credited" },
  REVERSED: { tone: "neutral", label: "Reversed" },
  BLOCKED: { tone: "error", label: "Blocked" },
};

const DELIVERY: Record<string, Entry> = {
  QUEUED: { tone: "pending", label: "Queued" },
  SENT: { tone: "info", label: "Sent" },
  DELIVERED: { tone: "success", label: "Delivered" },
  FAILED: { tone: "error", label: "Failed" },
};

const RECONCILIATION: Record<string, Entry> = {
  MATCHED: { tone: "success", label: "Matched" },
  UNMATCHED: { tone: "error", label: "Unmatched" },
  INVESTIGATING: { tone: "warning", label: "Investigating" },
  RESOLVED: { tone: "neutral", label: "Resolved" },
};

const AUDIT_RESULT: Record<string, Entry> = {
  SUCCESS: { tone: "success", label: "Success" },
  DENIED: { tone: "warning", label: "Denied" },
  FAILED: { tone: "error", label: "Failed" },
};

const KYC_CHECK: Record<string, Entry> = {
  PASSED: { tone: "success", label: "Passed" },
  FAILED: { tone: "error", label: "Failed" },
  PENDING: { tone: "pending", label: "Pending" },
  MANUAL: { tone: "warning", label: "Manual review" },
};

const TEMPLATE_STATUS: Record<string, Entry> = {
  ACTIVE: { tone: "success", label: "Active" },
  DRAFT: { tone: "neutral", label: "Draft" },
  DISABLED: { tone: "neutral", label: "Disabled" },
};

const ACCOUNT_STATUS: Record<string, Entry> = {
  ACTIVE: { tone: "success", label: "Active" },
  RESTRICTED: { tone: "warning", label: "Restricted" },
  SUSPENDED: { tone: "error", label: "Suspended" },
};

const PROOF_DOC: Record<string, Entry> = {
  VERIFIED: { tone: "success", label: "Verified" },
  PENDING_REVIEW: { tone: "pending", label: "Pending review" },
  EXPIRED: { tone: "error", label: "Expired" },
};

const LEGAL_STATUS: Record<string, Entry> = {
  PUBLISHED: { tone: "success", label: "Published" },
  DRAFT: { tone: "neutral", label: "Draft" },
};

const SEVERITY: Record<string, Entry> = {
  info: { tone: "info", label: "Info" },
  warning: { tone: "warning", label: "Warning" },
  critical: { tone: "error", label: "Critical" },
};

const maps: Array<Record<string, Entry>> = [
  ROUND_STATUS,
  INVESTMENT_STATUS,
  TRANSACTION_STATUS,
  WITHDRAWAL_STATUS,
  DEPOSIT_STATUS,
  PAYMENT_STATUS,
  KYC_STATUS,
  REFERRAL_STATUS,
  PROPERTY_PUBLICATION,
  REWARD_GRANT,
  DELIVERY,
  RECONCILIATION,
  AUDIT_RESULT,
  KYC_CHECK,
  TEMPLATE_STATUS,
  ACCOUNT_STATUS,
  PROOF_DOC,
  LEGAL_STATUS,
  SEVERITY,
];

function entryFor(status: string): Entry | undefined {
  for (const map of maps) {
    const entry = map[status];
    if (entry) return entry;
  }
  return undefined;
}

export function toneFor(status: string): StatusTone {
  return entryFor(status)?.tone ?? "neutral";
}

export function labelFor(status: string): string {
  return entryFor(status)?.label ?? humanizeStatus(status);
}
