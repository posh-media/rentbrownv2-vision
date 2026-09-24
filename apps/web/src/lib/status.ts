import type {
  InvestmentRoundStatus,
  InvestmentStatus,
  KycStatus,
  PaymentStatus,
  ProofDocumentStatus,
  ReferralStatus,
  StatusTone,
  TransactionStatus,
  WithdrawalStatus,
} from "@rentbrown/types";
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

const proofTone: Record<ProofDocumentStatus, StatusTone> = {
  VERIFIED: "success",
  PENDING_REVIEW: "pending",
  EXPIRED: "error",
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
];

function entryFor(status: string): Entry | undefined {
  for (const map of maps) {
    const entry = map[status];
    if (entry) return entry;
  }
  return undefined;
}

export function toneFor(
  status:
    | InvestmentRoundStatus
    | InvestmentStatus
    | TransactionStatus
    | WithdrawalStatus
    | KycStatus
    | ReferralStatus
    | PaymentStatus
    | ProofDocumentStatus,
): StatusTone {
  return entryFor(status)?.tone ?? (proofTone as Record<string, StatusTone>)[status] ?? "neutral";
}

export function labelFor(status: string): string {
  return entryFor(status)?.label ?? humanizeStatus(status);
}
