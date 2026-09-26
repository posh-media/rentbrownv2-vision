/**
 * Admin / Operations read-models and the `AdminDataSource` seam.
 *
 * Same rules as the investor contracts: these are projections a trusted
 * backend produces. The admin client displays them and records INTENT
 * (approve, reject, pause…). It never mutates balances, capacity or status
 * locally. Every mutation carries an idempotency key and is expected to be
 * authorised server-side against the actor's permissions — the `Permission`
 * model below drives UI affordances only, never security.
 */
import type {
  AccountStatus,
  BasisPoints,
  CurrencyCode,
  DepositMethod,
  DepositStatus,
  Duration,
  InvestmentPlanStatus,
  InvestmentRoundStatus,
  InvestmentStatus,
  ISODateString,
  KycStatus,
  LegalDocument,
  MinorUnits,
  NotificationCategory,
  PaymentStatus,
  ProofDocument,
  PropertyLocation,
  ReferralPolicy,
  ReferralRewardKind,
  ReferralStatus,
  TransactionStatus,
  TransactionType,
  WalletAccountType,
  WithdrawalStatus,
} from "./index";

// ── RBAC model (UI-facing; authoritative checks live server-side) ────────────

/** Roles are bundles of permissions. Never branch on a role name in screens — branch on permissions. */
export type AdminRole =
  | "SUPPORT"
  | "KYC_REVIEWER"
  | "OPERATIONS_ADMIN"
  | "FINANCE_ADMIN"
  | "SUPER_ADMIN";

export type Permission =
  | "users.read"
  | "users.manage_status"
  | "kyc.read"
  | "kyc.review"
  | "catalogue.read"
  | "catalogue.manage"
  | "rounds.manage"
  | "investments.read"
  | "finance.read"
  | "finance.review_withdrawals"
  | "finance.reconcile"
  | "referrals.read"
  | "referrals.manage"
  | "notifications.read"
  | "notifications.manage"
  | "policies.read"
  | "policies.propose"
  | "audit.read"
  | "reports.read"
  | "legal.manage"
  | "admin.manage_roles";

export interface AdminActor {
  id: string;
  displayName: string;
  initials: string;
  email: string;
  roles: AdminRole[];
  /** Effective, server-resolved permission set. UI hides/disables on this. */
  permissions: Permission[];
}

export interface RoleDefinition {
  role: AdminRole;
  label: string;
  description: string;
  permissions: Permission[];
}

/** Every permission — vocabulary constant, not data. */
export const ALL_PERMISSIONS: Permission[] = [
  "users.read",
  "users.manage_status",
  "kyc.read",
  "kyc.review",
  "catalogue.read",
  "catalogue.manage",
  "rounds.manage",
  "investments.read",
  "finance.read",
  "finance.review_withdrawals",
  "finance.reconcile",
  "referrals.read",
  "referrals.manage",
  "notifications.read",
  "notifications.manage",
  "policies.read",
  "policies.propose",
  "audit.read",
  "reports.read",
  "legal.manage",
  "admin.manage_roles",
];

/**
 * Canonical role → permission bundles. Phase 2 resolves admin actors from
 * `public.admin_roles` + this map; Phase 10 may move bundles to the database.
 */
export const ADMIN_ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    role: "SUPPORT",
    label: "Support",
    description: "Read-only access across operations screens for customer support. Cannot take actions.",
    permissions: [
      "users.read",
      "kyc.read",
      "catalogue.read",
      "investments.read",
      "finance.read",
      "referrals.read",
      "notifications.read",
      "policies.read",
      "audit.read",
      "reports.read",
    ],
  },
  {
    role: "KYC_REVIEWER",
    label: "KYC reviewer",
    description: "Reviews identity submissions and can approve, reject or request more information.",
    permissions: ["users.read", "kyc.read", "kyc.review"],
  },
  {
    role: "OPERATIONS_ADMIN",
    label: "Operations admin",
    description: "Runs the catalogue, rounds, referrals and notification templates.",
    permissions: [
      "users.read",
      "kyc.read",
      "catalogue.read",
      "catalogue.manage",
      "rounds.manage",
      "investments.read",
      "referrals.read",
      "referrals.manage",
      "notifications.read",
      "notifications.manage",
      "policies.read",
      "reports.read",
    ],
  },
  {
    role: "FINANCE_ADMIN",
    label: "Finance admin",
    description: "Reviews withdrawals, watches reconciliation and reads user/KYC context.",
    permissions: [
      "users.read",
      "kyc.read",
      "investments.read",
      "finance.read",
      "finance.review_withdrawals",
      "finance.reconcile",
      "referrals.read",
      "notifications.read",
      "policies.read",
      "audit.read",
      "reports.read",
    ],
  },
  {
    role: "SUPER_ADMIN",
    label: "Super admin",
    description: "Full access including role management and policy proposals.",
    permissions: ALL_PERMISSIONS,
  },
];

export const ADMIN_PERMISSIONS_BY_ROLE: Record<AdminRole, Permission[]> = Object.fromEntries(
  ADMIN_ROLE_DEFINITIONS.map((d) => [d.role, d.permissions]),
) as Record<AdminRole, Permission[]>;

// ── Common list plumbing ─────────────────────────────────────────────────────

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PageRequest {
  page?: number;
  pageSize?: number;
  query?: string;
  sort?: string;
}

/** Every admin mutation: idempotent, attributable, with an optional reason for the audit trail. */
export interface AdminActionInput {
  idempotencyKey: string;
  reason?: string;
}

export interface AdminActionResult {
  ok: boolean;
  /** Server-assigned reference for the audit log entry produced. */
  auditId: string;
  message: string;
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export interface AdminMetric {
  id: string;
  label: string;
  value: number | MinorUnits;
  format: "count" | "money" | "percent";
  currency?: CurrencyCode;
  /** Optional delta vs. previous period, as displayed by the server. */
  delta?: { value: number; direction: "up" | "down" | "flat"; label: string };
  href?: string;
}

export type AlertSeverity = "info" | "warning" | "critical";

export interface OperationalAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  body: string;
  href: string;
  raisedAt: ISODateString;
}

export interface QueueSummary {
  id: "kyc" | "withdrawals" | "deposits" | "rewards" | "reconciliation";
  label: string;
  pending: number;
  oldestAt: ISODateString | null;
  href: string;
}

export interface AdminDashboard {
  asOf: ISODateString;
  metrics: AdminMetric[];
  queues: QueueSummary[];
  alerts: OperationalAlert[];
  recentActivity: AuditEvent[];
}

// ── Users ────────────────────────────────────────────────────────────────────

export interface AdminUserRow {
  id: string;
  displayName: string;
  initials: string;
  email: string;
  phone: string;
  accountStatus: AccountStatus;
  kycStatus: KycStatus;
  memberSince: ISODateString;
  lastActiveAt: ISODateString;
  activeInvestments: number;
  activePrincipal: MinorUnits;
  walletAvailable: MinorUnits;
  currency: CurrencyCode;
  referralCode: string;
  referredBy: string | null;
  /** Server-applied flags shown as badges (e.g. "pep-screen", "high-value"). */
  flags: string[];
}

export interface AdminUserDetail extends AdminUserRow {
  wallet: Record<WalletAccountType, MinorUnits>;
  investments: AdminInvestmentRow[];
  deposits: AdminDepositRow[];
  withdrawals: AdminWithdrawalRow[];
  referrals: AdminReferralRow[];
  devices: Array<{ id: string; label: string; platform: "iOS" | "Android" | "Web"; lastActiveAt: ISODateString }>;
  notes: Array<{ id: string; author: string; body: string; createdAt: ISODateString }>;
  activity: AuditEvent[];
}

export interface UserFilter extends PageRequest {
  accountStatus?: AccountStatus[];
  kycStatus?: KycStatus[];
}

// ── KYC review ───────────────────────────────────────────────────────────────

export type KycReviewQueue = "PENDING" | "NEEDS_ACTION" | "VERIFIED" | "REJECTED";

export interface KycCheck {
  id: string;
  label: string;
  status: "PASSED" | "FAILED" | "PENDING" | "MANUAL";
  detail: string;
}

export interface AdminKycCase {
  id: string;
  userId: string;
  userDisplayName: string;
  status: KycStatus;
  queue: KycReviewQueue;
  submittedAt: ISODateString;
  updatedAt: ISODateString;
  tier: "TIER_1" | "TIER_2";
  documentType: "NIN" | "BVN" | "PASSPORT" | "DRIVERS_LICENCE" | "VOTERS_CARD";
  /** Redacted display only — no provider payloads. */
  documentNumberMasked: string;
  checks: KycCheck[];
  reviewer: string | null;
  decisionNote: string | null;
  /** How long the case has been waiting, server-formatted. */
  ageLabel: string;
}

export interface KycFilter extends PageRequest {
  queue?: KycReviewQueue;
}

export interface KycDecisionInput extends AdminActionInput {
  caseId: string;
  decision: "APPROVE" | "REJECT" | "REQUEST_MORE_INFO";
  reason: string;
}

// ── Catalogue: properties, plans, rounds ─────────────────────────────────────

export type PropertyPublicationStatus = "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "ARCHIVED";

export interface AdminPropertyRow {
  id: string;
  slug: string;
  name: string;
  type: string;
  location: PropertyLocation;
  status: PropertyPublicationStatus;
  images: string[];
  plans: number;
  openRounds: number;
  totalRaised: MinorUnits;
  currency: CurrencyCode;
  evidenceCount: number;
  evidencePending: number;
  updatedAt: ISODateString;
}

export interface AdminPropertyDetail extends AdminPropertyRow {
  summary: string;
  description: string;
  operator: { name: string; description: string };
  revenueModel: string;
  proofDocuments: ProofDocument[];
  planRows: AdminPlanRow[];
  roundRows: AdminRoundRow[];
  history: AuditEvent[];
}

export interface AdminPlanRow {
  id: string;
  propertyId: string;
  propertyName: string;
  name: string;
  currency: CurrencyCode;
  slotPrice: MinorUnits;
  roiBps: BasisPoints;
  duration: Duration;
  minSlots: number;
  maxSlotsPerUser: number | null;
  investmentFeeBps: BasisPoints;
  /** e.g. "KYC Tier 1", "Nigerian residents" — display strings from server policy. */
  eligibility: string[];
  status: InvestmentPlanStatus;
  rounds: number;
  updatedAt: ISODateString;
}

export interface AdminPlanDetail extends AdminPlanRow {
  terms: string[];
  riskDisclosures: string[];
  roundRows: AdminRoundRow[];
  history: AuditEvent[];
}

export interface AdminRoundRow {
  id: string;
  planId: string;
  planName: string;
  propertyId: string;
  propertyName: string;
  roundNumber: number;
  status: InvestmentRoundStatus;
  totalSlots: number;
  allocatedSlots: number;
  reservedSlots: number;
  availableSlots: number;
  allocatedPct: number;
  slotPrice: MinorUnits;
  raised: MinorUnits;
  currency: CurrencyCode;
  investors: number;
  opensAt: ISODateString;
  closesAt: ISODateString;
  projectedStartAt: ISODateString;
  projectedMaturityAt: ISODateString;
}

export interface RoundFilter extends PageRequest {
  status?: InvestmentRoundStatus[];
  propertyId?: string;
}

// ── Investments ──────────────────────────────────────────────────────────────

export interface AdminInvestmentRow {
  id: string;
  reference: string;
  userId: string;
  userDisplayName: string;
  propertyId: string;
  propertyName: string;
  planName: string;
  roundId: string;
  roundNumber: number;
  slots: number;
  principal: MinorUnits;
  expectedProfit: MinorUnits;
  maturityValue: MinorUnits;
  currency: CurrencyCode;
  roiBps: BasisPoints;
  status: InvestmentStatus;
  paymentStatus: PaymentStatus;
  fundingSource: "WALLET" | "BANK_TRANSFER" | "CARD";
  createdAt: ISODateString;
  activatedAt: ISODateString | null;
  maturesAt: ISODateString | null;
  settledAt: ISODateString | null;
  /** Phase 6B extras — present when the real detail RPC provides them. */
  paymentReference?: string | null;
  /** Catalogue provenance marker, e.g. "p6-catalogue-fixtures" for test data. */
  seedTag?: string | null;
  /** Append-only lifecycle events for the detail timeline. */
  events?: AdminInvestmentEvent[];
  /** Funding journals linked to this position (HOLD, INVESTMENT_DEBIT…). */
  journals?: Array<{ reference: string; journalType: string; createdAt: ISODateString }>;
}

export interface AdminInvestmentEvent {
  id: string;
  type: string;
  label: string;
  at: ISODateString;
  actor: "INVESTOR" | "ADMIN" | "SYSTEM";
  note?: string;
}

export interface InvestmentAdminFilter extends PageRequest {
  status?: InvestmentStatus[];
  propertyId?: string;
  userId?: string;
}

/** One anomaly row from reconcile_investments() — detection only. */
export interface InvestmentReconciliationItem {
  checkName: string;
  entityType: string;
  entityId: string;
  detail: string;
}

// ── Financial operations (display only) ──────────────────────────────────────

export interface LedgerAccountBalance {
  account: WalletAccountType;
  label: string;
  /** Sum across all users, as reported by the server. */
  total: MinorUnits;
  currency: CurrencyCode;
  holders: number;
}

export interface LedgerOverview {
  asOf: ISODateString;
  accounts: LedgerAccountBalance[];
  /** Server-computed invariant checks; UI renders pass/fail, never recomputes. */
  invariants: Array<{ id: string; label: string; ok: boolean; detail: string }>;
  postedToday: number;
  reversalsToday: number;
}

export interface AdminDepositRow {
  id: string;
  reference: string;
  userId: string;
  userDisplayName: string;
  amount: MinorUnits;
  fee: MinorUnits;
  currency: CurrencyCode;
  method: DepositMethod;
  status: DepositStatus;
  /** Provider-neutral display label, e.g. "Bank transfer · Providus". */
  channelLabel: string;
  createdAt: ISODateString;
  creditedAt: ISODateString | null;
}

export interface AdminWithdrawalRow {
  id: string;
  reference: string;
  userId: string;
  userDisplayName: string;
  amount: MinorUnits;
  fee: MinorUnits;
  netAmount: MinorUnits;
  currency: CurrencyCode;
  destinationLabel: string;
  status: WithdrawalStatus;
  kycStatus: KycStatus;
  /** Server risk hints for reviewers (display only). */
  riskFlags: string[];
  requestedAt: ISODateString;
  reviewedBy: string | null;
  reviewedAt: ISODateString | null;
  paidAt: ISODateString | null;
}

export interface WithdrawalDecisionInput extends AdminActionInput {
  withdrawalId: string;
  decision: "APPROVE" | "REJECT" | "MARK_PAID";
  reason: string;
}

export interface AdminTransactionRow {
  id: string;
  reference: string;
  userId: string;
  userDisplayName: string;
  type: TransactionType;
  status: TransactionStatus;
  direction: "CREDIT" | "DEBIT";
  account: WalletAccountType;
  amount: MinorUnits;
  currency: CurrencyCode;
  occurredAt: ISODateString;
  /** Set when this entry reverses another (immutability: corrections are new entries). */
  reversesId: string | null;
}

export type ReconciliationStatus = "MATCHED" | "UNMATCHED" | "INVESTIGATING" | "RESOLVED";

export interface ReconciliationItem {
  id: string;
  source: "BANK_STATEMENT" | "CARD_PROCESSOR" | "LEDGER";
  externalReference: string;
  ledgerReference: string | null;
  amount: MinorUnits;
  currency: CurrencyCode;
  status: ReconciliationStatus;
  note: string;
  detectedAt: ISODateString;
}

export interface FinanceFilter extends PageRequest {
  status?: string[];
  from?: ISODateString;
  to?: ISODateString;
}

// ── Referrals & rewards ──────────────────────────────────────────────────────

export type RewardGrantStatus = "PENDING" | "QUALIFIED" | "CREDITED" | "REVERSED" | "BLOCKED";

export interface AdminReferralRow {
  id: string;
  referrerId: string;
  referrerName: string;
  referredId: string;
  referredName: string;
  codeSnapshot: string;
  attributedAt: ISODateString;
  status: ReferralStatus;
  qualifiedAt: ISODateString | null;
  /** Fraud-control hints, display only. */
  flags: string[];
}

export interface RewardGrantRow {
  id: string;
  referralId: string;
  referrerName: string;
  referredName: string;
  kind: ReferralRewardKind;
  amount: MinorUnits;
  currency: CurrencyCode;
  status: RewardGrantStatus;
  createdAt: ISODateString;
  creditedAt: ISODateString | null;
  note: string;
}

export interface ReferralOverview {
  asOf: ISODateString;
  policy: ReferralPolicy;
  totals: {
    attributed: number;
    qualified: number;
    pendingRewards: MinorUnits;
    creditedRewards: MinorUnits;
    reversedRewards: MinorUnits;
    currency: CurrencyCode;
  };
}

// ── Notifications (operations view) ──────────────────────────────────────────

export type NotificationChannel = "IN_APP" | "PUSH" | "EMAIL";
export type DeliveryStatus = "QUEUED" | "SENT" | "DELIVERED" | "FAILED";

export interface NotificationTemplate {
  id: string;
  key: string;
  category: NotificationCategory;
  title: string;
  body: string;
  channels: NotificationChannel[];
  status: "ACTIVE" | "DRAFT" | "DISABLED";
  updatedAt: ISODateString;
}

export interface DeliveryRow {
  id: string;
  templateKey: string;
  userDisplayName: string;
  channel: NotificationChannel;
  status: DeliveryStatus;
  sentAt: ISODateString;
  error: string | null;
}

export interface NotificationOverview {
  asOf: ISODateString;
  byChannel: Array<{ channel: NotificationChannel; sent: number; delivered: number; failed: number }>;
  templates: NotificationTemplate[];
  recentDeliveries: DeliveryRow[];
}

// ── Policies (display + proposal only) ───────────────────────────────────────

export interface PolicyParameter {
  key: string;
  label: string;
  description: string;
  value: number;
  format: "money" | "bps" | "count" | "duration_days";
  currency?: CurrencyCode;
  effectiveFrom: ISODateString;
  version: string;
  lastChangedBy: string;
}

export interface PolicySet {
  version: string;
  effectiveFrom: ISODateString;
  parameters: PolicyParameter[];
  pendingProposals: Array<{ id: string; key: string; proposedValue: number; proposedBy: string; proposedAt: ISODateString; status: "PENDING_APPROVAL" }>;
}

// ── Audit ────────────────────────────────────────────────────────────────────

export type AuditResult = "SUCCESS" | "DENIED" | "FAILED";

export interface AuditEvent {
  id: string;
  occurredAt: ISODateString;
  actor: { id: string; displayName: string; role: AdminRole | "SYSTEM" | "INVESTOR" };
  action: string;
  resource: { type: string; id: string; label: string };
  result: AuditResult;
  requestId: string;
  ip: string | null;
  summary: string;
}

export interface AuditFilter extends PageRequest {
  actorId?: string;
  resourceType?: string;
  result?: AuditResult[];
  from?: ISODateString;
  to?: ISODateString;
}

// ── Legal / trust ────────────────────────────────────────────────────────────

export interface AdminLegalDocument extends LegalDocument {
  status: "PUBLISHED" | "DRAFT";
  owner: string;
  updatedAt: ISODateString;
}

// ── Reports ──────────────────────────────────────────────────────────────────

export interface SeriesPoint {
  label: string;
  value: number;
}

export interface ReportSeries {
  id: string;
  title: string;
  description: string;
  format: "count" | "money";
  currency?: CurrencyCode;
  points: SeriesPoint[];
}

export interface ReportBundle {
  asOf: ISODateString;
  period: { from: ISODateString; to: ISODateString; label: string };
  series: ReportSeries[];
  tables: Array<{ id: string; title: string; columns: string[]; rows: Array<Array<string | number>> }>;
}

// ── The seam ─────────────────────────────────────────────────────────────────

export interface AdminDataSource {
  getActor(): Promise<AdminActor>;
  listRoles(): Promise<RoleDefinition[]>;

  getDashboard(): Promise<AdminDashboard>;

  listUsers(filter?: UserFilter): Promise<Page<AdminUserRow>>;
  getUser(id: string): Promise<AdminUserDetail | null>;
  setUserStatus(input: AdminActionInput & { userId: string; status: AccountStatus }): Promise<AdminActionResult>;

  listKycCases(filter?: KycFilter): Promise<Page<AdminKycCase>>;
  getKycCase(id: string): Promise<AdminKycCase | null>;
  decideKyc(input: KycDecisionInput): Promise<AdminActionResult>;

  listProperties(filter?: PageRequest): Promise<Page<AdminPropertyRow>>;
  getProperty(id: string): Promise<AdminPropertyDetail | null>;
  listPlans(filter?: PageRequest): Promise<Page<AdminPlanRow>>;
  getPlan(id: string): Promise<AdminPlanDetail | null>;
  listRounds(filter?: RoundFilter): Promise<Page<AdminRoundRow>>;
  getRound(id: string): Promise<AdminRoundRow | null>;

  listInvestments(filter?: InvestmentAdminFilter): Promise<Page<AdminInvestmentRow>>;
  getInvestment(id: string): Promise<AdminInvestmentRow | null>;
  /** Audited ACTIVE → REVIEW_REQUIRED (finance roles only). */
  markInvestmentReview(input: AdminActionInput & { investmentId: string }): Promise<AdminActionResult>;
  /** Audited REVIEW_REQUIRED → resolved status; the server transition map governs. */
  resolveInvestmentReview(input: AdminActionInput & { investmentId: string; to: InvestmentStatus }): Promise<AdminActionResult>;
  /** Audited settlement retry for MATURITY_DUE / stale SETTLING rows (finance roles). Same settle path as the worker. */
  retrySettlement(input: AdminActionInput & { investmentId: string }): Promise<AdminActionResult>;
  /** Detection-only integrity check: journals, capacity counters, idempotency. */
  reconcileInvestments(): Promise<InvestmentReconciliationItem[]>;

  getLedgerOverview(): Promise<LedgerOverview>;
  listDeposits(filter?: FinanceFilter): Promise<Page<AdminDepositRow>>;
  listWithdrawals(filter?: FinanceFilter): Promise<Page<AdminWithdrawalRow>>;
  getWithdrawal(id: string): Promise<AdminWithdrawalRow | null>;
  decideWithdrawal(input: WithdrawalDecisionInput): Promise<AdminActionResult>;
  listTransactions(filter?: FinanceFilter): Promise<Page<AdminTransactionRow>>;
  listReconciliation(filter?: FinanceFilter): Promise<Page<ReconciliationItem>>;

  getReferralOverview(): Promise<ReferralOverview>;
  listReferrals(filter?: PageRequest): Promise<Page<AdminReferralRow>>;
  listRewardGrants(filter?: PageRequest & { status?: RewardGrantStatus[] }): Promise<Page<RewardGrantRow>>;

  getNotificationOverview(): Promise<NotificationOverview>;

  getPolicies(): Promise<PolicySet>;

  listAuditEvents(filter?: AuditFilter): Promise<Page<AuditEvent>>;

  listLegalDocuments(): Promise<AdminLegalDocument[]>;

  getReports(period?: "7d" | "30d" | "90d"): Promise<ReportBundle>;
}
