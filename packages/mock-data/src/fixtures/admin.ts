/**
 * Fictional admin/operations fixtures — users, KYC queue, catalogue
 * projections, investments, finance queues, referrals, notifications,
 * policies, audit trail, legal register and reports.
 *
 * Everything here is invented for prototype review. Money is minor units via
 * `naira()`; the anchor "now" is the shared MOCK_NOW (2026-09-24T10:00Z).
 * Catalogue rows are DERIVED from `./catalogue` — never duplicated.
 */
import { ADMIN_ROLE_DEFINITIONS } from "@rentbrown/types";
import type {
  AccountStatus,
  AdminActor,
  AdminDepositRow,
  AdminInvestmentRow,
  AdminKycCase,
  AdminLegalDocument,
  AdminReferralRow,
  AdminTransactionRow,
  AdminUserDetail,
  AdminUserRow,
  AdminWithdrawalRow,
  AuditEvent,
  DeliveryRow,
  KycReviewQueue,
  KycStatus,
  LedgerOverview,
  NotificationTemplate,
  OperationalAlert,
  PolicySet,
  ReconciliationItem,
  ReferralPolicy,
  ReportBundle,
  RewardGrantRow,
  RoleDefinition,
  AdminRole,
  WalletAccountType,
  MinorUnits,
} from "@rentbrown/types";
import { naira } from "@rentbrown/utils";
import { plans, properties, rounds } from "./catalogue";
import { content } from "./content";
import { MOCK_NOW } from "./investor";

export { MOCK_NOW };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const before = (ms: number) => new Date(new Date(MOCK_NOW).getTime() - ms).toISOString();

// ── RBAC ─────────────────────────────────────────────────────────────────────
// Role vocabulary lives in @rentbrown/types (ADMIN_ROLE_DEFINITIONS); the mock
// re-exports it so fixture consumers and real adapters share one source.

export const roleDefinitions: RoleDefinition[] = ADMIN_ROLE_DEFINITIONS;

export const adminActors: Record<AdminRole, AdminActor> = {
  SUPPORT: {
    id: "adm_support",
    displayName: "Kemi O.",
    initials: "KO",
    email: "kemi.o@rentbrown.example",
    roles: ["SUPPORT"],
    permissions: roleDefinitions[0]!.permissions,
  },
  KYC_REVIEWER: {
    id: "adm_kyc",
    displayName: "Amina K.",
    initials: "AK",
    email: "amina.k@rentbrown.example",
    roles: ["KYC_REVIEWER"],
    permissions: roleDefinitions[1]!.permissions,
  },
  OPERATIONS_ADMIN: {
    id: "adm_ops",
    displayName: "Sola D.",
    initials: "SD",
    email: "sola.d@rentbrown.example",
    roles: ["OPERATIONS_ADMIN"],
    permissions: roleDefinitions[2]!.permissions,
  },
  FINANCE_ADMIN: {
    id: "adm_tunde",
    displayName: "Tunde A.",
    initials: "TA",
    email: "tunde.a@rentbrown.example",
    roles: ["FINANCE_ADMIN"],
    permissions: roleDefinitions[3]!.permissions,
  },
  SUPER_ADMIN: {
    id: "adm_super",
    displayName: "Ngozi A.",
    initials: "NA",
    email: "ngozi.a@rentbrown.example",
    roles: ["SUPER_ADMIN"],
    permissions: roleDefinitions[4]!.permissions,
  },
};

// ── Users ────────────────────────────────────────────────────────────────────

/** The non-relational part of a user detail; the data source joins rows. */
export type AdminUserFixture = AdminUserRow & {
  wallet: Record<WalletAccountType, MinorUnits>;
  devices: AdminUserDetail["devices"];
  notes: AdminUserDetail["notes"];
};

const user = (
  id: string,
  displayName: string,
  email: string,
  phone: string,
  accountStatus: AccountStatus,
  kycStatus: KycStatus,
  memberSince: string,
  lastActiveHoursAgo: number,
  activeInvestments: number,
  activePrincipalNaira: number,
  wallet: Record<"AVAILABLE" | "RESERVED" | "BONUS" | "PENDING", number>,
  referralCode: string,
  referredBy: string | null,
  flags: string[] = [],
): AdminUserFixture => ({
  id,
  displayName,
  initials: displayName.split(" ").map((p) => p[0]).slice(0, 2).join(""),
  email,
  phone,
  accountStatus,
  kycStatus,
  memberSince,
  lastActiveAt: before(lastActiveHoursAgo * HOUR),
  activeInvestments,
  activePrincipal: naira(activePrincipalNaira),
  walletAvailable: naira(wallet.AVAILABLE),
  currency: "NGN",
  referralCode,
  referredBy,
  flags,
  wallet: {
    AVAILABLE: naira(wallet.AVAILABLE),
    RESERVED: naira(wallet.RESERVED),
    BONUS: naira(wallet.BONUS),
    PENDING: naira(wallet.PENDING),
  },
  devices: [
    { id: `${id}_dev1`, label: "iPhone 15", platform: "iOS", lastActiveAt: before(lastActiveHoursAgo * HOUR) },
    { id: `${id}_dev2`, label: "Chrome on Windows", platform: "Web", lastActiveAt: before((lastActiveHoursAgo + 30) * HOUR) },
  ],
  notes: [],
});

export const users: AdminUserFixture[] = [
  {
    ...user("usr_ada", "Ada Okafor", "ada.okafor@example.test", "+234 803 555 0142", "ACTIVE", "VERIFIED", "2025-09-10T09:00:00Z", 0.1, 3, 500_000, { AVAILABLE: 146_250, RESERVED: 25_000, BONUS: 15_000, PENDING: 50_000 }, "ADA-4821", null),
    notes: [
      { id: "note_ada_1", author: "Kemi O. (Support)", body: "Called about deposit RB-DP-260924-2210 — confirmed transfer received, awaiting bank confirmation. No action needed.", createdAt: before(1 * HOUR) },
      { id: "note_ada_2", author: "Amina K. (KYC)", body: "Tier 2 verified 15 Sep 2025. Documents clean.", createdAt: "2025-09-15T08:35:00Z" },
    ],
  },
  user("usr_chidi", "Chidi Eze", "chidi.eze@example.test", "+234 805 555 0188", "ACTIVE", "VERIFIED", "2026-08-30T10:00:00Z", 5, 2, 550_000, { AVAILABLE: 84_000, RESERVED: 0, BONUS: 0, PENDING: 0 }, "CHIDI-2210", "ADA-4821"),
  user("usr_mariam", "Mariam Bello", "mariam.bello@example.test", "+234 809 555 0176", "ACTIVE", "VERIFIED", "2026-09-08T10:00:00Z", 2, 2, 2_350_000, { AVAILABLE: 610_000, RESERVED: 500_000, BONUS: 0, PENDING: 0 }, "MARIAM-9034", "ADA-4821", ["high-value"]),
  user("usr_seun", "Seun Ogunleye", "seun.ogunleye@example.test", "+234 802 555 0119", "ACTIVE", "PENDING_REVIEW", "2026-09-19T10:00:00Z", 12, 0, 0, { AVAILABLE: 75_000, RESERVED: 0, BONUS: 0, PENDING: 0 }, "SEUN-6681", "ADA-4821"),
  user("usr_emeka", "Emeka Nwosu", "emeka.nwosu@example.test", "+234 806 555 0127", "ACTIVE", "IN_PROGRESS", "2026-09-21T10:00:00Z", 40, 0, 0, { AVAILABLE: 0, RESERVED: 0, BONUS: 0, PENDING: 0 }, "EMEKA-3350", "ADA-4821"),
  user("usr_bisi", "Bisi Falade", "bisi.falade@example.test", "+234 801 555 0163", "ACTIVE", "NOT_STARTED", "2026-09-22T10:00:00Z", 26, 0, 0, { AVAILABLE: 0, RESERVED: 0, BONUS: 0, PENDING: 0 }, "BISI-7720", "ADA-4821"),
  user("usr_tolu", "Tolu Adeyemi", "tolu.adeyemi@example.test", "+234 807 555 0192", "ACTIVE", "VERIFIED", "2026-06-11T10:00:00Z", 8, 2, 300_000, { AVAILABLE: 92_400, RESERVED: 45_000, BONUS: 4_500, PENDING: 0 }, "TOLU-5507", "ADA-4821"),
  user("usr_ngozi", "Ngozi Umeh", "ngozi.umeh@example.test", "+234 808 555 0145", "ACTIVE", "VERIFIED", "2026-03-22T10:00:00Z", 3, 3, 1_100_000, { AVAILABLE: 258_000, RESERVED: 0, BONUS: 4_000, PENDING: 0 }, "NGOZI-1140", "ADA-4821", ["high-value"]),
  user("usr_ibrahim", "Ibrahim Musa", "ibrahim.musa@example.test", "+234 810 555 0158", "SUSPENDED", "VERIFIED", "2026-01-15T09:00:00Z", 70, 0, 0, { AVAILABLE: 12_500, RESERVED: 0, BONUS: 0, PENDING: 0 }, "IBRAHIM-4402", null, ["chargeback-risk"]),
  user("usr_kunle", "Kunle Ajayi", "kunle.ajayi@example.test", "+234 811 555 0101", "RESTRICTED", "REJECTED", "2026-07-04T09:00:00Z", 95, 0, 0, { AVAILABLE: 3_200, RESERVED: 0, BONUS: 0, PENDING: 0 }, "KUNLE-8823", null, ["doc-mismatch"]),
  user("usr_fatima", "Fatima Abubakar", "fatima.abubakar@example.test", "+234 812 555 0134", "ACTIVE", "PENDING_REVIEW", "2026-09-20T10:00:00Z", 18, 0, 0, { AVAILABLE: 120_000, RESERVED: 0, BONUS: 0, PENDING: 0 }, "FATIMA-2918", "NGOZI-1140"),
  user("usr_obinna", "Obinna Kalu", "obinna.kalu@example.test", "+234 813 555 0177", "ACTIVE", "VERIFIED", "2026-05-19T09:00:00Z", 1, 1, 400_000, { AVAILABLE: 47_800, RESERVED: 0, BONUS: 0, PENDING: 0 }, "OBINNA-6044", "TOLU-5507"),
  user("usr_yetunde", "Yetunde Alabi", "yetunde.alabi@example.test", "+234 814 555 0166", "RESTRICTED", "VERIFIED", "2025-11-02T09:00:00Z", 50, 1, 250_000, { AVAILABLE: 141_000, RESERVED: 0, BONUS: 0, PENDING: 0 }, "YETUNDE-3308", null, ["pep-screen"]),
  user("usr_hadiza", "Hadiza Sule", "hadiza.sule@example.test", "+234 815 555 0120", "ACTIVE", "REJECTED", "2026-09-14T10:00:00Z", 60, 0, 0, { AVAILABLE: 0, RESERVED: 0, BONUS: 0, PENDING: 0 }, "HADIZA-7761", null),
  user("usr_femi", "Femi Adebayo", "femi.adebayo@example.test", "+234 816 555 0189", "ACTIVE", "PENDING_REVIEW", "2026-09-23T10:00:00Z", 9, 0, 0, { AVAILABLE: 60_000, RESERVED: 0, BONUS: 0, PENDING: 0 }, "FEMI-5212", "CHIDI-2210"),
];

// ── KYC review queue ─────────────────────────────────────────────────────────

const kycCase = (
  id: string,
  userId: string,
  status: KycStatus,
  queue: KycReviewQueue,
  submittedAt: string,
  tier: AdminKycCase["tier"],
  documentType: AdminKycCase["documentType"],
  documentNumberMasked: string,
  checks: AdminKycCase["checks"],
  reviewer: string | null,
  decisionNote: string | null,
  ageLabel: string,
  updatedAt = submittedAt,
): AdminKycCase => ({
  id,
  userId,
  userDisplayName: users.find((u) => u.id === userId)?.displayName ?? userId,
  status,
  queue,
  submittedAt,
  updatedAt,
  tier,
  documentType,
  documentNumberMasked,
  checks,
  reviewer,
  decisionNote,
  ageLabel,
});

const chk = (id: string, label: string, status: AdminKycCase["checks"][number]["status"], detail: string) => ({ id, label, status, detail });

export const kycCases: AdminKycCase[] = [
  kycCase("kyc_seun", "usr_seun", "PENDING_REVIEW", "PENDING", before(21 * HOUR), "TIER_2", "NIN", "•••• •••• 4417", [
    chk("c1", "Document authenticity", "PASSED", "NIN slip security features validated."),
    chk("c2", "Face match", "PENDING", "Selfie comparison queued."),
    chk("c3", "Address confirmation", "PENDING", "Utility bill uploaded, not yet reviewed."),
    chk("c4", "Sanctions & PEP screen", "PASSED", "No matches on screening lists."),
  ], null, null, "21h"),
  kycCase("kyc_fatima", "usr_fatima", "PENDING_REVIEW", "PENDING", before(46 * HOUR), "TIER_2", "BVN", "•••• •••• 9022", [
    chk("c1", "Document authenticity", "PASSED", "BVN record matched provided details."),
    chk("c2", "Face match", "PASSED", "98.2% similarity score."),
    chk("c3", "Address confirmation", "PENDING", "Bank statement uploaded."),
    chk("c4", "Sanctions & PEP screen", "PASSED", "No matches on screening lists."),
  ], null, null, "2d"),
  kycCase("kyc_femi", "usr_femi", "PENDING_REVIEW", "PENDING", before(9 * HOUR), "TIER_1", "DRIVERS_LICENCE", "•••• •••• 1150", [
    chk("c1", "Document authenticity", "PASSED", "Licence format validated."),
    chk("c2", "Face match", "MANUAL", "Low-light selfie; needs manual comparison."),
    chk("c3", "Sanctions & PEP screen", "PENDING", "Screening in progress."),
  ], null, null, "9h"),
  kycCase("kyc_kunle", "usr_kunle", "REJECTED", "NEEDS_ACTION", before(6 * DAY), "TIER_2", "PASSPORT", "•••• •••• 0774", [
    chk("c1", "Document authenticity", "FAILED", "Data page glare obscures MRZ; cannot validate."),
    chk("c2", "Face match", "PENDING", "Awaiting acceptable document image."),
    chk("c3", "Address confirmation", "PASSED", "Utility bill verified."),
    chk("c4", "Sanctions & PEP screen", "PASSED", "No matches on screening lists."),
  ], "Amina K.", "Requested a clearer passport photo — MRZ unreadable. Resubmission pending since 18 Sep.", "6d", before(4 * DAY)),
  kycCase("kyc_emeka", "usr_emeka", "IN_PROGRESS", "NEEDS_ACTION", before(3 * DAY), "TIER_1", "NIN", "•••• •••• 6684", [
    chk("c1", "Document authenticity", "PASSED", "NIN slip validated."),
    chk("c2", "Address confirmation", "FAILED", "Utility bill older than 3 months."),
    chk("c3", "Sanctions & PEP screen", "PASSED", "No matches on screening lists."),
  ], "Amina K.", "Requested a recent utility bill (dated within 3 months).", "3d", before(2 * DAY)),
  kycCase("kyc_ada", "usr_ada", "VERIFIED", "VERIFIED", "2025-09-14T10:00:00Z", "TIER_2", "NIN", "•••• •••• 2201", [
    chk("c1", "Document authenticity", "PASSED", "NIN slip security features validated."),
    chk("c2", "Face match", "PASSED", "99.1% similarity score."),
    chk("c3", "Address confirmation", "PASSED", "Bank statement verified."),
    chk("c4", "Sanctions & PEP screen", "PASSED", "No matches on screening lists."),
  ], "Amina K.", "Approved — Tier 2.", "—", "2025-09-15T08:30:00Z"),
  kycCase("kyc_tolu", "usr_tolu", "VERIFIED", "VERIFIED", "2026-06-14T09:00:00Z", "TIER_2", "BVN", "•••• •••• 5518", [
    chk("c1", "Document authenticity", "PASSED", "BVN record matched."),
    chk("c2", "Face match", "PASSED", "97.8% similarity score."),
    chk("c3", "Address confirmation", "PASSED", "Utility bill verified."),
    chk("c4", "Sanctions & PEP screen", "PASSED", "No matches."),
  ], "Amina K.", "Approved — Tier 2.", "—", "2026-06-15T10:20:00Z"),
  kycCase("kyc_ngozi", "usr_ngozi", "VERIFIED", "VERIFIED", "2026-03-25T09:00:00Z", "TIER_2", "PASSPORT", "•••• •••• 3109", [
    chk("c1", "Document authenticity", "PASSED", "Passport validated."),
    chk("c2", "Face match", "PASSED", "98.7% similarity score."),
    chk("c3", "Address confirmation", "PASSED", "Bank statement verified."),
    chk("c4", "Sanctions & PEP screen", "PASSED", "No matches."),
  ], "Tunde A.", "Approved — Tier 2.", "—", "2026-03-26T11:05:00Z"),
  kycCase("kyc_hadiza", "usr_hadiza", "REJECTED", "REJECTED", before(9 * DAY), "TIER_1", "VOTERS_CARD", "•••• •••• 8405", [
    chk("c1", "Document authenticity", "FAILED", "Card appears altered; security print inconsistent."),
    chk("c2", "Face match", "FAILED", "Selfie does not match document photo."),
    chk("c3", "Sanctions & PEP screen", "PASSED", "No matches."),
  ], "Amina K.", "Rejected — document could not be validated. User may resubmit a different document type.", "9d", before(8 * DAY)),
  kycCase("kyc_kunle_prev", "usr_kunle", "REJECTED", "REJECTED", before(52 * DAY), "TIER_1", "NIN", "•••• •••• 0774", [
    chk("c1", "Document authenticity", "FAILED", "Name on NIN slip differs from profile name."),
    chk("c2", "Sanctions & PEP screen", "PASSED", "No matches."),
  ], "Amina K.", "Rejected — name mismatch between document and profile.", "—", before(50 * DAY)),
];

// ── Catalogue projections (derived from ./catalogue — never duplicated) ──────

export interface PropertyAdminFixture {
  status: import("@rentbrown/types").PropertyPublicationStatus;
  updatedAt: string;
}

export const propertyAdminMeta: Record<string, PropertyAdminFixture> = {
  prop_terraces: { status: "PUBLISHED", updatedAt: before(2 * DAY) },
  prop_palm_court: { status: "PUBLISHED", updatedAt: before(1 * DAY) },
  prop_wuse: { status: "PUBLISHED", updatedAt: before(20 * DAY) },
  prop_harbour: { status: "PUBLISHED", updatedAt: before(6 * HOUR) },
  prop_bodija: { status: "PUBLISHED", updatedAt: before(4 * DAY) },
  prop_maitama: { status: "IN_REVIEW", updatedAt: before(12 * HOUR) },
};

/** Investors per round — server-computed in a real backend. */
export const roundInvestors: Record<string, number> = {
  rnd_terraces_2: 118,
  rnd_palm_2: 296,
  rnd_wuse_3: 512,
  rnd_harbour_1: 97,
  rnd_bodija_1: 140,
  rnd_maitama_1: 0,
};

export const planEligibility: Record<string, string[]> = {
  plan_terraces_income: ["KYC Tier 1+", "Nigerian residents"],
  plan_palm_dev: ["KYC Tier 1+", "Nigerian residents"],
  plan_wuse_yield: ["KYC Tier 1+"],
  plan_harbour_shortlet: ["KYC Tier 1+", "Nigerian residents"],
  plan_bodija_yield: ["KYC Tier 1+"],
  plan_maitama_income: ["KYC Tier 2", "Nigerian residents", "Suitability check"],
};

// ── Investments ──────────────────────────────────────────────────────────────

const inv = (
  id: string,
  reference: string,
  userId: string,
  roundId: string,
  slots: number,
  status: AdminInvestmentRow["status"],
  paymentStatus: AdminInvestmentRow["paymentStatus"],
  fundingSource: AdminInvestmentRow["fundingSource"],
  createdAt: string,
  activatedAt: string | null,
  maturesAt: string | null,
  settledAt: string | null,
): AdminInvestmentRow => {
  const round = rounds.find((r) => r.id === roundId);
  const plan = plans.find((p) => p.id === round?.planId);
  const property = properties.find((p) => p.id === plan?.propertyId);
  const slotPrice = plan?.slotPrice ?? 0;
  const roiBps = plan?.roiBps ?? 0;
  const principal = slotPrice * slots;
  const expectedProfit = Math.round((principal * roiBps) / 10_000);
  const u = users.find((x) => x.id === userId);
  return {
    id,
    reference,
    userId,
    userDisplayName: u?.displayName ?? userId,
    propertyId: property?.id ?? "",
    propertyName: property?.name ?? "—",
    planName: plan?.name ?? "—",
    roundId,
    roundNumber: round?.roundNumber ?? 0,
    slots,
    principal,
    expectedProfit,
    maturityValue: principal + expectedProfit,
    currency: "NGN",
    roiBps,
    status,
    paymentStatus,
    fundingSource,
    createdAt,
    activatedAt,
    maturesAt,
    settledAt,
  };
};

export const investments: AdminInvestmentRow[] = [
  inv("inv_terraces_2", "RB-IV-260918-7201", "usr_ada", "rnd_terraces_2", 2, "ACTIVE", "SUCCESSFUL", "WALLET", "2026-09-18T14:20:00Z", "2026-09-18T14:22:00Z", "2027-09-18T14:22:00Z", null),
  inv("inv_palm_2", "RB-IV-260330-2210", "usr_ada", "rnd_palm_2", 5, "ACTIVE", "SUCCESSFUL", "WALLET", "2026-03-30T11:02:00Z", "2026-03-30T11:05:00Z", "2026-12-30T11:05:00Z", null),
  inv("inv_wuse_3", "RB-IV-260502-4418", "usr_ada", "rnd_wuse_3", 5, "MATURITY_DUE", "SUCCESSFUL", "WALLET", "2026-05-02T09:38:00Z", "2026-05-02T09:40:00Z", "2026-11-02T09:40:00Z", null),
  inv("inv_wuse_2", "RB-IV-260228-1134", "usr_ada", "rnd_wuse_3", 3, "COMPLETED", "SUCCESSFUL", "WALLET", "2026-02-28T10:12:00Z", "2026-02-28T10:15:00Z", "2026-08-28T10:15:00Z", "2026-08-28T10:31:00Z"),
  inv("inv_palm_1", "RB-IV-251015-0902", "usr_ada", "rnd_palm_2", 2, "COMPLETED", "SUCCESSFUL", "CARD", "2025-10-15T11:55:00Z", "2025-10-15T12:00:00Z", "2026-07-15T12:00:00Z", "2026-07-15T12:12:00Z"),
  inv("inv_harbour_pending", "RB-IV-260924-8741", "usr_ada", "rnd_harbour_1", 4, "PAYMENT_PENDING", "PENDING", "BANK_TRANSFER", "2026-09-24T09:12:00Z", null, null, null),
  inv("inv_chidi_1", "RB-IV-260902-3311", "usr_chidi", "rnd_terraces_2", 3, "ACTIVE", "SUCCESSFUL", "WALLET", "2026-09-02T10:11:00Z", "2026-09-02T10:14:00Z", "2027-09-02T10:14:00Z", null),
  inv("inv_chidi_2", "RB-IV-260915-8820", "usr_chidi", "rnd_harbour_1", 10, "ACTIVE", "SUCCESSFUL", "BANK_TRANSFER", "2026-09-15T13:40:00Z", "2026-09-16T08:02:00Z", "2027-05-16T08:02:00Z", null),
  inv("inv_mariam_1", "RB-IV-260910-1027", "usr_mariam", "rnd_palm_2", 40, "ACTIVE", "SUCCESSFUL", "BANK_TRANSFER", "2026-09-10T09:30:00Z", "2026-09-10T15:22:00Z", "2027-07-10T15:22:00Z", null),
  inv("inv_mariam_2", "RB-IV-260921-7712", "usr_mariam", "rnd_terraces_2", 4, "REVIEW_REQUIRED", "CONFIRMING", "BANK_TRANSFER", "2026-09-21T16:05:00Z", null, null, null),
  inv("inv_tolu_1", "RB-IV-260618-4410", "usr_tolu", "rnd_wuse_3", 20, "MATURITY_DUE", "SUCCESSFUL", "WALLET", "2026-06-18T12:00:00Z", "2026-06-18T12:04:00Z", "2026-12-18T12:04:00Z", null),
  inv("inv_tolu_2", "RB-IV-260311-2093", "usr_tolu", "rnd_wuse_3", 10, "COMPLETED", "SUCCESSFUL", "WALLET", "2026-03-11T09:00:00Z", "2026-03-11T09:02:00Z", "2026-09-11T09:02:00Z", "2026-09-11T09:20:00Z"),
  inv("inv_ngozi_1", "RB-IV-260410-5581", "usr_ngozi", "rnd_palm_2", 12, "ACTIVE", "SUCCESSFUL", "BANK_TRANSFER", "2026-04-10T10:20:00Z", "2026-04-10T14:11:00Z", "2027-01-10T14:11:00Z", null),
  inv("inv_ngozi_2", "RB-IV-260822-9044", "usr_ngozi", "rnd_terraces_2", 5, "ACTIVE", "SUCCESSFUL", "WALLET", "2026-08-22T11:45:00Z", "2026-08-22T11:48:00Z", "2027-08-22T11:48:00Z", null),
  inv("inv_obinna_1", "RB-IV-260701-3345", "usr_obinna", "rnd_palm_2", 8, "ACTIVE", "SUCCESSFUL", "CARD", "2026-07-01T15:30:00Z", "2026-07-01T15:33:00Z", "2027-04-01T15:33:00Z", null),
  inv("inv_yetunde_1", "RB-IV-260125-6610", "usr_yetunde", "rnd_wuse_3", 25, "SETTLING", "SUCCESSFUL", "WALLET", "2026-01-25T10:00:00Z", "2026-01-25T10:03:00Z", "2026-07-25T10:03:00Z", null),
  inv("inv_ibrahim_1", "RB-IV-260208-1199", "usr_ibrahim", "rnd_wuse_3", 10, "REFUNDED", "REFUNDED", "CARD", "2026-02-08T13:20:00Z", null, null, "2026-02-12T09:00:00Z"),
  inv("inv_kunle_1", "RB-IV-260911-0027", "usr_kunle", "rnd_harbour_1", 2, "FAILED", "FAILED", "CARD", "2026-09-11T18:44:00Z", null, null, null),
];

// ── Deposits ─────────────────────────────────────────────────────────────────

const dep = (
  id: string,
  reference: string,
  userId: string,
  amountNaira: number,
  method: AdminDepositRow["method"],
  status: AdminDepositRow["status"],
  channelLabel: string,
  createdAt: string,
  creditedAt: string | null,
): AdminDepositRow => ({
  id,
  reference,
  userId,
  userDisplayName: users.find((u) => u.id === userId)?.displayName ?? userId,
  amount: naira(amountNaira),
  fee: 0,
  currency: "NGN",
  method,
  status,
  channelLabel,
  createdAt,
  creditedAt,
});

export const deposits: AdminDepositRow[] = [
  dep("dep_02", "RB-DP-260924-2210", "usr_ada", 50_000, "BANK_TRANSFER", "CONFIRMING", "Bank transfer · Providus", "2026-09-24T08:45:00Z", null),
  dep("dep_01", "RB-DP-260920-1842", "usr_ada", 250_000, "BANK_TRANSFER", "CREDITED", "Bank transfer · Providus", "2026-09-20T13:02:00Z", "2026-09-20T13:10:00Z"),
  dep("dep_chidi_1", "RB-DP-260830-5531", "usr_chidi", 500_000, "BANK_TRANSFER", "CREDITED", "Bank transfer · Providus", "2026-08-30T11:20:00Z", "2026-08-30T11:31:00Z"),
  dep("dep_mariam_1", "RB-DP-260909-7714", "usr_mariam", 2_000_000, "BANK_TRANSFER", "CREDITED", "Bank transfer · Providus", "2026-09-09T10:05:00Z", "2026-09-09T10:22:00Z"),
  dep("dep_seun_1", "RB-DP-260923-9010", "usr_seun", 75_000, "BANK_TRANSFER", "AWAITING_TRANSFER", "Bank transfer · Providus", "2026-09-23T19:40:00Z", null),
  dep("dep_fatima_1", "RB-DP-260922-1145", "usr_fatima", 120_000, "BANK_TRANSFER", "CONFIRMING", "Bank transfer · Providus", "2026-09-22T08:15:00Z", null),
  dep("dep_femi_1", "RB-DP-260924-3388", "usr_femi", 60_000, "BANK_TRANSFER", "AWAITING_TRANSFER", "Bank transfer · Providus", "2026-09-24T07:58:00Z", null),
  dep("dep_kunle_1", "RB-DP-260911-4502", "usr_kunle", 40_000, "CARD", "FAILED", "Debit card · •••• 8810", "2026-09-11T18:40:00Z", null),
  dep("dep_obinna_1", "RB-DP-260628-6611", "usr_obinna", 300_000, "BANK_TRANSFER", "CREDITED", "Bank transfer · Providus", "2026-06-28T09:10:00Z", "2026-06-28T09:19:00Z"),
  dep("dep_ngozi_1", "RB-DP-260405-2280", "usr_ngozi", 800_000, "BANK_TRANSFER", "CREDITED", "Bank transfer · Providus", "2026-04-05T10:00:00Z", "2026-04-05T10:14:00Z"),
  dep("dep_bisi_1", "RB-DP-260922-7130", "usr_bisi", 30_000, "BANK_TRANSFER", "EXPIRED", "Bank transfer · Providus", "2026-09-22T21:12:00Z", null),
  dep("dep_tolu_1", "RB-DP-260610-8841", "usr_tolu", 150_000, "CARD", "CREDITED", "Debit card · •••• 3354", "2026-06-10T14:22:00Z", "2026-06-10T14:22:30Z"),
];

// ── Withdrawals ──────────────────────────────────────────────────────────────

const wd = (
  id: string,
  reference: string,
  userId: string,
  amountNaira: number,
  feeNaira: number,
  destinationLabel: string,
  status: AdminWithdrawalRow["status"],
  riskFlags: string[],
  requestedAt: string,
  reviewedBy: string | null,
  reviewedAt: string | null,
  paidAt: string | null,
): AdminWithdrawalRow => ({
  id,
  reference,
  userId,
  userDisplayName: users.find((u) => u.id === userId)?.displayName ?? userId,
  amount: naira(amountNaira),
  fee: naira(feeNaira),
  netAmount: naira(amountNaira - feeNaira),
  currency: "NGN",
  destinationLabel,
  status,
  kycStatus: users.find((u) => u.id === userId)?.kycStatus ?? "NOT_STARTED",
  riskFlags,
  requestedAt,
  reviewedBy,
  reviewedAt,
  paidAt,
});

export const withdrawals: AdminWithdrawalRow[] = [
  wd("wd_03", "RB-WD-260911-4410", "usr_ada", 25_000, 1_250, "GTBank •••• 0123", "UNDER_REVIEW", [], "2026-09-11T16:02:00Z", null, null, null),
  wd("wd_02", "RB-WD-260812-3301", "usr_ada", 50_000, 2_500, "GTBank •••• 0123", "COMPLETED", [], "2026-08-12T11:20:00Z", "Tunde A.", "2026-08-12T15:10:00Z", "2026-08-13T09:05:00Z"),
  wd("wd_01", "RB-WD-260303-1188", "usr_ada", 20_000, 1_000, "Zenith Bank •••• 5521", "REJECTED", ["unverified-destination"], "2026-03-03T15:44:00Z", "Tunde A.", "2026-03-04T10:02:00Z", null),
  wd("wd_mariam_1", "RB-WD-260923-6610", "usr_mariam", 500_000, 10_000, "Access Bank •••• 2291", "UNDER_REVIEW", ["high-value", "first-withdrawal"], "2026-09-23T12:20:00Z", null, null, null),
  wd("wd_ibrahim_1", "RB-WD-260922-3355", "usr_ibrahim", 75_000, 3_750, "FCMB •••• 7451", "REQUESTED", ["chargeback-risk", "velocity", "account-suspended"], "2026-09-22T09:05:00Z", null, null, null),
  wd("wd_yetunde_1", "RB-WD-260921-4471", "usr_yetunde", 120_000, 6_000, "Union Bank •••• 3310", "REQUESTED", ["pep-screen"], "2026-09-21T14:48:00Z", null, null, null),
  wd("wd_ngozi_1", "RB-WD-260920-8845", "usr_ngozi", 200_000, 10_000, "Zenith Bank •••• 9917", "APPROVED", [], "2026-09-20T10:32:00Z", "Tunde A.", "2026-09-20T16:12:00Z", null),
  wd("wd_tolu_1", "RB-WD-260919-2231", "usr_tolu", 45_000, 2_250, "GTBank •••• 6642", "PROCESSING", [], "2026-09-19T11:15:00Z", "Tunde A.", "2026-09-19T15:40:00Z", null),
  wd("wd_obinna_1", "RB-WD-260905-1180", "usr_obinna", 30_000, 1_500, "Access Bank •••• 4470", "COMPLETED", [], "2026-09-05T09:00:00Z", "Tunde A.", "2026-09-05T11:22:00Z", "2026-09-05T14:03:00Z"),
  wd("wd_kunle_1", "RB-WD-260710-5560", "usr_kunle", 15_000, 750, "Sterling Bank •••• 2084", "REJECTED", ["doc-mismatch", "kyc-not-verified"], "2026-07-10T13:30:00Z", "Tunde A.", "2026-07-10T16:45:00Z", null),
  wd("wd_chidi_1", "RB-WD-260902-9902", "usr_chidi", 60_000, 3_000, "GTBank •••• 5520", "FAILED", [], "2026-09-02T15:10:00Z", "Tunde A.", "2026-09-02T17:00:00Z", null),
];

// ── Ledger transactions ──────────────────────────────────────────────────────

const tx = (
  id: string,
  reference: string,
  userId: string,
  type: AdminTransactionRow["type"],
  status: AdminTransactionRow["status"],
  direction: AdminTransactionRow["direction"],
  account: WalletAccountType,
  amountNaira: number,
  occurredAt: string,
  reversesId: string | null = null,
): AdminTransactionRow => ({
  id,
  reference,
  userId,
  userDisplayName: users.find((u) => u.id === userId)?.displayName ?? userId,
  type,
  status,
  direction,
  account,
  amount: naira(amountNaira),
  currency: "NGN",
  occurredAt,
  reversesId,
});

export const transactions: AdminTransactionRow[] = [
  tx("tx_a01", "RB-DP-260924-2210", "usr_ada", "DEPOSIT", "PENDING", "CREDIT", "PENDING", 50_000, "2026-09-24T08:45:00Z"),
  tx("tx_a02", "RB-IV-260924-8741", "usr_ada", "INVESTMENT", "PENDING", "DEBIT", "AVAILABLE", 100_000, "2026-09-24T09:12:00Z"),
  tx("tx_a03", "RB-DP-260920-1842", "usr_ada", "DEPOSIT", "SUCCESSFUL", "CREDIT", "AVAILABLE", 250_000, "2026-09-20T13:10:00Z"),
  tx("tx_a04", "RB-IV-260918-7201", "usr_ada", "INVESTMENT", "SUCCESSFUL", "DEBIT", "AVAILABLE", 200_000, "2026-09-18T14:22:00Z"),
  tx("tx_a05", "RB-RF-260915-0821", "usr_ada", "REFERRAL_REWARD", "SUCCESSFUL", "CREDIT", "BONUS", 1_500, "2026-09-15T09:00:00Z"),
  tx("tx_a06", "RB-WD-260911-4410", "usr_ada", "WITHDRAWAL", "UNDER_REVIEW", "DEBIT", "RESERVED", 25_000, "2026-09-11T16:02:00Z"),
  tx("tx_m01", "RB-WD-260923-6610", "usr_mariam", "WITHDRAWAL", "UNDER_REVIEW", "DEBIT", "RESERVED", 500_000, "2026-09-23T12:20:00Z"),
  tx("tx_m02", "RB-DP-260909-7714", "usr_mariam", "DEPOSIT", "SUCCESSFUL", "CREDIT", "AVAILABLE", 2_000_000, "2026-09-09T10:22:00Z"),
  tx("tx_m03", "RB-IV-260910-1027", "usr_mariam", "INVESTMENT", "SUCCESSFUL", "DEBIT", "AVAILABLE", 2_000_000, "2026-09-10T15:22:00Z"),
  tx("tx_c01", "RB-IV-260915-8820", "usr_chidi", "INVESTMENT", "SUCCESSFUL", "DEBIT", "AVAILABLE", 250_000, "2026-09-16T08:02:00Z"),
  tx("tx_c02", "RB-DP-260830-5531", "usr_chidi", "DEPOSIT", "SUCCESSFUL", "CREDIT", "AVAILABLE", 500_000, "2026-08-30T11:31:00Z"),
  tx("tx_n01", "RB-WD-260920-8845", "usr_ngozi", "WITHDRAWAL", "UNDER_REVIEW", "DEBIT", "RESERVED", 200_000, "2026-09-20T10:32:00Z"),
  tx("tx_n02", "RB-IV-260822-9044", "usr_ngozi", "INVESTMENT", "SUCCESSFUL", "DEBIT", "AVAILABLE", 500_000, "2026-08-22T11:48:00Z"),
  tx("tx_t01", "RB-WD-260919-2231", "usr_tolu", "WITHDRAWAL", "UNDER_REVIEW", "DEBIT", "RESERVED", 45_000, "2026-09-19T11:15:00Z"),
  tx("tx_t02", "RB-WD-260919-2231-F", "usr_tolu", "WITHDRAWAL_FEE", "PENDING", "DEBIT", "RESERVED", 2_250, "2026-09-19T11:15:00Z"),
  // Reversal pair: an erroneous duplicate credit corrected by a new entry.
  tx("tx_o01", "RB-DP-260917-4410", "usr_obinna", "DEPOSIT", "REVERSED", "CREDIT", "AVAILABLE", 50_000, "2026-09-17T10:05:00Z"),
  tx("tx_o02", "RB-RV-260917-4410", "usr_obinna", "REVERSAL", "SUCCESSFUL", "DEBIT", "AVAILABLE", 50_000, "2026-09-17T10:40:00Z", "tx_o01"),
  tx("tx_a07", "RB-MT-260828-1134", "usr_ada", "MATURITY_PRINCIPAL", "SUCCESSFUL", "CREDIT", "AVAILABLE", 30_000, "2026-08-28T10:31:00Z"),
  tx("tx_a08", "RB-MT-260828-1134-P", "usr_ada", "MATURITY_PROFIT", "SUCCESSFUL", "CREDIT", "AVAILABLE", 3_750, "2026-08-28T10:31:00Z"),
  tx("tx_a09", "RB-WD-260812-3301", "usr_ada", "WITHDRAWAL", "SUCCESSFUL", "DEBIT", "AVAILABLE", 50_000, "2026-08-12T11:20:00Z"),
  tx("tx_a10", "RB-WD-260812-3301-F", "usr_ada", "WITHDRAWAL_FEE", "SUCCESSFUL", "DEBIT", "AVAILABLE", 2_500, "2026-08-12T11:20:00Z"),
  tx("tx_y01", "RB-WD-260921-4471", "usr_yetunde", "WITHDRAWAL", "UNDER_REVIEW", "DEBIT", "RESERVED", 120_000, "2026-09-21T14:48:00Z"),
];

// ── Reconciliation ───────────────────────────────────────────────────────────

export const reconciliationItems: ReconciliationItem[] = [
  { id: "rec_01", source: "BANK_STATEMENT", externalReference: "NIP-0923-88124", ledgerReference: null, amount: naira(180_000), currency: "NGN", status: "UNMATCHED", note: "Bank credit with no matching deposit intent; reference does not parse.", detectedAt: before(20 * HOUR) },
  { id: "rec_02", source: "BANK_STATEMENT", externalReference: "NIP-0923-77190", ledgerReference: null, amount: naira(45_500), currency: "NGN", status: "UNMATCHED", note: "Credit narrated 'EMEKA N' — likely dep without intent.", detectedAt: before(22 * HOUR) },
  { id: "rec_03", source: "BANK_STATEMENT", externalReference: "NIP-0924-00318", ledgerReference: null, amount: naira(60_000), currency: "NGN", status: "INVESTIGATING", note: "Amount matches dep_femi_1; confirming payer name.", detectedAt: before(4 * HOUR) },
  { id: "rec_04", source: "LEDGER", externalReference: "dep_fatima_1", ledgerReference: "RB-DP-260922-1145", amount: naira(120_000), currency: "NGN", status: "INVESTIGATING", note: "Deposit intent confirming >36h; checking bank side.", detectedAt: before(6 * HOUR) },
  { id: "rec_05", source: "BANK_STATEMENT", externalReference: "NIP-0922-55671", ledgerReference: "RB-DP-260922-1145", amount: naira(120_000), currency: "NGN", status: "MATCHED", note: "Auto-matched on reference.", detectedAt: before(2 * DAY) },
  { id: "rec_06", source: "CARD_PROCESSOR", externalReference: "PSV-61002-0911", ledgerReference: "RB-DP-260911-4502", amount: naira(40_000), currency: "NGN", status: "MATCHED", note: "Card charge failed → deposit failed.", detectedAt: before(13 * DAY) },
  { id: "rec_07", source: "BANK_STATEMENT", externalReference: "NIP-0905-31207", ledgerReference: "RB-WD-260905-1180", amount: naira(28_500), currency: "NGN", status: "MATCHED", note: "Payout debit matched to withdrawal.", detectedAt: before(19 * DAY) },
  { id: "rec_08", source: "BANK_STATEMENT", externalReference: "NIP-0917-12044", ledgerReference: "RB-DP-260917-4410", amount: naira(50_000), currency: "NGN", status: "RESOLVED", note: "Duplicate credit reversed (tx_o02). Resolved by Tunde A.", detectedAt: before(7 * DAY) },
  { id: "rec_09", source: "CARD_PROCESSOR", externalReference: "PSV-40421-0902", ledgerReference: "RB-WD-260902-9902", amount: naira(57_000), currency: "NGN", status: "RESOLVED", note: "Payout returned by bank; withdrawal marked failed.", detectedAt: before(22 * DAY) },
  { id: "rec_10", source: "BANK_STATEMENT", externalReference: "NIP-0923-99261", ledgerReference: null, amount: naira(500_000), currency: "NGN", status: "UNMATCHED", note: "Large credit; narration matches no open intent.", detectedAt: before(9 * HOUR) },
];

// ── Referrals & rewards ──────────────────────────────────────────────────────

export const referralPolicy: ReferralPolicy = {
  version: "2026-09-v1",
  currency: "NGN",
  signupReward: naira(1_500),
  qualifyingDeposit: naira(50_000),
  depositReferralBps: 100,
  depositReferralCap: naira(10_000),
  qualificationRule: "Referred user completes identity verification and makes a first deposit of ₦50,000 or more.",
};

const ref = (
  id: string,
  referrerId: string,
  referredId: string,
  attributedAt: string,
  status: AdminReferralRow["status"],
  qualifiedAt: string | null,
  flags: string[] = [],
  referredName?: string,
): AdminReferralRow => ({
  id,
  referrerId,
  referrerName: users.find((u) => u.id === referrerId)?.displayName ?? referrerId,
  referredId,
  referredName: referredName ?? users.find((u) => u.id === referredId)?.displayName ?? referredId,
  codeSnapshot: users.find((u) => u.id === referrerId)?.referralCode ?? "—",
  attributedAt,
  status,
  qualifiedAt,
  flags,
});

export const referrals: AdminReferralRow[] = [
  ref("ref_chidi", "usr_ada", "usr_chidi", "2026-08-30T10:00:00Z", "CREDITED", "2026-09-15T08:30:00Z"),
  ref("ref_mariam", "usr_ada", "usr_mariam", "2026-09-08T10:00:00Z", "QUALIFIED", "2026-09-10T09:00:00Z"),
  ref("ref_seun", "usr_ada", "usr_seun", "2026-09-19T10:00:00Z", "PENDING", null),
  ref("ref_tolu", "usr_ada", "usr_tolu", "2026-06-11T10:00:00Z", "CREDITED", "2026-07-01T12:00:00Z"),
  ref("ref_ngozi", "usr_ada", "usr_ngozi", "2026-03-22T10:00:00Z", "CREDITED", "2026-04-11T12:00:00Z"),
  ref("ref_emeka", "usr_ada", "usr_emeka", "2026-09-21T10:00:00Z", "JOINED", null),
  ref("ref_bisi", "usr_ada", "usr_bisi", "2026-09-22T10:00:00Z", "JOINED", null),
  ref("ref_dup", "usr_ada", "usr_dup", "2026-05-05T10:00:00Z", "DISQUALIFIED", null, ["duplicate-account", "self-referral-suspected"], "K. Okafor"),
  ref("ref_obinna", "usr_tolu", "usr_obinna", "2026-05-19T09:00:00Z", "CREDITED", "2026-06-28T09:30:00Z"),
  ref("ref_fatima", "usr_ngozi", "usr_fatima", "2026-09-20T10:00:00Z", "PENDING", null),
  ref("ref_femi", "usr_chidi", "usr_femi", "2026-09-23T10:00:00Z", "JOINED", null),
];

const grant = (
  id: string,
  referralId: string,
  kind: RewardGrantRow["kind"],
  amountNaira: number,
  status: RewardGrantRow["status"],
  createdAt: string,
  creditedAt: string | null,
  note: string,
): RewardGrantRow => {
  const r = referrals.find((x) => x.id === referralId);
  return {
    id,
    referralId,
    referrerName: r?.referrerName ?? "—",
    referredName: r?.referredName ?? "—",
    kind,
    amount: naira(amountNaira),
    currency: "NGN",
    status,
    createdAt,
    creditedAt,
    note,
  };
};

export const rewardGrants: RewardGrantRow[] = [
  grant("gr_01", "ref_chidi", "SIGNUP", 1_500, "CREDITED", "2026-09-15T08:35:00Z", "2026-09-15T09:00:00Z", "Qualified: verified + ₦500,000 first deposit."),
  grant("gr_02", "ref_chidi", "DEPOSIT", 5_000, "CREDITED", "2026-09-15T08:35:00Z", "2026-09-15T09:00:00Z", "1% of ₦500,000 qualifying deposit."),
  grant("gr_03", "ref_tolu", "SIGNUP", 1_500, "CREDITED", "2026-07-01T12:05:00Z", "2026-07-02T09:00:00Z", "Qualified under policy 2026-09-v1."),
  grant("gr_04", "ref_tolu", "DEPOSIT", 3_000, "CREDITED", "2026-07-01T12:05:00Z", "2026-07-02T09:00:00Z", "1% of ₦300,000 qualifying deposit."),
  grant("gr_05", "ref_ngozi", "SIGNUP", 1_500, "CREDITED", "2026-04-11T12:10:00Z", "2026-04-12T09:00:00Z", "Qualified under policy 2026-09-v1."),
  grant("gr_06", "ref_ngozi", "DEPOSIT", 2_500, "CREDITED", "2026-04-11T12:10:00Z", "2026-04-12T09:00:00Z", "1% of ₦250,000 qualifying deposit."),
  grant("gr_07", "ref_mariam", "SIGNUP", 1_500, "QUALIFIED", "2026-09-10T09:00:00Z", null, "Qualified — credits on next payout run."),
  grant("gr_08", "ref_mariam", "DEPOSIT", 10_000, "QUALIFIED", "2026-09-10T09:00:00Z", null, "1% of ₦2,000,000 — hit ₦10,000 per-user cap."),
  grant("gr_09", "ref_seun", "SIGNUP", 1_500, "PENDING", "2026-09-19T10:00:00Z", null, "Awaiting verification and qualifying deposit."),
  grant("gr_10", "ref_fatima", "SIGNUP", 1_500, "PENDING", "2026-09-20T10:00:00Z", null, "Awaiting verification and qualifying deposit."),
  grant("gr_11", "ref_obinna", "SIGNUP", 1_500, "CREDITED", "2026-06-28T09:35:00Z", "2026-06-28T09:50:00Z", "Qualified under policy 2026-09-v1."),
  grant("gr_12", "ref_obinna", "DEPOSIT", 3_000, "REVERSED", "2026-06-28T09:35:00Z", null, "Reversed — qualifying deposit refunded."),
  grant("gr_13", "ref_dup", "SIGNUP", 1_500, "BLOCKED", "2026-05-05T10:00:00Z", null, "Blocked — duplicate-account flag on referral."),
];

// ── Notifications (operations view) ─────────────────────────────────────────

export const notificationTemplates: NotificationTemplate[] = [
  { id: "tpl_01", key: "deposit.credited", category: "MONEY", title: "Deposit credited", body: "Your deposit of {{amount}} has been credited to your available balance.", channels: ["IN_APP", "PUSH", "EMAIL"], status: "ACTIVE", updatedAt: before(30 * DAY) },
  { id: "tpl_02", key: "withdrawal.under_review", category: "MONEY", title: "Withdrawal under review", body: "Your withdrawal of {{amount}} is under review. Funds are reserved until it completes.", channels: ["IN_APP", "PUSH"], status: "ACTIVE", updatedAt: before(30 * DAY) },
  { id: "tpl_03", key: "withdrawal.completed", category: "MONEY", title: "Withdrawal paid", body: "{{netAmount}} has been sent to {{destination}}.", channels: ["IN_APP", "PUSH", "EMAIL"], status: "ACTIVE", updatedAt: before(12 * DAY) },
  { id: "tpl_04", key: "kyc.approved", category: "KYC", title: "Verification approved", body: "Your identity verification was approved. Withdrawals are now available.", channels: ["IN_APP", "PUSH", "EMAIL"], status: "ACTIVE", updatedAt: before(40 * DAY) },
  { id: "tpl_05", key: "kyc.action_required", category: "KYC", title: "Verification needs attention", body: "We couldn't accept one of your documents. {{reason}}", channels: ["IN_APP", "EMAIL"], status: "ACTIVE", updatedAt: before(9 * DAY) },
  { id: "tpl_06", key: "round.opened", category: "INVESTMENTS", title: "New round open", body: "{{property}} Round {{round}} is open — {{slotPrice}} per slot.", channels: ["IN_APP", "PUSH"], status: "DRAFT", updatedAt: before(2 * DAY) },
  { id: "tpl_07", key: "maturity.approaching", category: "INVESTMENTS", title: "Maturity approaching", body: "{{property}} matures in {{days}} days.", channels: ["IN_APP"], status: "ACTIVE", updatedAt: before(20 * DAY) },
  { id: "tpl_08", key: "referral.reward", category: "REFERRALS", title: "Referral reward credited", body: "{{amount}} for {{referred}} has been credited to your bonus balance.", channels: ["IN_APP", "PUSH"], status: "ACTIVE", updatedAt: before(15 * DAY) },
  { id: "tpl_09", key: "security.new_device", category: "SECURITY", title: "New sign-in", body: "New sign-in from {{device}}. If this was not you, review your devices.", channels: ["IN_APP", "EMAIL"], status: "ACTIVE", updatedAt: before(60 * DAY) },
  { id: "tpl_10", key: "announcement.maintenance", category: "ANNOUNCEMENTS", title: "Scheduled maintenance", body: "RentBrown will be unavailable {{window}} for maintenance.", channels: ["EMAIL"], status: "DISABLED", updatedAt: before(90 * DAY) },
];

export const deliveries: DeliveryRow[] = [
  { id: "dlv_01", templateKey: "deposit.credited", userDisplayName: "Ada Okafor", channel: "IN_APP", status: "DELIVERED", sentAt: "2026-09-24T08:47:00Z", error: null },
  { id: "dlv_02", templateKey: "deposit.credited", userDisplayName: "Ada Okafor", channel: "PUSH", status: "DELIVERED", sentAt: "2026-09-24T08:47:00Z", error: null },
  { id: "dlv_03", templateKey: "maturity.approaching", userDisplayName: "Ada Okafor", channel: "IN_APP", status: "DELIVERED", sentAt: "2026-09-24T07:00:00Z", error: null },
  { id: "dlv_04", templateKey: "withdrawal.under_review", userDisplayName: "Mariam Bello", channel: "PUSH", status: "DELIVERED", sentAt: "2026-09-23T12:21:00Z", error: null },
  { id: "dlv_05", templateKey: "kyc.action_required", userDisplayName: "Emeka Nwosu", channel: "EMAIL", status: "DELIVERED", sentAt: "2026-09-22T09:10:00Z", error: null },
  { id: "dlv_06", templateKey: "kyc.action_required", userDisplayName: "Emeka Nwosu", channel: "IN_APP", status: "DELIVERED", sentAt: "2026-09-22T09:10:00Z", error: null },
  { id: "dlv_07", templateKey: "referral.reward", userDisplayName: "Ada Okafor", channel: "PUSH", status: "FAILED", sentAt: "2026-09-15T09:01:00Z", error: "Device token expired" },
  { id: "dlv_08", templateKey: "referral.reward", userDisplayName: "Ada Okafor", channel: "IN_APP", status: "DELIVERED", sentAt: "2026-09-15T09:01:00Z", error: null },
  { id: "dlv_09", templateKey: "security.new_device", userDisplayName: "Ada Okafor", channel: "EMAIL", status: "DELIVERED", sentAt: "2026-09-09T19:22:00Z", error: null },
  { id: "dlv_10", templateKey: "round.opened", userDisplayName: "Ngozi Umeh", channel: "PUSH", status: "QUEUED", sentAt: "2026-09-24T09:58:00Z", error: null },
  { id: "dlv_11", templateKey: "withdrawal.completed", userDisplayName: "Obinna Kalu", channel: "EMAIL", status: "DELIVERED", sentAt: "2026-09-05T14:04:00Z", error: null },
  { id: "dlv_12", templateKey: "deposit.credited", userDisplayName: "Chidi Eze", channel: "EMAIL", status: "SENT", sentAt: "2026-08-30T11:32:00Z", error: null },
];

// ── Policies ─────────────────────────────────────────────────────────────────

export const policySet: PolicySet = {
  version: "policy-2026-09",
  effectiveFrom: "2026-09-01T00:00:00Z",
  parameters: [
    { key: "wallet.withdrawal_fee_bps", label: "Withdrawal fee", description: "Fee charged on each withdrawal, in basis points.", value: 500, format: "bps", effectiveFrom: "2026-09-01T00:00:00Z", version: "policy-2026-09", lastChangedBy: "Ngozi A. (Super admin)" },
    { key: "wallet.withdrawal_fee_cap", label: "Withdrawal fee cap", description: "Maximum withdrawal fee regardless of amount.", value: naira(10_000), format: "money", currency: "NGN", effectiveFrom: "2026-09-01T00:00:00Z", version: "policy-2026-09", lastChangedBy: "Ngozi A. (Super admin)" },
    { key: "wallet.min_withdrawal", label: "Minimum withdrawal", description: "Smallest amount a user can withdraw.", value: naira(5_000), format: "money", currency: "NGN", effectiveFrom: "2026-09-01T00:00:00Z", version: "policy-2026-09", lastChangedBy: "Ngozi A. (Super admin)" },
    { key: "wallet.min_deposit", label: "Minimum deposit", description: "Smallest deposit intent accepted.", value: naira(1_000), format: "money", currency: "NGN", effectiveFrom: "2026-09-01T00:00:00Z", version: "policy-2026-09", lastChangedBy: "Ngozi A. (Super admin)" },
    { key: "wallet.deposit_fee_bps", label: "Deposit fee", description: "Fee on deposits. Zero at launch.", value: 0, format: "bps", effectiveFrom: "2026-09-01T00:00:00Z", version: "policy-2026-09", lastChangedBy: "Ngozi A. (Super admin)" },
    { key: "referral.signup_reward", label: "Referral signup reward", description: "Fixed bonus credited when a referral qualifies.", value: naira(1_500), format: "money", currency: "NGN", effectiveFrom: "2026-09-15T00:00:00Z", version: "policy-2026-09", lastChangedBy: "Ngozi A. (Super admin)" },
    { key: "referral.qualifying_deposit", label: "Qualifying first deposit", description: "First deposit that qualifies the signup reward.", value: naira(50_000), format: "money", currency: "NGN", effectiveFrom: "2026-09-15T00:00:00Z", version: "policy-2026-09", lastChangedBy: "Ngozi A. (Super admin)" },
    { key: "referral.deposit_bps", label: "Deposit referral rate", description: "Share of each qualifying deposit paid to the referrer.", value: 100, format: "bps", effectiveFrom: "2026-09-15T00:00:00Z", version: "policy-2026-09", lastChangedBy: "Ngozi A. (Super admin)" },
    { key: "referral.deposit_cap", label: "Deposit referral cap", description: "Lifetime cap on deposit rewards per referred user.", value: naira(10_000), format: "money", currency: "NGN", effectiveFrom: "2026-09-15T00:00:00Z", version: "policy-2026-09", lastChangedBy: "Ngozi A. (Super admin)" },
    { key: "investments.max_slots_per_user", label: "Max slots per user", description: "Highest per-user slot limit any plan may set.", value: 500, format: "count", effectiveFrom: "2026-09-01T00:00:00Z", version: "policy-2026-09", lastChangedBy: "Sola D. (Operations)" },
    { key: "kyc.review_sla_hours", label: "KYC review SLA", description: "Target first-review time for pending cases.", value: 24, format: "duration_days", effectiveFrom: "2026-09-01T00:00:00Z", version: "policy-2026-09", lastChangedBy: "Sola D. (Operations)" },
  ],
  pendingProposals: [
    { id: "pp_01", key: "wallet.withdrawal_fee_bps", proposedValue: 350, proposedBy: "Ngozi A. (Super admin)", proposedAt: before(30 * HOUR), status: "PENDING_APPROVAL" },
  ],
};

// ── Audit trail ──────────────────────────────────────────────────────────────

const aud = (
  id: string,
  hoursAgo: number,
  actor: AuditEvent["actor"],
  action: string,
  resourceType: string,
  resourceId: string,
  resourceLabel: string,
  result: AuditEvent["result"],
  summary: string,
): AuditEvent => ({
  id,
  occurredAt: before(hoursAgo * HOUR),
  actor,
  action,
  resource: { type: resourceType, id: resourceId, label: resourceLabel },
  result,
  requestId: `req_${id}`,
  ip: actor.role === "SYSTEM" ? null : "197.210.55.14",
  summary,
});

const tunde = { id: "adm_tunde", displayName: "Tunde A.", role: "FINANCE_ADMIN" as const };
const amina = { id: "adm_kyc", displayName: "Amina K.", role: "KYC_REVIEWER" as const };
const sola = { id: "adm_ops", displayName: "Sola D.", role: "OPERATIONS_ADMIN" as const };
const ngoziA = { id: "adm_super", displayName: "Ngozi A.", role: "SUPER_ADMIN" as const };
const kemi = { id: "adm_support", displayName: "Kemi O.", role: "SUPPORT" as const };
const system = { id: "sys", displayName: "System", role: "SYSTEM" as const };

export const auditEvents: AuditEvent[] = [
  aud("aud_001", 0.5, system, "deposit.received", "deposit", "dep_02", "RB-DP-260924-2210", "SUCCESS", "Bank transfer of ₦50,000 received; deposit set to confirming."),
  aud("aud_002", 1, kemi, "user.note_added", "user", "usr_ada", "Ada Okafor", "SUCCESS", "Support note added after inbound call."),
  aud("aud_003", 4, system, "reconciliation.flagged", "reconciliation", "rec_03", "NIP-0924-00318", "SUCCESS", "Bank credit ₦60,000 flagged for investigation."),
  aud("aud_004", 9, system, "kyc.submitted", "kyc_case", "kyc_femi", "Femi Adebayo", "SUCCESS", "Tier 1 submission received (driver's licence)."),
  aud("aud_005", 12, system, "investment.payment_pending", "investment", "inv_harbour_pending", "RB-IV-260924-8741", "SUCCESS", "Transfer instructions issued for 4 slots · Harbour View Round 1."),
  aud("aud_006", 20, system, "reconciliation.flagged", "reconciliation", "rec_01", "NIP-0923-88124", "SUCCESS", "Unmatched bank credit ₦180,000."),
  aud("aud_007", 22, tunde, "withdrawal.review_started", "withdrawal", "wd_mariam_1", "RB-WD-260923-6610", "SUCCESS", "Opened review of ₦500,000 withdrawal — high-value flag."),
  aud("aud_008", 26, amina, "kyc.requested_info", "kyc_case", "kyc_emeka", "Emeka Nwosu", "SUCCESS", "Requested recent utility bill — uploaded bill older than 3 months."),
  aud("aud_009", 30, ngoziA, "policy.proposed", "policy", "pp_01", "wallet.withdrawal_fee_bps", "SUCCESS", "Proposed lowering withdrawal fee 500 → 350 bps."),
  aud("aud_010", 46, system, "kyc.submitted", "kyc_case", "kyc_fatima", "Fatima Abubakar", "SUCCESS", "Tier 2 submission received (BVN)."),
  aud("aud_011", 70, kemi, "user.viewed", "user", "usr_ibrahim", "Ibrahim Musa", "SUCCESS", "Profile opened from support ticket #4412."),
  aud("aud_012", 74, tunde, "withdrawal.approved", "withdrawal", "wd_ngozi_1", "RB-WD-260920-8845", "SUCCESS", "Approved ₦200,000 to Zenith •••• 9917 — checks passed."),
  aud("aud_013", 96, amina, "kyc.requested_info", "kyc_case", "kyc_kunle", "Kunle Ajayi", "SUCCESS", "Requested clearer passport photo — MRZ unreadable."),
  aud("aud_014", 120, sola, "round.updated", "round", "rnd_bodija_1", "Bodija Gardens R1", "SUCCESS", "Opened Round 1 (3,000 slots @ ₦10,000)."),
  aud("aud_015", 130, tunde, "withdrawal.rejected", "withdrawal", "wd_chidi_1", "RB-WD-260902-9902", "SUCCESS", "Marked failed — payout returned by bank."),
  aud("aud_016", 140, kemi, "user.status_change_attempt", "user", "usr_kunle", "Kunle Ajayi", "DENIED", "Support role lacks users.manage_status."),
  aud("aud_017", 150, system, "reward.credited", "reward_grant", "gr_01", "gr_01", "SUCCESS", "₦1,500 signup reward credited to Ada Okafor."),
  aud("aud_018", 160, tunde, "withdrawal.marked_paid", "withdrawal", "wd_obinna_1", "RB-WD-260905-1180", "SUCCESS", "Confirmed payout ₦28,500 — NIP-0905-31207."),
  aud("aud_019", 190, sola, "notification.template_updated", "notification_template", "tpl_06", "round.opened", "SUCCESS", "Draft copy updated for round-opened template."),
  aud("aud_020", 220, ngoziA, "legal.published", "legal_document", "terms", "Terms of service", "SUCCESS", "Published Prototype v0.3 effective 1 Sep."),
  aud("aud_021", 240, system, "investment.matured", "investment", "inv_yetunde_1", "RB-IV-260125-6610", "SUCCESS", "Maturity reached; settlement started."),
  aud("aud_022", 260, amina, "kyc.rejected", "kyc_case", "kyc_hadiza", "Hadiza Sule", "SUCCESS", "Rejected — document could not be validated."),
  aud("aud_023", 300, system, "reconciliation.resolved", "reconciliation", "rec_08", "NIP-0917-12044", "SUCCESS", "Duplicate ₦50,000 credit reversed."),
  aud("aud_024", 320, tunde, "withdrawal.rejected", "withdrawal", "wd_kunle_1", "RB-WD-260710-5560", "SUCCESS", "Rejected — KYC not verified; funds released."),
  aud("aud_025", 340, sola, "property.updated", "property", "prop_maitama", "Maitama Heights", "SUCCESS", "Moved to IN_REVIEW pending valuation publication."),
  aud("aud_026", 380, system, "reward.blocked", "reward_grant", "gr_13", "gr_13", "SUCCESS", "Signup reward blocked — duplicate-account flag."),
  aud("aud_027", 400, ngoziA, "admin.role_granted", "admin_actor", "adm_kyc", "Amina K.", "SUCCESS", "Granted KYC_REVIEWER role."),
  aud("aud_028", 440, tunde, "finance.invariant_check", "ledger", "ledger", "Daily invariant run", "SUCCESS", "All ledger invariants pass."),
  aud("aud_029", 500, system, "round.sold_out", "round", "rnd_wuse_3", "Wuse Square R3", "SUCCESS", "Round 3 fully subscribed (2,000 slots)."),
  aud("aud_030", 560, kemi, "user.viewed", "user", "usr_yetunde", "Yetunde Alabi", "SUCCESS", "Profile opened — PEP-screen flag review."),
];

// ── Legal register ───────────────────────────────────────────────────────────

export const legalDocuments: AdminLegalDocument[] = content.legal.map((doc, i) => ({
  ...doc,
  status: i === 2 ? "DRAFT" : "PUBLISHED",
  owner: ["Legal — external counsel", "Compliance", "Compliance"][i] ?? "Compliance",
  updatedAt: before((14 + i * 9) * DAY),
}));

// ── Ledger overview ──────────────────────────────────────────────────────────

export const ledgerOverview: LedgerOverview = {
  asOf: MOCK_NOW,
  accounts: [
    { account: "AVAILABLE", label: "Available", total: naira(1_592_650), currency: "NGN", holders: 11 },
    { account: "RESERVED", label: "Reserved", total: naira(920_000), currency: "NGN", holders: 5 },
    { account: "BONUS", label: "Bonus", total: naira(23_500), currency: "NGN", holders: 3 },
    { account: "PENDING", label: "Pending", total: naira(170_000), currency: "NGN", holders: 2 },
  ],
  invariants: [
    { id: "inv_sum", label: "Account totals reconcile", ok: true, detail: "Σ per-account totals equals ledger head (₦2,706,150)." },
    { id: "inv_nonneg", label: "No negative balances", ok: true, detail: "All 15 wallets ≥ 0 across all four accounts." },
    { id: "inv_reserved", label: "Reserved funds are backed", ok: true, detail: "Every RESERVED kobo maps to an open withdrawal or in-flight operation." },
    { id: "inv_reversals", label: "Reversals are linked", ok: true, detail: "All REVERSAL entries reference the entry they correct (1 open pair: tx_o02 → tx_o01)." },
    { id: "inv_pending", label: "Pending deposits have intents", ok: true, detail: "All PENDING funds map to deposit intents in CONFIRMING." },
  ],
  postedToday: 4,
  reversalsToday: 0,
};

// ── Dashboard alerts ─────────────────────────────────────────────────────────

export const alerts: OperationalAlert[] = [
  { id: "al_01", severity: "critical", title: "2 withdrawals waiting over 24h", body: "RB-WD-260922-3355 (₦75,000 · suspended account) and RB-WD-260921-4471 (₦120,000 · PEP screen) need a decision.", href: "/finance/withdrawals", raisedAt: before(2 * HOUR) },
  { id: "al_02", severity: "warning", title: "3 unmatched bank credits", body: "₦285,500 in statement credits have no matching deposit intent.", href: "/finance/reconciliation", raisedAt: before(6 * HOUR) },
  { id: "al_03", severity: "warning", title: "KYC backlog building", body: "3 cases awaiting first review — oldest is 2 days, SLA is 24h.", href: "/kyc", raisedAt: before(10 * HOUR) },
  { id: "al_04", severity: "info", title: "Palm Court Round 2 is 91% allocated", body: "Closes 15 Oct. Consider scheduling the next round or extending.", href: "/rounds", raisedAt: before(1 * DAY) },
];

// ── Reports ──────────────────────────────────────────────────────────────────

const pointsFor = (period: "7d" | "30d" | "90d", base: number[], money = false): { label: string; value: number }[] => {
  const labels =
    period === "7d"
      ? ["18 Sep", "19 Sep", "20 Sep", "21 Sep", "22 Sep", "23 Sep", "24 Sep"]
      : period === "30d"
        ? ["Wk 1", "Wk 2", "Wk 3", "Wk 4"]
        : ["Jul", "Aug", "Sep"];
  return labels.map((label, i) => ({ label, value: money ? naira(base[i % base.length]!) : base[i % base.length]! }));
};

export function reportBundle(period: "7d" | "30d" | "90d"): ReportBundle {
  const scale = period === "7d" ? 1 : period === "30d" ? 4 : 12;
  return {
    asOf: MOCK_NOW,
    period: {
      from: before((period === "7d" ? 7 : period === "30d" ? 30 : 90) * DAY),
      to: MOCK_NOW,
      label: period === "7d" ? "Last 7 days" : period === "30d" ? "Last 30 days" : "Last 90 days",
    },
    series: [
      {
        id: "investments_funded",
        title: "Investments funded",
        description: "Count of investments activated per period.",
        format: "count",
        points: pointsFor(period, [3, 5, 4, 6, 2, 7, 4].map((v) => v * scale)),
      },
      {
        id: "deposits_vs_withdrawals",
        title: "Deposits vs withdrawals",
        description: "Money in vs money out (₦).",
        format: "money",
        currency: "NGN",
        points: pointsFor(period, [1_850_000, 2_400_000, 1_200_000, 2_900_000].map((v) => v * scale), true),
      },
      {
        id: "kyc_decisions",
        title: "KYC decisions",
        description: "Reviews completed per period.",
        format: "count",
        points: pointsFor(period, [4, 2, 5, 3, 6, 4, 2].map((v) => v * scale)),
      },
    ],
    tables: [
      {
        id: "top_properties",
        title: "Top properties by amount raised",
        columns: ["Property", "Open rounds", "Raised (₦)"],
        rows: [
          ["Palm Court, Lekki", 1, naira(54_300_000)],
          ["The Terraces, Ikoyi", 1, naira(33_200_000)],
          ["Wuse Square Residences", 0, naira(20_000_000)],
          ["Harbour View Suites", 1, naira(8_050_000)],
          ["Bodija Gardens", 1, naira(3_400_000)],
        ],
      },
      {
        id: "reward_liability",
        title: "Reward liability by status",
        columns: ["Status", "Grants", "Amount (₦)"],
        rows: [
          ["Pending", 2, naira(3_000)],
          ["Qualified", 2, naira(11_500)],
          ["Credited", 7, naira(17_500)],
          ["Reversed / blocked", 2, naira(4_500)],
        ],
      },
    ],
  };
}
export { properties, plans, rounds, content };
