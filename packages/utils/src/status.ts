/**
 * Locked status → tone/label vocabulary shared by web and mobile.
 * Every domain status maps onto one of six visual tones; UIs never invent
 * new colours for a status.
 */
import type {
  DepositStatus,
  InvestmentRoundStatus,
  InvestmentStatus,
  KycStatus,
  PaymentStatus,
  ReferralStatus,
  StatusTone,
  TransactionStatus,
  WithdrawalStatus,
} from "@rentbrown/types";

type Entry = { tone: StatusTone; label: string };

export const ROUND_STATUS: Record<InvestmentRoundStatus, Entry> = {
  OPEN: { tone: "success", label: "Open" },
  NEARING_CAPACITY: { tone: "warning", label: "Nearing capacity" },
  SOLD_OUT: { tone: "neutral", label: "Sold out" },
  CLOSED: { tone: "neutral", label: "Closed" },
  SETTLED: { tone: "neutral", label: "Settled" },
  SCHEDULED: { tone: "info", label: "Coming soon" },
};

export const INVESTMENT_STATUS: Record<InvestmentStatus, Entry> = {
  PAYMENT_PENDING: { tone: "warning", label: "Payment pending" },
  ACTIVE: { tone: "success", label: "Active" },
  MATURITY_DUE: { tone: "pending", label: "Maturing" },
  SETTLING: { tone: "pending", label: "Settling" },
  COMPLETED: { tone: "neutral", label: "Completed" },
  FAILED: { tone: "error", label: "Failed" },
  REFUNDED: { tone: "neutral", label: "Refunded" },
  REVIEW_REQUIRED: { tone: "warning", label: "Under review" },
};

export const TRANSACTION_STATUS: Record<TransactionStatus, Entry> = {
  SUCCESSFUL: { tone: "success", label: "Successful" },
  PENDING: { tone: "pending", label: "Pending" },
  UNDER_REVIEW: { tone: "pending", label: "Under review" },
  FAILED: { tone: "error", label: "Failed" },
  REVERSED: { tone: "neutral", label: "Reversed" },
};

export const WITHDRAWAL_STATUS: Record<WithdrawalStatus, Entry> = {
  REQUESTED: { tone: "pending", label: "Requested" },
  UNDER_REVIEW: { tone: "pending", label: "Under review" },
  APPROVED: { tone: "info", label: "Approved" },
  PROCESSING: { tone: "pending", label: "Processing" },
  COMPLETED: { tone: "success", label: "Completed" },
  REJECTED: { tone: "error", label: "Rejected" },
  FAILED: { tone: "error", label: "Failed" },
};

export const DEPOSIT_STATUS: Record<DepositStatus, Entry> = {
  AWAITING_TRANSFER: { tone: "warning", label: "Awaiting transfer" },
  CONFIRMING: { tone: "pending", label: "Confirming" },
  CREDITED: { tone: "success", label: "Credited" },
  FAILED: { tone: "error", label: "Failed" },
  EXPIRED: { tone: "neutral", label: "Expired" },
};

export const PAYMENT_STATUS: Record<PaymentStatus, Entry> = {
  PENDING: { tone: "warning", label: "Awaiting payment" },
  CONFIRMING: { tone: "pending", label: "Confirming" },
  SUCCESSFUL: { tone: "success", label: "Confirmed" },
  FAILED: { tone: "error", label: "Not completed" },
  REFUNDED: { tone: "neutral", label: "Refunded" },
};

export const KYC_STATUS: Record<KycStatus, Entry> = {
  NOT_STARTED: { tone: "neutral", label: "Not started" },
  IN_PROGRESS: { tone: "info", label: "In progress" },
  PENDING_REVIEW: { tone: "pending", label: "Pending review" },
  VERIFIED: { tone: "success", label: "Verified" },
  REJECTED: { tone: "error", label: "Action required" },
};

export const REFERRAL_STATUS: Record<ReferralStatus, Entry> = {
  JOINED: { tone: "info", label: "Joined" },
  PENDING: { tone: "pending", label: "Pending" },
  QUALIFIED: { tone: "success", label: "Qualified" },
  CREDITED: { tone: "success", label: "Credited" },
  DISQUALIFIED: { tone: "neutral", label: "Not eligible" },
};
