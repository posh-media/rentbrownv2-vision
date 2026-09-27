/**
 * @rentbrown/types — shared, platform-neutral view-model contracts.
 *
 * These describe what the UI RENDERS. They are read projections that the
 * trusted backend (Supabase/PostgreSQL) produces. The client never
 * derives authoritative balances, capacity, profit, eligibility or status from
 * these shapes — it only displays them and collects intent.
 *
 * Money is ALWAYS integer minor units (kobo / cents). Never floats.
 * Rates are ALWAYS integer basis points (1650 = 16.50%).
 * Timestamps are ALWAYS ISO-8601 UTC strings; clients localise for display.
 */

// ── Primitives ───────────────────────────────────────────────────────────────

export type CurrencyCode = "NGN" | "USD";
/** Integer minor units (kobo/cents). Safe-integer range is ample for display. */
export type MinorUnits = number;
/** Integer basis points: 1650 = 16.50 %. */
export type BasisPoints = number;
export type ISODateString = string;

export interface Money {
  currency: CurrencyCode;
  minor: MinorUnits;
}

export type DurationUnit = "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS";
export interface Duration {
  value: number;
  unit: DurationUnit;
}

/** Locked status vocabulary → six visual tones (see design-tokens StatusTone). */
export type StatusTone = "success" | "warning" | "error" | "info" | "pending" | "neutral";

// ── Property → Plan → Round (the opportunity hierarchy) ──────────────────────

export type ProofDocumentType =
  | "TITLE"
  | "VALUATION"
  | "INSPECTION"
  | "COST_SCHEDULE"
  | "INSURANCE"
  | "LEGAL_OPINION"
  | "OPERATOR_AGREEMENT";

export type ProofDocumentStatus = "VERIFIED" | "PENDING_REVIEW" | "EXPIRED";

export interface ProofDocument {
  id: string;
  type: ProofDocumentType;
  title: string;
  summary: string;
  reviewedBy: string;
  reviewedAt: ISODateString;
  version: string;
  status: ProofDocumentStatus;
}

export interface PropertyUpdate {
  id: string;
  title: string;
  body: string;
  publishedAt: ISODateString;
}

export interface PropertyLocation {
  area: string;
  city: string;
  state: string;
  /** Short public label, e.g. "Ikoyi, Lagos". Exact addresses are never public. */
  label: string;
}

export interface Property {
  id: string;
  slug: string;
  name: string;
  type: string;
  location: PropertyLocation;
  summary: string;
  description: string;
  /** Asset keys (e.g. "ikoyi-residences"); each platform resolves to a URL/require. */
  images: string[];
  operator: { name: string; description: string };
  highlights: string[];
  revenueModel: string;
  proofDocuments: ProofDocument[];
  updates: PropertyUpdate[];
}

export type InvestmentPlanStatus = "PUBLISHED" | "PAUSED" | "ARCHIVED";

export interface InvestmentPlan {
  id: string;
  propertyId: string;
  /** e.g. "Residential income note". Terminology stays neutral (no equity/ownership). */
  name: string;
  currency: CurrencyCode;
  slotPrice: MinorUnits;
  roiBps: BasisPoints;
  duration: Duration;
  minSlots: number;
  maxSlotsPerUser: number | null;
  /** Fees expressed in bps; 0 at launch. Policy-driven, never hardcoded in UI. */
  investmentFeeBps: BasisPoints;
  terms: string[];
  riskDisclosures: string[];
  status: InvestmentPlanStatus;
}

export type InvestmentRoundStatus =
  | "SCHEDULED"
  | "OPEN"
  | "NEARING_CAPACITY"
  | "SOLD_OUT"
  | "CLOSED"
  | "SETTLED";

export interface InvestmentRound {
  id: string;
  planId: string;
  roundNumber: number;
  status: InvestmentRoundStatus;
  totalSlots: number;
  /** Server-provided projections. UI never computes availability itself. */
  allocatedSlots: number;
  reservedSlots: number;
  availableSlots: number;
  allocatedPct: number;
  opensAt: ISODateString;
  closesAt: ISODateString;
  /** Indicative dates shown on cards; actual dates are set at activation. */
  projectedStartAt: ISODateString;
  projectedMaturityAt: ISODateString;
}

/** Composite read model powering opportunity cards and detail pages. */
export interface Opportunity {
  property: Property;
  plan: InvestmentPlan;
  round: InvestmentRound;
  /** Server-computed illustration for ONE slot: keeps principal/profit/maturity distinct. */
  perSlot: { principal: MinorUnits; expectedProfit: MinorUnits; maturityValue: MinorUnits };
}

export interface OpportunityFilter {
  status?: InvestmentRoundStatus[] | "ALL";
  query?: string;
  sort?: "NEWEST" | "CLOSING_SOON" | "ROI" | "SLOT_PRICE";
}

// ── Checkout ─────────────────────────────────────────────────────────────────

export type FundingSource = "WALLET" | "BANK_TRANSFER" | "CARD";

/** A quote is requested from the data source; the UI never multiplies money. */
export interface InvestmentQuote {
  roundId: string;
  slots: number;
  slotPrice: MinorUnits;
  principal: MinorUnits;
  roiBps: BasisPoints;
  expectedProfit: MinorUnits;
  maturityValue: MinorUnits;
  fees: MinorUnits;
  currency: CurrencyCode;
  duration: Duration;
  projectedStartAt: ISODateString;
  projectedMaturityAt: ISODateString;
  minSlots: number;
  maxSlots: number;
  availableSlots: number;
  /** Server-side eligibility, e.g. wallet funding needs sufficient AVAILABLE balance. */
  fundingOptions: Array<{
    source: FundingSource;
    available: boolean;
    reason?: string;
    walletAvailable?: MinorUnits;
  }>;
  quotedAt: ISODateString;
  expiresAt: ISODateString;
}

export type PaymentStatus = "PENDING" | "CONFIRMING" | "SUCCESSFUL" | "FAILED" | "REFUNDED";

export interface InvestmentSubmission {
  reference: string;
  investmentId: string | null;
  paymentStatus: PaymentStatus;
  fundingSource: FundingSource;
  amount: MinorUnits;
  currency: CurrencyCode;
  submittedAt: ISODateString;
  /** Present for bank transfers: where the user should send funds. */
  transferInstructions?: VirtualAccount;
  failureReason?: string;
}

// ── Investments (user positions) ─────────────────────────────────────────────

export type InvestmentStatus =
  | "PAYMENT_PENDING"
  | "ACTIVE"
  | "MATURITY_DUE"
  | "SETTLING"
  | "COMPLETED"
  | "FAILED"
  | "REFUNDED"
  | "REVIEW_REQUIRED";

export interface InvestmentTimelineEvent {
  id: string;
  label: string;
  at: ISODateString | null;
  state: "done" | "current" | "upcoming";
  reference?: string;
}

export interface Investment {
  id: string;
  reference: string;
  roundId: string;
  propertySlug: string;
  propertyName: string;
  propertyImage: string;
  locationLabel: string;
  planName: string;
  status: InvestmentStatus;
  currency: CurrencyCode;
  slots: number;
  slotPrice: MinorUnits;
  /** Immutable economic snapshot taken at activation. */
  principal: MinorUnits;
  roiBps: BasisPoints;
  expectedProfit: MinorUnits;
  maturityValue: MinorUnits;
  duration: Duration;
  fundingSource: FundingSource;
  activatedAt: ISODateString | null;
  maturesAt: ISODateString | null;
  completedAt: ISODateString | null;
  /** Server projections for progress UI. */
  termProgressPct: number;
  daysRemaining: number | null;
  settlement?: {
    principalReference: string;
    profitReference: string;
    creditedTo: WalletAccountType;
    creditedAt: ISODateString;
  };
  timeline: InvestmentTimelineEvent[];
}

export interface InvestmentFilter {
  status?: "ACTIVE" | "MATURED" | "ALL";
}

// ── Wallet ───────────────────────────────────────────────────────────────────

/**
 * AVAILABLE — usable to invest or withdraw.
 * RESERVED  — committed to an in-flight operation (e.g. withdrawal under review).
 * BONUS     — qualified referral/reward funds.
 * PENDING   — incoming funds awaiting confirmation (deposit confirming, settlement).
 */
export type WalletAccountType = "AVAILABLE" | "RESERVED" | "BONUS" | "PENDING";

export interface PayoutMethod {
  id: string;
  bankName: string;
  bankCode: string;
  accountNumberMasked: string;
  accountName: string;
  isDefault: boolean;
  verified: boolean;
  addedAt: ISODateString;
}

export interface WalletSummary {
  currency: CurrencyCode;
  balances: Record<WalletAccountType, MinorUnits>;
  /** Available + Reserved + Bonus + Pending; server-provided for the hero figure. */
  total: MinorUnits;
  updatedAt: ISODateString;
  payoutMethods: PayoutMethod[];
  policies: WalletPolicies;
}

/** Fee/limit policy is versioned server configuration surfaced for display. */
export interface WalletPolicies {
  withdrawalFeeBps: BasisPoints;
  withdrawalFeeCap: MinorUnits;
  minWithdrawal: MinorUnits;
  minDeposit: MinorUnits;
  depositFeeBps: BasisPoints;
  kycRequiredForWithdrawal: boolean;
  version: string;
}

export type TransactionType =
  | "DEPOSIT"
  | "INVESTMENT"
  | "MATURITY_PRINCIPAL"
  | "MATURITY_PROFIT"
  | "WITHDRAWAL"
  | "WITHDRAWAL_FEE"
  | "WITHDRAWAL_RELEASE"
  | "REFERRAL_REWARD"
  | "BONUS_TRANSFER"
  | "REFUND"
  | "REVERSAL";

export type TransactionStatus = "PENDING" | "SUCCESSFUL" | "FAILED" | "REVERSED" | "UNDER_REVIEW";

export interface Transaction {
  id: string;
  reference: string;
  type: TransactionType;
  status: TransactionStatus;
  direction: "CREDIT" | "DEBIT";
  amount: MinorUnits;
  currency: CurrencyCode;
  account: WalletAccountType;
  title: string;
  description: string;
  occurredAt: ISODateString;
  providerReference?: string;
  related?: { kind: "investment" | "deposit" | "withdrawal" | "referral"; id: string };
  balanceAfter?: MinorUnits;
}

export interface TransactionFilter {
  type?: TransactionType[] | "ALL";
  status?: TransactionStatus[] | "ALL";
  query?: string;
}

// ── Deposits ─────────────────────────────────────────────────────────────────

export type DepositMethod = "BANK_TRANSFER" | "CARD";
export type DepositStatus = "AWAITING_TRANSFER" | "CONFIRMING" | "CREDITED" | "FAILED" | "EXPIRED";

export interface VirtualAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
  reference: string;
  expiresAt: ISODateString;
}

export interface DepositIntent {
  id: string;
  reference: string;
  amount: MinorUnits;
  currency: CurrencyCode;
  method: DepositMethod;
  status: DepositStatus;
  fee: MinorUnits;
  createdAt: ISODateString;
  creditedAt: ISODateString | null;
  transferInstructions?: VirtualAccount;
  /** Hosted provider checkout — open to complete payment (Paystack/KoraPay). */
  checkoutUrl?: string | null;
}

/** Payment rail behind a deposit — the wire-level choice (Phase 5B). */
export type PaymentProvider = "PAYSTACK" | "KORAPAY";

/** Non-secret init options served to the investor UI by `deposit_options()`. */
export interface DepositOptions {
  currency: CurrencyCode;
  minDeposit: MinorUnits;
  /** Null when no approved cap is configured — no client-invented maximum. */
  maxDeposit: MinorUnits | null;
  /** Null when no approved expiry window is configured. */
  expiryMinutes: number | null;
  providers: Array<{ id: PaymentProvider; enabled: boolean }>;
}

// ── Withdrawals ──────────────────────────────────────────────────────────────

export type WithdrawalStatus =
  | "REQUESTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "PROCESSING"
  | "COMPLETED"
  | "REJECTED"
  | "FAILED";

export interface WithdrawalQuote {
  amount: MinorUnits;
  fee: MinorUnits;
  netAmount: MinorUnits;
  currency: CurrencyCode;
  feeDescription: string;
  minAmount: MinorUnits;
  maxAmount: MinorUnits;
  eligible: boolean;
  /** Present when not eligible: insufficient balance, below minimum, KYC required, no PIN… */
  blockedReason?: string;
  estimatedArrival: string;
  /** Server-authoritative extras (Phase 8B real quote; absent on the mock path). */
  feeBps?: BasisPoints;
  feeCap?: MinorUnits;
  available?: MinorUnits;
  kycRequired?: boolean;
  kycExempt?: boolean;
  pinSet?: boolean;
}

export interface Withdrawal {
  id: string;
  reference: string;
  amount: MinorUnits;
  fee: MinorUnits;
  netAmount: MinorUnits;
  currency: CurrencyCode;
  destination: PayoutMethod;
  status: WithdrawalStatus;
  requestedAt: ISODateString;
  completedAt: ISODateString | null;
  rejectionReason?: string;
  timeline: Array<{ status: WithdrawalStatus; at: ISODateString | null; note?: string }>;
}

// ── Referrals & rewards ──────────────────────────────────────────────────────

export type ReferralStatus = "JOINED" | "PENDING" | "QUALIFIED" | "CREDITED" | "DISQUALIFIED";

/**
 * Two distinct reward kinds. Never conflate them:
 *  - SIGNUP: fixed amount when a referred user qualifies (default ₦1,500).
 *  - DEPOSIT: percentage of the referred user's qualifying deposits, capped.
 */
export type ReferralRewardKind = "SIGNUP" | "DEPOSIT";

/**
 * Versioned, server-owned referral policy. Values are displayed, never
 * computed on the client. Defaults (Phase 1 decision): signup reward ₦1,500.
 */
export interface ReferralPolicy {
  version: string;
  currency: CurrencyCode;
  /** Fixed reward for a qualified signup. Default 150_000 minor (₦1,500). */
  signupReward: MinorUnits;
  /** Referred user's first deposit must reach this to qualify the signup reward. */
  qualifyingDeposit: MinorUnits;
  /** Share of the referred user's qualifying deposits paid to the referrer. */
  depositReferralBps: BasisPoints;
  /** Lifetime cap on deposit-referral rewards per referred user. */
  depositReferralCap: MinorUnits;
  /** Human-readable qualification rule (server content). */
  qualificationRule: string;
}

export interface ReferralSummary {
  code: string;
  shareUrl: string;
  referredCount: number;
  pendingRewards: MinorUnits;
  qualifiedRewards: MinorUnits;
  earnedRewards: MinorUnits;
  currency: CurrencyCode;
  policy: ReferralPolicy;
  /** Plain-language rules, versioned server content. */
  rules: string[];
  qualificationSteps: string[];
}

export interface ReferralRecord {
  id: string;
  /** Masked for privacy, e.g. "Chidi E." */
  displayName: string;
  joinedAt: ISODateString;
  status: ReferralStatus;
  /** Fixed signup reward for this referral (policy.signupReward at attribution; 0 until qualified if pending). */
  signupReward: MinorUnits;
  /** Accumulated deposit-referral rewards from this referred user, capped by policy. */
  depositRewards: MinorUnits;
  /** signupReward + depositRewards — server-computed total. */
  rewardAmount: MinorUnits;
  currency: CurrencyCode;
  statusNote: string;
  qualifiedAt: ISODateString | null;
  creditedAt: ISODateString | null;
}

// ── KYC (UI-only foundation; no provider) ────────────────────────────────────

export type KycStatus = "NOT_STARTED" | "IN_PROGRESS" | "PENDING_REVIEW" | "VERIFIED" | "REJECTED";

export interface KycStep {
  id: "PERSONAL" | "IDENTITY" | "ADDRESS" | "SELFIE";
  title: string;
  description: string;
  state: "complete" | "current" | "upcoming" | "action_required";
}

export type KycGender = "MALE" | "FEMALE" | "OTHER";

export type KycPoaType = "UTILITY_BILL" | "ELECTRICITY_BILL" | "BANK_STATEMENT" | "OTHER";

export type KycDocumentKind = "SELFIE" | "POA";

/** The live (non-superseded) submission as the server reports it. */
export interface KycSubmissionSummary {
  id: string;
  attemptNo: number;
  status: "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "VERIFIED" | "REJECTED";
  fullLegalName: string | null;
  gender: KycGender | null;
  /** Server-masked ("***1234") — the raw BVN is never returned to clients. */
  bvnMasked: string | null;
  poaType: KycPoaType | null;
  hasSelfie: boolean;
  hasPoa: boolean;
  provider: string;
  submittedAt: ISODateString | null;
  reviewedAt: ISODateString | null;
  rejectionReason: string | null;
}

export interface KycSummary {
  status: KycStatus;
  tier: number;
  steps: KycStep[];
  submittedAt: ISODateString | null;
  reviewedAt: ISODateString | null;
  rejectionReason?: string;
  unlocks: string[];
  /** Present on the real (Supabase) path once a submission exists. */
  submission?: KycSubmissionSummary | null;
}

/** Investor-authored KYC draft fields; documents upload separately. */
export interface KycDraftInput {
  fullLegalName?: string;
  gender?: KycGender;
  /** 11 digits. Only ever sent to the server — masked on the way back. */
  bvn?: string;
  poaType?: KycPoaType;
}

/** A saved withdrawal beneficiary (bank account) as the investor types it. */
export interface BankAccountInput {
  bankName: string;
  bankCode: string;
  /** 6–20 digits. */
  accountNumber: string;
  accountName: string;
  makeDefault?: boolean;
}

// ── Notifications ────────────────────────────────────────────────────────────

export type NotificationCategory =
  | "INVESTMENTS"
  | "MONEY"
  | "KYC"
  | "REFERRALS"
  | "SECURITY"
  | "ANNOUNCEMENTS";

export type NotificationLink =
  | { kind: "investment"; id: string }
  | { kind: "withdrawal"; id: string }
  | { kind: "wallet" }
  | { kind: "opportunity"; slug: string }
  | { kind: "referrals" }
  | { kind: "kyc" }
  | { kind: "security" };

export interface Notification {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  createdAt: ISODateString;
  read: boolean;
  link?: NotificationLink;
}

// ── Account / profile / security ─────────────────────────────────────────────

export type AccountStatus = "ACTIVE" | "RESTRICTED" | "SUSPENDED" | "CLOSED";

export interface SessionDevice {
  id: string;
  label: string;
  platform: "iOS" | "Android" | "Web";
  location: string;
  lastActiveAt: ISODateString;
  current: boolean;
}

export interface NotificationPreference {
  push: boolean;
  email: boolean;
}

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  initials: string;
  email: string;
  phone: string;
  avatarUrl: string | null;
  memberSince: ISODateString;
  accountStatus: AccountStatus;
  emailVerified: boolean;
  security: {
    hasTransactionPin: boolean;
    biometricsEnabled: boolean;
    twoFactorEnabled: boolean;
    lastPasswordChangeAt: ISODateString | null;
    devices: SessionDevice[];
  };
  preferences: {
    displayCurrency: CurrencyCode;
    notifications: Record<NotificationCategory, NotificationPreference>;
  };
}

export interface Session {
  userId: string;
  displayName: string;
  issuedAt: ISODateString;
}

// ── Authentication foundation (Supabase — Phase 2) ───────────────────────────

/**
 * Application-level profile. Identity lives in `auth.users`; this is the
 * `public.profiles` row keyed by the same id. Financial data never lives here.
 */
export interface AppProfile {
  id: string;
  username: string;
  displayName: string;
  email: string;
  phone: string | null;
  accountStatus: AccountStatus;
  referralCode: string;
  referredBy: string | null;
  emailVerified: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface SignUpResult {
  /**
   * True when the project requires email confirmation — the user has an
   * account but NO session yet and must verify before signing in.
   */
  requiresEmailConfirmation: boolean;
  userId: string;
}

export interface RequestPasswordResetInput {
  email: string;
  /** Absolute URL the recovery link should land on (web) or deep-link (mobile). */
  redirectTo?: string;
}

/**
 * Identity seam — implemented by `@rentbrown/supabase` (Supabase Auth +
 * `public.profiles`) and by the mock gateway for tests/scenarios. Apps talk
 * to THIS, never to Supabase calls scattered through screens.
 */
export interface AuthGateway {
  /**
   * Current auth user + app profile, or null when signed out. `profile` is
   * null when the user exists but the profile row is not yet provisioned.
   */
  getAuthState(): Promise<{ session: Session; profile: AppProfile | null } | null>;
  signIn(input: SignInInput): Promise<{ session: Session; profile: AppProfile }>;
  signUp(input: SignUpInput): Promise<SignUpResult>;
  signOut(): Promise<void>;
  requestPasswordReset(input: RequestPasswordResetInput): Promise<void>;
  /** New password for the signed-in user (post-login or recovery session). */
  updatePassword(newPassword: string): Promise<void>;
  /** Re-read the profile row (account status can change server-side). */
  getProfile(): Promise<AppProfile | null>;
  /** Subscribe to SIGNED_IN/SIGNED_OUT/TOKEN_REFRESHED/PASSWORD_RECOVERY. */
  onAuthStateChange(cb: (event: AuthChangeEvent) => void): () => void;
}

export type AuthChangeEvent =
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "PASSWORD_RECOVERY";

// ── Dashboard projection ─────────────────────────────────────────────────────

export type PendingActionKind =
  | "VERIFY_EMAIL"
  | "COMPLETE_KYC"
  | "KYC_ACTION_REQUIRED"
  | "KYC_PENDING"
  | "SET_TRANSACTION_PIN"
  | "WITHDRAWAL_REJECTED"
  | "WITHDRAWAL_UNDER_REVIEW"
  | "DEPOSIT_CONFIRMING"
  | "PAYMENT_PENDING"
  | "REFERRAL_REWARD_PENDING"
  | "MATURITY_SOON";

export interface PendingAction {
  id: string;
  kind: PendingActionKind;
  title: string;
  body: string;
  tone: StatusTone;
  link?: NotificationLink;
}

export interface DashboardSummary {
  greetingName: string;
  asOf: ISODateString;
  currency: CurrencyCode;
  /** Active principal + all wallet balances. NOT a promise of future value. */
  totalPortfolioValue: MinorUnits;
  activePrincipal: MinorUnits;
  activeInvestmentCount: number;
  /** Sum of expected profit across active positions — clearly labelled "expected". */
  expectedProfitActive: MinorUnits;
  projectedMaturityValueActive: MinorUnits;
  /** Realised profit already credited by completed settlements. */
  realisedProfitLifetime: MinorUnits;
  wallet: { available: MinorUnits; reserved: MinorUnits; bonus: MinorUnits; pending: MinorUnits };
  nextMaturity: {
    investmentId: string;
    propertyName: string;
    maturesAt: ISODateString;
    maturityValue: MinorUnits;
    daysRemaining: number;
  } | null;
  unreadNotifications: number;
  referral: { earned: MinorUnits; pending: MinorUnits };
  kycStatus: KycStatus;
  pendingActions: PendingAction[];
  featuredOpportunitySlugs: string[];
  openOpportunityCount: number;
}

// ── Static content (shared by site, web, mobile) ─────────────────────────────

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: "BASICS" | "INVESTING" | "WALLET" | "SECURITY" | "REFERRALS";
}

export interface HowItWorksStep {
  step: string;
  title: string;
  body: string;
}

export interface LegalDocument {
  id: "terms" | "privacy" | "risk";
  title: string;
  version: string;
  effectiveAt: ISODateString;
  summary: string;
  sections: Array<{ heading: string; body: string }>;
}

export interface HelpArticle {
  id: string;
  title: string;
  summary: string;
  category: "GETTING_STARTED" | "INVESTING" | "WALLET" | "SECURITY" | "REFERRALS";
  readMinutes: number;
}

export interface CompanyInfo {
  name: string;
  tagline: string;
  purpose: string;
  standards: string[];
  /** Always shown: fixtures are fictional; never imply real registrations. */
  prototypeNotice: string;
  contact: { email: string; phone: string; address: string };
}

export interface ContentBundle {
  faqs: FaqItem[];
  howItWorks: HowItWorksStep[];
  legal: LegalDocument[];
  help: HelpArticle[];
  company: CompanyInfo;
  trustPillars: Array<{ title: string; body: string }>;
}

// ── Data source contract (the backend seam — Supabase adapters) ──────────────

export interface SignInInput {
  email: string;
  password: string;
}

export interface SignUpInput {
  fullName: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  referralCode?: string;
}

export interface SubmitInvestmentInput {
  roundId: string;
  slots: number;
  fundingSource: FundingSource;
  /** Client-generated; the server dedupes retries by it. */
  idempotencyKey: string;
}

export interface CreateDepositInput {
  amount: MinorUnits;
  method: DepositMethod;
  idempotencyKey: string;
  /** Payment rail (real backend); mock ignores it. Defaults server-side to PAYSTACK. */
  provider?: PaymentProvider;
}

export interface RequestWithdrawalInput {
  amount: MinorUnits;
  /** Saved bank-account id (user_bank_accounts). */
  destinationId: string;
  /** 6-digit transaction PIN — verified server-side; never persisted client-side. */
  pin: string;
  idempotencyKey: string;
}

/**
 * Everything the investor apps read or ask for. Implemented today by
 * `@rentbrown/mock-data` for domain data and `@rentbrown/supabase` for
 * identity/session; later by per-domain Supabase adapters. Screens depend
 * on THIS interface, never on a concrete implementation.
 */
export interface InvestorDataSource {
  // session
  getSession(): Promise<Session | null>;
  signIn(input: SignInInput): Promise<Session>;
  signUp(input: SignUpInput): Promise<Session>;
  signOut(): Promise<void>;

  // profile & account
  getProfile(): Promise<UserProfile>;
  getKyc(): Promise<KycSummary>;
  /** Create/update the open KYC draft; on REJECTED this starts a new attempt. */
  saveKycDraft(input: KycDraftInput): Promise<KycSummary>;
  /** Upload a document into private storage and link it to the open draft. */
  uploadKycDocument(kind: KycDocumentKind, file: Blob, fileName?: string): Promise<KycSummary>;
  /** Move the complete draft to PENDING_REVIEW. */
  submitKyc(): Promise<KycSummary>;
  /** Set/replace the 6-digit transaction PIN (server-hashed). */
  setTransactionPin(pin: string): Promise<void>;
  /** Whether a transaction PIN exists — used by the security surface. */
  hasTransactionPin(): Promise<boolean>;

  // home
  getDashboard(): Promise<DashboardSummary>;

  // opportunities
  listOpportunities(filter?: OpportunityFilter): Promise<Opportunity[]>;
  getOpportunity(slug: string): Promise<Opportunity | null>;

  // checkout
  quoteInvestment(roundId: string, slots: number): Promise<InvestmentQuote>;
  submitInvestment(input: SubmitInvestmentInput): Promise<InvestmentSubmission>;
  getSubmission(reference: string): Promise<InvestmentSubmission | null>;

  // portfolio
  listInvestments(filter?: InvestmentFilter): Promise<Investment[]>;
  getInvestment(id: string): Promise<Investment | null>;

  // wallet
  getWallet(): Promise<WalletSummary>;
  listTransactions(filter?: TransactionFilter): Promise<Transaction[]>;
  getTransaction(id: string): Promise<Transaction | null>;
  getDepositOptions(): Promise<DepositOptions>;
  createDeposit(input: CreateDepositInput): Promise<DepositIntent>;
  getDeposit(id: string): Promise<DepositIntent | null>;
  quoteWithdrawal(amount: MinorUnits, destinationId?: string): Promise<WithdrawalQuote>;
  requestWithdrawal(input: RequestWithdrawalInput): Promise<Withdrawal>;
  getWithdrawal(id: string): Promise<Withdrawal | null>;
  listWithdrawals(): Promise<Withdrawal[]>;
  /** Save a withdrawal beneficiary; returns it as a PayoutMethod. */
  saveBankAccount(input: BankAccountInput): Promise<PayoutMethod>;
  archiveBankAccount(id: string): Promise<void>;
  setDefaultBankAccount(id: string): Promise<void>;

  // referrals
  getReferralSummary(): Promise<ReferralSummary>;
  listReferrals(): Promise<ReferralRecord[]>;

  // notifications
  listNotifications(): Promise<Notification[]>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;

  // content
  getContent(): Promise<ContentBundle>;
}

/**
 * Read-only, unauthenticated catalogue for server rendering (marketing site,
 * public explore/opportunity pages). Safe to call from React Server
 * Components and build-time generation. Later implemented by a published-
 * catalogue view over Supabase/PostgreSQL; today by `@rentbrown/mock-data`.
 */
export interface PublicCatalogueSource {
  listOpportunities(filter?: OpportunityFilter): Promise<Opportunity[]>;
  getOpportunity(slug: string): Promise<Opportunity | null>;
  listProperties(): Promise<Property[]>;
  getContent(): Promise<ContentBundle>;
}

export * from "./admin";
