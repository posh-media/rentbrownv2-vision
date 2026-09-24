/**
 * Named scenarios let every important investor state be demonstrated without a
 * backend. Apps expose a dev-only scenario switcher.
 */
import type {
  DepositIntent,
  Investment,
  KycSummary,
  Notification,
  ReferralRecord,
  ReferralSummary,
  Transaction,
  UserProfile,
  WalletSummary,
  Withdrawal,
} from "@rentbrown/types";
import { rounds } from "./fixtures/catalogue";
import * as ada from "./fixtures/investor";

export type MockScenario =
  | "default"
  | "new-investor"
  | "kyc-pending"
  | "kyc-rejected"
  | "no-opportunities"
  | "signed-out";

export const MOCK_SCENARIOS: Array<{ id: MockScenario; label: string; description: string }> = [
  { id: "default", label: "Established investor", description: "Ada — 3 active, 2 completed, wallet funded, KYC verified, pending withdrawal and deposit." },
  { id: "new-investor", label: "New investor", description: "Empty portfolio and wallet, no transactions, KYC not started, no PIN, email unverified." },
  { id: "kyc-pending", label: "KYC pending review", description: "Ada with documents submitted and awaiting review; withdrawals blocked." },
  { id: "kyc-rejected", label: "KYC action required", description: "Ada with an unreadable address document; resubmission required." },
  { id: "no-opportunities", label: "No open opportunities", description: "Every round is sold out, closed or scheduled — Explore shows its empty state." },
  { id: "signed-out", label: "Signed out", description: "No session — lands on public and auth screens." },
];

export interface ScenarioState {
  signedIn: boolean;
  profile: UserProfile;
  kyc: KycSummary;
  wallet: WalletSummary;
  investments: Investment[];
  transactions: Transaction[];
  withdrawals: Withdrawal[];
  deposits: DepositIntent[];
  referralSummary: ReferralSummary;
  referrals: ReferralRecord[];
  notifications: Notification[];
  /** Which rounds are visible in Explore. */
  roundIds: string[];
}

const clone = <T>(v: T): T => (typeof structuredClone === "function" ? structuredClone(v) : (JSON.parse(JSON.stringify(v)) as T));

const kycNotStarted: KycSummary = {
  status: "NOT_STARTED",
  tier: 0,
  steps: ada.kycVerified.steps.map((s, i) => ({ ...s, state: i === 0 ? "current" : "upcoming" })),
  submittedAt: null,
  reviewedAt: null,
  unlocks: ["Withdrawals to verified bank accounts", "Investment limits up to ₦5,000,000 per round"],
};

const kycPending: KycSummary = {
  ...ada.kycVerified,
  status: "PENDING_REVIEW",
  tier: 1,
  submittedAt: "2026-09-23T17:40:00Z",
  reviewedAt: null,
  steps: ada.kycVerified.steps.map((s) => ({ ...s, state: "complete" })),
};

const kycRejected: KycSummary = {
  ...ada.kycVerified,
  status: "REJECTED",
  tier: 1,
  submittedAt: "2026-09-20T11:00:00Z",
  reviewedAt: "2026-09-21T09:15:00Z",
  rejectionReason: "The address document was unreadable. Upload a clearer photo of a utility bill or bank statement dated within the last three months.",
  steps: ada.kycVerified.steps.map((s) => ({ ...s, state: s.id === "ADDRESS" ? "action_required" : "complete" })),
};

const existingDeposits: DepositIntent[] = [
  { id: "dep_02", reference: "RB-DP-260924-2210", amount: 5_000_000, currency: "NGN", method: "BANK_TRANSFER", status: "CONFIRMING", fee: 0, createdAt: "2026-09-24T08:45:00Z", creditedAt: null },
  { id: "dep_01", reference: "RB-DP-260920-1842", amount: 25_000_000, currency: "NGN", method: "BANK_TRANSFER", status: "CREDITED", fee: 0, createdAt: "2026-09-20T12:50:00Z", creditedAt: "2026-09-20T13:10:00Z" },
];

function established(): ScenarioState {
  return clone({
    signedIn: true,
    profile: ada.profile,
    kyc: ada.kycVerified,
    wallet: ada.wallet,
    investments: ada.investments,
    transactions: ada.transactions,
    withdrawals: ada.withdrawals,
    deposits: existingDeposits,
    referralSummary: ada.referralSummary,
    referrals: ada.referrals,
    notifications: ada.notifications,
    roundIds: rounds.map((r) => r.id),
  });
}

export function buildScenario(scenario: MockScenario): ScenarioState {
  switch (scenario) {
    case "new-investor": {
      const s = established();
      s.profile = {
        ...s.profile,
        id: "usr_tunde",
        firstName: "Tunde",
        lastName: "Bakare",
        displayName: "Tunde Bakare",
        initials: "TB",
        email: "tunde.bakare@example.test",
        phone: "+234 802 555 0199",
        memberSince: "2026-09-24T09:30:00Z",
        emailVerified: false,
        security: { ...s.profile.security, hasTransactionPin: false, biometricsEnabled: false, lastPasswordChangeAt: null, devices: [s.profile.security.devices[0]!] },
      };
      s.kyc = clone(kycNotStarted);
      s.wallet = { ...s.wallet, balances: { AVAILABLE: 0, RESERVED: 0, BONUS: 0, PENDING: 0 }, total: 0, payoutMethods: [] };
      s.investments = [];
      s.transactions = [];
      s.withdrawals = [];
      s.deposits = [];
      s.referralSummary = { ...s.referralSummary, code: "TUNDE-0193", shareUrl: "https://rentbrown.example/r/TUNDE-0193", referredCount: 0, pendingRewards: 0, qualifiedRewards: 0, earnedRewards: 0 };
      s.referrals = [];
      s.notifications = [
        { id: "n_w1", category: "ANNOUNCEMENTS", title: "Welcome to RentBrown", body: "Start by exploring open opportunities. Verify your email and set a transaction PIN before your first investment.", createdAt: "2026-09-24T09:31:00Z", read: false },
      ];
      return s;
    }
    case "kyc-pending": {
      const s = established();
      s.kyc = clone(kycPending);
      s.notifications.unshift({ id: "n_kyc_p", category: "KYC", title: "Documents received", body: "Your verification documents are under review. We'll notify you when a decision is made.", createdAt: "2026-09-23T17:41:00Z", read: false, link: { kind: "kyc" } });
      return s;
    }
    case "kyc-rejected": {
      const s = established();
      s.kyc = clone(kycRejected);
      s.notifications.unshift({ id: "n_kyc_r", category: "KYC", title: "Verification needs attention", body: "Your address document could not be read. Upload a clearer copy to continue.", createdAt: "2026-09-21T09:16:00Z", read: false, link: { kind: "kyc" } });
      return s;
    }
    case "no-opportunities": {
      const s = established();
      s.roundIds = rounds.filter((r) => r.status === "SOLD_OUT" || r.status === "SCHEDULED").map((r) => r.id);
      return s;
    }
    case "signed-out": {
      const s = established();
      s.signedIn = false;
      return s;
    }
    default:
      return established();
  }
}
