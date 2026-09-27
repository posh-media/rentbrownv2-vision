import type {
  AuthGateway,
  BankAccountInput,
  DashboardSummary,
  DepositIntent,
  DepositOptions,
  DepositStatus,
  Duration,
  FundingSource,
  Investment,
  InvestmentFilter,
  InvestmentQuote,
  InvestmentStatus,
  InvestmentSubmission,
  InvestmentTimelineEvent,
  InvestorDataSource,
  KycDocumentKind,
  KycDraftInput,
  KycGender,
  KycPoaType,
  KycStatus,
  KycStep,
  KycSubmissionSummary,
  KycSummary,
  Opportunity,
  OpportunityFilter,
  PaymentStatus,
  PayoutMethod,
  ProofDocument,
  ProofDocumentStatus,
  ProofDocumentType,
  Session,
  SignInInput,
  SignUpInput,
  Transaction,
  TransactionFilter,
  TransactionType,
  UserProfile,
  WalletAccountType,
  WalletSummary,
  Withdrawal,
  WithdrawalQuote,
  WithdrawalStatus,
} from "@rentbrown/types";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAuthGateway } from "./gateway";
import { fetchProfile } from "./profile";

/** Internal deposit status (DB) → wire `DepositStatus` (Phase 5B adapter). */
const WIRE_STATUS: Record<string, DepositStatus> = {
  INITIATED: "AWAITING_TRANSFER",
  PENDING: "AWAITING_TRANSFER",
  REVIEW_REQUIRED: "CONFIRMING",
  CONFIRMED: "CREDITED",
  FAILED: "FAILED",
  CANCELLED: "FAILED",
  REFUNDED: "FAILED",
  EXPIRED: "EXPIRED",
};

const wireStatus = (s: string): DepositStatus => WIRE_STATUS[s] ?? "FAILED";

/** Surface the Edge Function's JSON error body when invoke() fails. */
async function invokeErrorMessage(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx instanceof Response) {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch { /* fall through */ }
  }
  return error instanceof Error ? error.message : "The deposit could not be started.";
}

// ── Phase 6B: real investment engine adapters ─────────────────────────────────
// Opportunities/quote/submit/portfolio/wallet/transactions go to Supabase when
// a session exists; the mock domain remains the unauthenticated demo path.

const hours = (h: number): Duration => ({ value: h, unit: "HOURS" });

/** Display-only minor-unit formatting (NGN) — no financial math here. */
const fmtMinor = (minor: number): string =>
  `₦${(minor / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Typed RPC error → investor-facing message. The code stays on the Error. */
function investmentError(error: { message?: string }): Error {
  const msg = error.message ?? "";
  const code = msg.match(/ERR_[A-Z_]+/)?.[0] ?? msg.match(/authentication required/)?.[0];
  const friendly: Record<string, string> = {
    ERR_ACCOUNT_NOT_ACTIVE: "Your account isn't active yet. Contact support if this seems wrong.",
    ERR_EMAIL_VERIFICATION_REQUIRED: "Verify your email address before investing.",
    ERR_FUNDING_SOURCE: "That funding method isn't available yet — use your wallet balance.",
    ERR_FEE_UNSUPPORTED: "This plan can't be purchased right now. Please contact support.",
    ERR_INSUFFICIENT_BALANCE: "Your available balance can't cover this amount. Top up your wallet or choose fewer slots.",
    ERR_ROUND_NOT_FOUND: "This round no longer exists.",
    ERR_ROUND_NOT_OPEN: "This round isn't open for investment.",
    ERR_ROUND_CAPACITY_EXCEEDED: "Not enough slots remain in this round.",
    ERR_IDEMPOTENCY_CONFLICT: "This request was already submitted with different details.",
    ERR_INVESTMENT_LIMIT_EXCEEDED: "You've reached the maximum slots for this plan.",
    ERR_INVALID_SLOTS: "Choose a valid number of slots for this plan.",
    ERR_PLAN_NOT_AVAILABLE: "This plan isn't available for investment.",
    ERR_CURRENCY: "This round isn't available in your wallet currency.",
    // Phase 8B — KYC / PIN / withdrawal gates
    ERR_PIN: "Incorrect transaction PIN.",
    ERR_PIN_NOT_SET: "Set a transaction PIN before withdrawing.",
    ERR_PIN_LOCKED: "Too many failed PIN attempts — try again later.",
    ERR_KYC: "Identity verification is required before withdrawing.",
    ERR_DESTINATION: "Choose a valid bank account.",
    ERR_BVN: "BVN must be exactly 11 digits.",
    ERR_INCOMPLETE: "Complete every field and upload both documents before submitting.",
    ERR_KYC_STATE: "This submission can't be changed in its current state.",
    ERR_STORAGE: "The document couldn't be linked to your submission — try again.",
    "insufficient available balance": "Your available balance can't cover this withdrawal.",
    "bank account not found": "That bank account is no longer saved — add it again.",
    "kyc submission not found": "Your verification draft was not found — start again.",
    "account is not active": "Your account isn't active yet. Contact support if this seems wrong.",
    "authentication required": "Sign in to continue.",
  };
  const text =
    (code && friendly[code]) ??
    (code === "ERR_AMOUNT"
      ? `Enter a valid amount${msg.match(/minimum withdrawal is (\d+)/) ? ` (minimum ${fmtMinor(Number(msg.match(/minimum withdrawal is (\d+)/)![1]))})` : "."}`
      : msg) ??
    "The request could not be completed.";
  const err = new Error(text);
  if (code) Object.assign(err, { code });
  return err;
}

interface RawOpp {
  property: {
    id: string; slug: string; name: string; property_type: string;
    summary: string; description: string; area: string; city: string; state: string;
    location_label: string; images: string[] | null;
    operator_name: string; operator_description: string;
    highlights: string[] | null; revenue_model: string;
    documents: Array<{
      id: string; document_type: ProofDocumentType; title: string; summary: string;
      status: string; version: string; reviewed_at: string | null;
    }> | null;
    updates: Array<{ id: string; title: string; body: string; published_at: string }> | null;
  };
  plan: {
    id: string; name: string; currency: "NGN" | "USD"; slot_price_minor: number;
    roi_bps: number; duration_hours: number; min_slots: number;
    max_slots_per_user: number | null; investment_fee_bps: number;
    terms: string[] | null; risk_disclosures: string[] | null; status: "PUBLISHED" | "PAUSED" | "ARCHIVED";
  };
  round: {
    id: string; round_number: number; status: string;
    total_slots: number; allocated_slots: number; reserved_slots: number;
    available_slots: number; allocated_pct: number;
    opens_at: string; closes_at: string;
    projected_start_at: string; projected_maturity_at: string;
  };
  per_slot: { principal_minor: number; expected_profit_minor: number; maturity_value_minor: number };
}

const DOC_STATUS: Record<string, ProofDocumentStatus> = {
  VERIFIED: "VERIFIED",
  IN_REVIEW: "PENDING_REVIEW",
  PENDING_REVIEW: "PENDING_REVIEW",
  EXPIRED: "EXPIRED",
  REJECTED: "EXPIRED",
};

function mapOpportunity(o: RawOpp): Opportunity {
  return {
    property: {
      id: o.property.id,
      slug: o.property.slug,
      name: o.property.name,
      type: o.property.property_type,
      location: { area: o.property.area, city: o.property.city, state: o.property.state, label: o.property.location_label },
      summary: o.property.summary,
      description: o.property.description,
      images: o.property.images ?? [],
      operator: { name: o.property.operator_name, description: o.property.operator_description },
      highlights: o.property.highlights ?? [],
      revenueModel: o.property.revenue_model,
      proofDocuments: (o.property.documents ?? []).map(
        (d): ProofDocument => ({
          id: d.id,
          type: d.document_type,
          title: d.title,
          summary: d.summary,
          reviewedBy: d.status === "VERIFIED" ? "RentBrown review desk" : "Pending review",
          reviewedAt: d.reviewed_at ?? "",
          version: d.version,
          status: DOC_STATUS[d.status] ?? "PENDING_REVIEW",
        }),
      ),
      updates: (o.property.updates ?? []).map((u) => ({ id: u.id, title: u.title, body: u.body, publishedAt: u.published_at })),
    },
    plan: {
      id: o.plan.id,
      propertyId: o.property.id,
      name: o.plan.name,
      currency: o.plan.currency,
      slotPrice: o.plan.slot_price_minor,
      roiBps: o.plan.roi_bps,
      duration: hours(o.plan.duration_hours),
      minSlots: o.plan.min_slots,
      maxSlotsPerUser: o.plan.max_slots_per_user,
      investmentFeeBps: o.plan.investment_fee_bps,
      terms: o.plan.terms ?? [],
      riskDisclosures: o.plan.risk_disclosures ?? [],
      status: o.plan.status,
    },
    round: {
      id: o.round.id,
      planId: o.plan.id,
      roundNumber: o.round.round_number,
      status: o.round.status as Opportunity["round"]["status"],
      totalSlots: o.round.total_slots,
      allocatedSlots: o.round.allocated_slots,
      reservedSlots: o.round.reserved_slots,
      availableSlots: o.round.available_slots,
      allocatedPct: o.round.allocated_pct,
      opensAt: o.round.opens_at,
      closesAt: o.round.closes_at,
      projectedStartAt: o.round.projected_start_at,
      projectedMaturityAt: o.round.projected_maturity_at,
    },
    perSlot: {
      principal: o.per_slot.principal_minor,
      expectedProfit: o.per_slot.expected_profit_minor,
      maturityValue: o.per_slot.maturity_value_minor,
    },
  };
}

/** Same semantics as packages/mock-data applyOpportunityFilter. */
function applyOpportunityFilter(items: Opportunity[], filter?: OpportunityFilter): Opportunity[] {
  let result = items;
  if (filter?.status && filter.status !== "ALL") {
    result = result.filter((o) => (filter.status as string[]).includes(o.round.status));
  }
  if (filter?.query) {
    const q = filter.query.toLowerCase();
    result = result.filter((o) => `${o.property.name} ${o.property.location.label} ${o.plan.name}`.toLowerCase().includes(q));
  }
  const sorted = [...result];
  switch (filter?.sort) {
    case "CLOSING_SOON": sorted.sort((a, b) => a.round.closesAt.localeCompare(b.round.closesAt)); break;
    case "ROI": sorted.sort((a, b) => b.plan.roiBps - a.plan.roiBps); break;
    case "SLOT_PRICE": sorted.sort((a, b) => a.plan.slotPrice - b.plan.slotPrice); break;
    default: sorted.sort((a, b) => b.round.opensAt.localeCompare(a.round.opensAt));
  }
  return sorted;
}

interface RawQuote {
  round_id: string; slots: number; slot_price_minor: number;
  principal_minor: number; roi_bps: number; expected_profit_minor: number;
  maturity_value_minor: number; fee_minor: number; currency: "NGN" | "USD";
  duration_hours: number; min_slots: number; max_slots: number; available_slots: number;
  round_status: string; round_open: boolean;
  projected_start_at: string; projected_maturity_at: string;
  funding_options: Array<{ source: FundingSource; available: boolean; reason?: string; wallet_available_minor?: number }>;
  quoted_at: string; expires_at: string;
}

function mapQuote(q: RawQuote): InvestmentQuote {
  return {
    roundId: q.round_id,
    slots: q.slots,
    slotPrice: q.slot_price_minor,
    principal: q.principal_minor,
    roiBps: q.roi_bps,
    expectedProfit: q.expected_profit_minor,
    maturityValue: q.maturity_value_minor,
    fees: q.fee_minor,
    currency: q.currency,
    duration: hours(q.duration_hours),
    projectedStartAt: q.projected_start_at,
    projectedMaturityAt: q.projected_maturity_at,
    minSlots: q.min_slots,
    maxSlots: q.max_slots,
    availableSlots: q.available_slots,
    fundingOptions: q.funding_options.map((f) => ({
      source: f.source,
      available: f.available,
      reason:
        f.reason === "COMING_SOON"
          ? "Coming soon."
          : !f.available && f.source === "WALLET"
            ? "Your available balance can't cover this amount."
            : f.reason,
      walletAvailable: f.wallet_available_minor,
    })),
    quotedAt: q.quoted_at,
    expiresAt: q.expires_at,
  };
}

interface RawInvestmentRow {
  id: string; reference: string; round_id: string;
  status: InvestmentStatus; currency: "NGN" | "USD"; funding_source: FundingSource;
  slots: number; slot_price_minor: number; principal_minor: number; roi_bps: number;
  duration_hours: number; expected_profit_minor: number; maturity_value_minor: number;
  activated_at: string | null; matures_at: string | null; completed_at: string | null;
  created_at: string;
  property: { slug: string; name: string; location_label: string; images: string[] | null } | null;
  plan: { name: string } | null;
  round: { round_number: number } | null;
}

interface RawEventRow {
  id: string; investment_id: string; event_type: string;
  created_at: string; metadata: { note?: string } | null;
}

const EVENT_LABEL: Record<string, string> = {
  CREATED: "Investment created",
  PAYMENT_PENDING: "Awaiting payment",
  PAYMENT_CONFIRMED: "Payment confirmed",
  ACTIVATED: "Investment active",
  CANCELLED: "Cancelled",
  FAILED: "Failed",
  REFUNDED: "Refunded",
  MATURED: "Matured",
  SETTLEMENT_STARTED: "Settlement started",
  SETTLED: "Settled to wallet",
  REVIEW_REQUIRED: "Under review",
  NOTE_ADDED: "Note added",
};

function buildTimeline(row: RawInvestmentRow, events: RawEventRow[]): InvestmentTimelineEvent[] {
  const timeline: InvestmentTimelineEvent[] = events
    .filter((e) => e.event_type !== "NOTE_ADDED" || e.metadata?.note)
    .map((e) => ({
      id: e.id,
      label: e.metadata?.note && e.event_type === "NOTE_ADDED" ? `Note — ${e.metadata.note}` : EVENT_LABEL[e.event_type] ?? e.event_type,
      at: e.created_at,
      state: "done" as const,
    }));
  // Projected milestones so the detail page keeps its forward-looking rail.
  if (row.matures_at && !["COMPLETED", "SETTLING"].includes(row.status) && !events.some((e) => e.event_type === "MATURED")) {
    timeline.push({ id: "maturity", label: "Maturity", at: row.matures_at, state: "upcoming" });
  }
  if (!["COMPLETED", "FAILED", "REFUNDED"].includes(row.status) && !events.some((e) => e.event_type === "SETTLED")) {
    timeline.push({ id: "settle", label: "Settlement to wallet", at: null, state: "upcoming" });
  }
  return timeline;
}

function mapInvestment(row: RawInvestmentRow, events: RawEventRow[]): Investment {
  const now = Date.now();
  const activated = row.activated_at ? Date.parse(row.activated_at) : null;
  const matures = row.matures_at ? Date.parse(row.matures_at) : null;
  const termProgressPct =
    activated && matures && matures > activated
      ? Math.min(100, Math.max(0, Math.round(((now - activated) / (matures - activated)) * 100)))
      : 0;
  const daysRemaining = matures ? Math.max(0, Math.ceil((matures - now) / 86_400_000)) : null;
  return {
    id: row.id,
    reference: row.reference,
    roundId: row.round_id,
    propertySlug: row.property?.slug ?? "",
    propertyName: row.property?.name ?? "Property",
    propertyImage: row.property?.images?.[0] ?? "ikoyi-residences",
    locationLabel: row.property?.location_label ?? "",
    planName: row.plan?.name ?? "",
    status: row.status,
    currency: row.currency,
    slots: row.slots,
    slotPrice: row.slot_price_minor,
    principal: row.principal_minor,
    roiBps: row.roi_bps,
    expectedProfit: row.expected_profit_minor,
    maturityValue: row.maturity_value_minor,
    duration: hours(row.duration_hours),
    fundingSource: row.funding_source,
    activatedAt: row.activated_at,
    maturesAt: row.matures_at,
    completedAt: row.completed_at,
    termProgressPct,
    daysRemaining,
    timeline: buildTimeline(row, events),
  };
}

const PAYMENT_STATUS: Record<string, PaymentStatus> = {
  ACTIVE: "SUCCESSFUL",
  MATURITY_DUE: "SUCCESSFUL",
  SETTLING: "SUCCESSFUL",
  COMPLETED: "SUCCESSFUL",
  PAYMENT_PENDING: "PENDING",
  REVIEW_REQUIRED: "CONFIRMING",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
};

function mapSubmission(row: Pick<RawInvestmentRow, "id" | "reference" | "status" | "funding_source" | "principal_minor" | "currency" | "created_at">): InvestmentSubmission {
  return {
    reference: row.reference,
    investmentId: row.id,
    paymentStatus: PAYMENT_STATUS[row.status] ?? "PENDING",
    fundingSource: row.funding_source,
    amount: row.principal_minor,
    currency: row.currency,
    submittedAt: row.created_at,
  };
}

const INVESTMENT_SELECT =
  "*, property:properties!inner(slug,name,location_label,images), plan:investment_plans!inner(name), round:investment_rounds!inner(round_number)";

const ACTIVE_STATUSES: InvestmentStatus[] = ["ACTIVE", "PAYMENT_PENDING", "MATURITY_DUE", "SETTLING", "REVIEW_REQUIRED"];
const MATURED_STATUSES: InvestmentStatus[] = ["COMPLETED", "REFUNDED", "FAILED"];

// journal_type → wire TransactionType. HOLD/HOLD_DEBIT direction depends on the
// entity (investment hold vs withdrawal hold) — resolved via entity_type.
const JOURNAL_TX: Record<string, TransactionType> = {
  FUNDING_CREDIT: "DEPOSIT",
  PENDING_CREDIT: "DEPOSIT",
  PENDING_CONFIRM: "DEPOSIT",
  INVESTMENT_DEBIT: "INVESTMENT",
  MATURITY_CREDIT: "MATURITY_PRINCIPAL",
  EXTERNAL_PAYOUT: "WITHDRAWAL",
  FEE_DEBIT: "WITHDRAWAL_FEE",
  HOLD_RELEASE: "WITHDRAWAL_RELEASE",
  REFUND: "REFUND",
  REWARD_CREDIT: "REFERRAL_REWARD",
  BONUS_RELEASE: "BONUS_TRANSFER",
  ADMIN_ADJUSTMENT: "REVERSAL",
  REVERSAL: "REVERSAL",
};

const JOURNAL_TITLE: Record<string, string> = {
  FUNDING_CREDIT: "Deposit",
  PENDING_CREDIT: "Deposit",
  PENDING_CONFIRM: "Deposit",
  HOLD: "Funds reserved",
  HOLD_DEBIT: "Reserved funds released",
  HOLD_RELEASE: "Reservation released",
  INVESTMENT_DEBIT: "Investment",
  MATURITY_CREDIT: "Maturity credit",
  EXTERNAL_PAYOUT: "Withdrawal",
  FEE_DEBIT: "Withdrawal fee",
  REFUND: "Refund",
  REWARD_CREDIT: "Referral reward",
  BONUS_RELEASE: "Bonus transfer",
  ADMIN_ADJUSTMENT: "Account adjustment",
  REVERSAL: "Reversal",
};

interface RawTxRow {
  entry_id: number; journal_id: string; reference: string;
  journal_type: string; bucket: WalletAccountType; direction: "CREDIT" | "DEBIT";
  amount_minor: number; currency: "NGN" | "USD"; description: string | null;
  entity_type: string | null; entity_id: string | null;
  balance_after_minor: number | null; occurred_at: string;
}

function txType(row: RawTxRow): TransactionType {
  if (row.journal_type === "HOLD" || row.journal_type === "HOLD_DEBIT") {
    return row.entity_type === "investment" ? "INVESTMENT" : "WITHDRAWAL";
  }
  return JOURNAL_TX[row.journal_type] ?? "REVERSAL";
}

function mapTransaction(row: RawTxRow): Transaction {
  const related =
    row.entity_type === "investment" || row.entity_type === "deposit" || row.entity_type === "withdrawal" || row.entity_type === "referral"
      ? ({ kind: row.entity_type, id: row.entity_id ?? "" } as Transaction["related"])
      : undefined;
  return {
    id: `tx-${row.entry_id}`,
    reference: row.reference,
    type: txType(row),
    status: "SUCCESSFUL",
    direction: row.direction,
    amount: row.amount_minor,
    currency: row.currency,
    account: row.bucket,
    title: JOURNAL_TITLE[row.journal_type] ?? "Transaction",
    description: row.description ?? row.reference,
    occurredAt: row.occurred_at,
    related,
    balanceAfter: row.balance_after_minor ?? undefined,
  };
}

function applyTransactionFilter(items: Transaction[], filter?: TransactionFilter): Transaction[] {
  let result = items;
  if (filter?.type && filter.type !== "ALL") result = result.filter((t) => (filter.type as string[]).includes(t.type));
  if (filter?.status && filter.status !== "ALL") result = result.filter((t) => (filter.status as string[]).includes(t.status));
  if (filter?.query) {
    const q = filter.query.toLowerCase();
    result = result.filter((t) => `${t.title} ${t.reference} ${t.description}`.toLowerCase().includes(q));
  }
  return result;
}

/**
 * InvestorDataSource where identity/session is REAL (Supabase Auth +
 * public.profiles) and, since Phase 6B, the investment engine domain reads
 * (catalogue, quotes, submissions, portfolio, wallet, transactions) are real
 * too. Phase 8B added the real KYC lifecycle, transaction PIN, saved bank
 * accounts and the gated withdrawal flow. Domains without real tables yet
 * (notifications, referrals, content) still delegate to the mock source,
 * which also serves the unauthenticated demo path.
 *
 * Screens keep depending on InvestorDataSource; nothing in this file knows
 * about React, and no screen imports @supabase/supabase-js directly.
 */
export function createSupabaseInvestorDataSource(
  client: SupabaseClient,
  domain: InvestorDataSource,
): InvestorDataSource & { auth: AuthGateway } {
  const auth = createAuthGateway(client);

  /** Signed-in Supabase session? When false, every call is the demo path. */
  const hasSession = async () => {
    const {
      data: { session },
    } = await client.auth.getSession();
    return !!session;
  };

  const fetchOpportunities = async (): Promise<Opportunity[]> => {
    const { data, error } = await client.rpc("list_opportunities");
    if (error) throw investmentError(error);
    return ((data ?? []) as RawOpp[]).map(mapOpportunity);
  };

  const fetchInvestments = async (filter?: InvestmentFilter): Promise<Investment[]> => {
    let query = client.from("investments").select(INVESTMENT_SELECT).order("created_at", { ascending: false });
    if (filter?.status === "ACTIVE") query = query.in("status", ACTIVE_STATUSES);
    if (filter?.status === "MATURED") query = query.in("status", MATURED_STATUSES);
    const { data, error } = await query;
    if (error) throw investmentError(error);
    const rows = (data ?? []) as unknown as RawInvestmentRow[];
    if (rows.length === 0) return [];
    const { data: events, error: evErr } = await client
      .from("investment_events")
      .select("id,investment_id,event_type,created_at,metadata")
      .in("investment_id", rows.map((r) => r.id))
      .order("created_at", { ascending: true });
    if (evErr) throw investmentError(evErr);
    const byInv = new Map<string, RawEventRow[]>();
    for (const e of (events ?? []) as RawEventRow[]) {
      const list = byInv.get(e.investment_id) ?? [];
      list.push(e);
      byInv.set(e.investment_id, list);
    }
    return rows.map((r) => mapInvestment(r, byInv.get(r.id) ?? []));
  };

  const fetchWalletSummary = async (): Promise<WalletSummary> => {
    // Real balances + saved bank accounts + live withdrawal/deposit policy; the
    // mock shell only supplies fields without a server source yet.
    const shell = await domain.getWallet();
    const [walletRes, accounts, quote, depositOpts] = await Promise.all([
      client.from("wallets").select("*").eq("currency", "NGN").maybeSingle(),
      fetchBankAccounts(),
      client.rpc("quote_withdrawal", { p_amount_minor: 0 }),
      client.rpc("deposit_options"),
    ]);
    const { data, error } = walletRes;
    if (error) throw investmentError(error);
    if (!data) return shell;
    const w = data as {
      available_minor: number; reserved_minor: number; bonus_minor: number;
      pending_minor: number; updated_at: string;
    };
    const balances: WalletSummary["balances"] = {
      AVAILABLE: w.available_minor,
      RESERVED: w.reserved_minor,
      BONUS: w.bonus_minor,
      PENDING: w.pending_minor,
    };
    const q = quote.data as RawWithdrawalQuote | null;
    const d = depositOpts.data as { min_minor?: number | null } | null;
    return {
      ...shell,
      currency: "NGN",
      balances,
      total: w.available_minor + w.reserved_minor + w.bonus_minor + w.pending_minor,
      updatedAt: w.updated_at,
      payoutMethods: accounts,
      policies: {
        ...shell.policies,
        withdrawalFeeBps: q?.fee_bps ?? shell.policies.withdrawalFeeBps,
        withdrawalFeeCap: q?.fee_cap_minor ?? shell.policies.withdrawalFeeCap,
        minWithdrawal: q?.min_minor ?? shell.policies.minWithdrawal,
        minDeposit: d?.min_minor ?? shell.policies.minDeposit,
        kycRequiredForWithdrawal: q?.kyc_required ?? shell.policies.kycRequiredForWithdrawal,
      },
    };
  };

  const fetchTransactions = async (limit = 200): Promise<Transaction[]> => {
    const { data, error } = await client.rpc("get_wallet_transactions", { p_limit: limit });
    if (error) throw investmentError(error);
    return ((data ?? []) as RawTxRow[]).map(mapTransaction);
  };

  const fetchInvestorProfile = async (): Promise<UserProfile> => {
    const shell = await domain.getProfile();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return shell;
    const profile = await fetchProfile(client, user);
    if (!profile) return shell;
    return {
      ...shell,
      id: profile.id,
      displayName: profile.displayName,
      initials: profile.displayName
        .split(/\s+/)
        .map((w) => w[0] ?? "")
        .slice(0, 2)
        .join("")
        .toUpperCase(),
      email: profile.email,
      phone: profile.phone ?? shell.phone,
      accountStatus: profile.accountStatus,
      emailVerified: profile.emailVerified,
      memberSince: profile.createdAt,
    };
  };

  // ── Phase 8B: KYC, transaction PIN, bank accounts, withdrawals ─────────────

  interface RawBankAccount {
    id: string;
    bank_name: string;
    bank_code: string;
    account_number: string;
    account_name: string;
    is_default: boolean;
    created_at: string;
  }

  const maskAccount = (n: string): string => `•••• ${n.slice(-4)}`;

  const mapPayoutMethod = (b: RawBankAccount): PayoutMethod => ({
    id: b.id,
    bankName: b.bank_name,
    bankCode: b.bank_code,
    accountNumberMasked: maskAccount(b.account_number),
    accountName: b.account_name,
    isDefault: b.is_default,
    verified: true,
    addedAt: b.created_at,
  });

  const fetchBankAccounts = async (): Promise<PayoutMethod[]> => {
    const { data, error } = await client
      .from("user_bank_accounts")
      .select("id,bank_name,bank_code,account_number,account_name,is_default,created_at")
      .is("archived_at", null)
      .order("created_at", { ascending: true });
    if (error) throw investmentError(error);
    return ((data ?? []) as RawBankAccount[]).map(mapPayoutMethod);
  };

  interface RawWithdrawalQuote {
    currency: "NGN" | "USD";
    amount_minor: number;
    available_minor: number;
    min_minor: number | null;
    fee_minor: number | null;
    net_minor: number | null;
    fee_bps: number | null;
    fee_cap_minor: number | null;
    kyc_verified: boolean;
    kyc_required: boolean;
    first_withdrawal: boolean;
    first_without_kyc_max_minor: number | null;
    kyc_exempt: boolean;
    pin_set: boolean;
    eligible: boolean;
    blocked_reason: string | null;
  }

  const fetchWithdrawalQuote = async (amount: number, destinationId?: string): Promise<WithdrawalQuote> => {
    const { data, error } = await client.rpc("quote_withdrawal", {
      p_amount_minor: amount,
      p_bank_account_id: destinationId ?? null,
    });
    if (error) throw investmentError(error);
    const q = data as RawWithdrawalQuote;
    const feeBps = q.fee_bps ?? 0;
    return {
      amount: q.amount_minor ?? amount,
      fee: q.fee_minor ?? 0,
      netAmount: q.net_minor ?? Math.max(0, amount - (q.fee_minor ?? 0)),
      currency: q.currency,
      feeDescription:
        `${(feeBps / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}% fee` +
        (q.fee_cap_minor != null ? `, capped at ${fmtMinor(q.fee_cap_minor)}` : ""),
      minAmount: q.min_minor ?? 0,
      maxAmount: q.available_minor,
      eligible: q.eligible,
      blockedReason: q.blocked_reason ?? undefined,
      estimatedArrival: "Typically within 1 business day after review",
      feeBps,
      feeCap: q.fee_cap_minor ?? undefined,
      available: q.available_minor,
      kycRequired: q.kyc_required,
      kycExempt: q.kyc_exempt,
      pinSet: q.pin_set,
    };
  };

  interface RawWithdrawalDestination {
    bank_name?: string;
    bank_code?: string;
    account_number?: string;
    account_name?: string;
    bank_account_id?: string;
  }

  interface RawWithdrawalRow {
    id: string;
    reference: string;
    currency: "NGN" | "USD";
    amount_minor: number;
    fee_minor: number;
    net_minor: number;
    destination: RawWithdrawalDestination | null;
    status: WithdrawalStatus;
    requested_at: string;
    reviewed_at: string | null;
    paid_at: string | null;
    rejected_at: string | null;
  }

  interface RawWithdrawalEvent {
    id: number;
    withdrawal_id: string;
    from_status: string | null;
    to_status: string;
    source: string;
    note: string | null;
    created_at: string;
  }

  /** Canonical forward rail for the status page's progress timeline. */
  const WD_RAIL: WithdrawalStatus[] = ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING", "COMPLETED"];

  const mapWithdrawalDestination = (row: RawWithdrawalRow): PayoutMethod => {
    const d = row.destination ?? {};
    const acct = d.account_number ?? "";
    return {
      id: d.bank_account_id ?? `dest-${row.id}`,
      bankName: d.bank_name ?? "Bank account",
      bankCode: d.bank_code ?? "",
      accountNumberMasked: acct ? maskAccount(acct) : "••••",
      accountName: d.account_name ?? "",
      isDefault: false,
      verified: true,
      addedAt: row.requested_at,
    };
  };

  const mapWithdrawal = (row: RawWithdrawalRow, events: RawWithdrawalEvent[]): Withdrawal => {
    const timeline = events.map((e) => ({
      status: e.to_status as WithdrawalStatus,
      at: e.created_at as string | null,
      note: e.note ?? undefined,
    }));
    const terminal = ["COMPLETED", "REJECTED", "FAILED"].includes(row.status);
    if (!terminal) {
      const reached = new Set(timeline.map((t) => t.status));
      for (const s of WD_RAIL) if (!reached.has(s)) timeline.push({ status: s, at: null, note: undefined });
    }
    const rejected = [...events].reverse().find((e) => e.to_status === "REJECTED" || e.to_status === "FAILED");
    return {
      id: row.id,
      reference: row.reference,
      amount: row.amount_minor,
      fee: row.fee_minor,
      netAmount: row.net_minor,
      currency: row.currency,
      destination: mapWithdrawalDestination(row),
      status: row.status,
      requestedAt: row.requested_at,
      completedAt: row.paid_at,
      rejectionReason: rejected?.note ?? undefined,
      timeline,
    };
  };

  const WD_SELECT =
    "id,reference,currency,amount_minor,fee_minor,net_minor,destination,status,requested_at,reviewed_at,paid_at,rejected_at";

  const fetchWithdrawalEvents = async (ids: string[]): Promise<Map<string, RawWithdrawalEvent[]>> => {
    if (ids.length === 0) return new Map();
    const { data, error } = await client
      .from("withdrawal_events")
      .select("id,withdrawal_id,from_status,to_status,source,note,created_at")
      .in("withdrawal_id", ids)
      .order("id", { ascending: true });
    if (error) throw investmentError(error);
    const byWd = new Map<string, RawWithdrawalEvent[]>();
    for (const e of (data ?? []) as RawWithdrawalEvent[]) {
      const list = byWd.get(e.withdrawal_id) ?? [];
      list.push(e);
      byWd.set(e.withdrawal_id, list);
    }
    return byWd;
  };

  const fetchWithdrawal = async (id: string): Promise<Withdrawal | null> => {
    const { data, error } = await client.from("withdrawals").select(WD_SELECT).eq("id", id).maybeSingle();
    if (error) throw investmentError(error);
    if (!data) return null;
    const row = data as unknown as RawWithdrawalRow;
    const events = await fetchWithdrawalEvents([row.id]);
    return mapWithdrawal(row, events.get(row.id) ?? []);
  };

  interface RawKycSubmission {
    id: string;
    attempt_no: number;
    status: "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "VERIFIED" | "REJECTED";
    full_legal_name: string | null;
    gender: KycGender | null;
    bvn_masked: string | null;
    poa_type: KycPoaType | null;
    has_selfie: boolean;
    has_poa: boolean;
    provider: string;
    submitted_at: string | null;
    reviewed_at: string | null;
    rejection_reason: string | null;
  }

  interface RawKycOwn {
    status: "NOT_STARTED" | RawKycSubmission["status"];
    submission: RawKycSubmission | null;
  }

  const KYC_STATUS: Record<string, KycStatus> = {
    NOT_STARTED: "NOT_STARTED",
    DRAFT: "IN_PROGRESS",
    SUBMITTED: "PENDING_REVIEW",
    UNDER_REVIEW: "PENDING_REVIEW",
    VERIFIED: "VERIFIED",
    REJECTED: "REJECTED",
  };

  const kycSteps = (status: KycStatus, s: RawKycSubmission | null): KycStep[] => {
    const defs: Array<{ id: KycStep["id"]; title: string; description: string; done: boolean }> = [
      { id: "PERSONAL", title: "Personal details", description: "Your full legal name and gender.", done: !!s?.full_legal_name && !!s?.gender },
      { id: "IDENTITY", title: "Bank Verification Number", description: "Your 11-digit BVN.", done: !!s?.bvn_masked },
      { id: "ADDRESS", title: "Proof of address", description: "A recent utility bill or bank statement.", done: !!s?.poa_type && !!s?.has_poa },
      { id: "SELFIE", title: "Selfie photo", description: "A clear photo of your face.", done: !!s?.has_selfie },
    ];
    if (status === "VERIFIED" || status === "PENDING_REVIEW") {
      return defs.map((d) => ({ id: d.id, title: d.title, description: d.description, state: "complete" as const }));
    }
    let currentSet = false;
    return defs.map(({ done, ...d }) => {
      if (done) return { ...d, state: "complete" as const };
      if (!currentSet) {
        currentSet = true;
        return { ...d, state: status === "REJECTED" ? ("action_required" as const) : ("current" as const) };
      }
      return { ...d, state: "upcoming" as const };
    });
  };

  const KYC_UNLOCKS = ["Withdrawals to your saved bank accounts", "A complete investor profile"];

  const fetchKyc = async (): Promise<KycSummary> => {
    const { data, error } = await client.rpc("kyc_get_own");
    if (error) throw investmentError(error);
    const own = data as RawKycOwn;
    const s = own.submission;
    const status = KYC_STATUS[own.status] ?? "NOT_STARTED";
    const submission: KycSubmissionSummary | null = s
      ? {
          id: s.id,
          attemptNo: s.attempt_no,
          status: s.status,
          fullLegalName: s.full_legal_name,
          gender: s.gender,
          bvnMasked: s.bvn_masked,
          poaType: s.poa_type,
          hasSelfie: s.has_selfie,
          hasPoa: s.has_poa,
          provider: s.provider,
          submittedAt: s.submitted_at,
          reviewedAt: s.reviewed_at,
          rejectionReason: s.rejection_reason,
        }
      : null;
    return {
      status,
      tier: status === "VERIFIED" ? 2 : 1,
      steps: kycSteps(status, s),
      submittedAt: s?.submitted_at ?? null,
      reviewedAt: s?.reviewed_at ?? null,
      rejectionReason: s?.rejection_reason ?? undefined,
      unlocks: KYC_UNLOCKS,
      submission,
    };
  };

  /** The open (non-superseded) submission, or null. */
  const fetchKycOwn = async (): Promise<RawKycOwn> => {
    const { data, error } = await client.rpc("kyc_get_own");
    if (error) throw investmentError(error);
    return data as RawKycOwn;
  };

  return {
    auth,

    // ── session — real ──────────────────────────────────────────────────────
    async getSession(): Promise<Session | null> {
      const state = await auth.getAuthState();
      return state ? state.session : null;
    },
    async signIn(input: SignInInput): Promise<Session> {
      const { session } = await auth.signIn(input);
      return session;
    },
    async signUp(input: SignUpInput): Promise<Session> {
      const result = await auth.signUp(input);
      if (result.requiresEmailConfirmation) {
        // No session exists yet — the caller routes to the verify-email state.
        throw Object.assign(new Error("EMAIL_CONFIRMATION_REQUIRED"), { code: "EMAIL_CONFIRMATION_REQUIRED" });
      }
      const state = await auth.getAuthState();
      if (!state) throw new Error("Sign up did not produce a session.");
      return state.session;
    },
    async signOut() {
      await auth.signOut();
    },

    // ── profile — real auth fields over the mock shell ──────────────────────
    getProfile: fetchInvestorProfile,

    // ── KYC — real (Phase 8B): draft → documents → submit → manual review ────
    getKyc: () => hasSession().then((ok) => (ok ? fetchKyc() : domain.getKyc())),
    async saveKycDraft(input: KycDraftInput): Promise<KycSummary> {
      if (!(await hasSession())) return domain.saveKycDraft(input);
      const { error } = await client.rpc("kyc_save_draft", {
        p_full_legal_name: input.fullLegalName ?? null,
        p_gender: input.gender ?? null,
        p_bvn: input.bvn ?? null,
        p_poa_type: input.poaType ?? null,
      });
      if (error) throw investmentError(error);
      return fetchKyc();
    },
    async uploadKycDocument(kind: KycDocumentKind, file: Blob, fileName?: string): Promise<KycSummary> {
      if (!(await hasSession())) return domain.uploadKycDocument(kind, file, fileName);
      const own = await fetchKycOwn();
      const sub = own.submission;
      if (!sub || sub.status !== "DRAFT") {
        throw new Error("Save your details first — documents attach to an open draft.");
      }
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user) throw new Error("Sign in to continue.");
      const ext = (fileName?.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const docName = kind === "SELFIE" ? "selfie" : "poa";
      const path = `${user.id}/${sub.id}/${docName}.${ext}`;
      const { error: upErr } = await client.storage.from("kyc-documents").upload(path, file, { upsert: true });
      if (upErr) throw investmentError(upErr);
      const { error } = await client.rpc("kyc_save_draft", {
        [kind === "SELFIE" ? "p_selfie_path" : "p_poa_path"]: path,
      });
      if (error) throw investmentError(error);
      return fetchKyc();
    },
    async submitKyc(): Promise<KycSummary> {
      if (!(await hasSession())) return domain.submitKyc();
      const own = await fetchKycOwn();
      if (!own.submission) throw new Error("Start your verification first.");
      const { error } = await client.rpc("kyc_submit", { p_submission_id: own.submission.id });
      if (error) throw investmentError(error);
      return fetchKyc();
    },
    async setTransactionPin(pin: string): Promise<void> {
      if (!(await hasSession())) return domain.setTransactionPin(pin);
      const { error } = await client.rpc("set_transaction_pin", { p_pin: pin });
      if (error) throw investmentError(error);
    },
    async hasTransactionPin(): Promise<boolean> {
      if (!(await hasSession())) return domain.hasTransactionPin();
      const { data, error } = await client.rpc("quote_withdrawal", { p_amount_minor: 0 });
      if (error) throw investmentError(error);
      return !!(data as RawWithdrawalQuote | null)?.pin_set;
    },

    // ── dashboard — composed from real reads over the mock shell ────────────
    async getDashboard(): Promise<DashboardSummary> {
      const shell = await domain.getDashboard();
      if (!(await hasSession())) return shell;
      const [wallet, investments, opportunities, profile] = await Promise.all([
        fetchWalletSummary(),
        fetchInvestments(),
        fetchOpportunities(),
        fetchInvestorProfile(),
      ]);
      const active = investments.filter((i) => i.status === "ACTIVE");
      const completed = investments.filter((i) => i.status === "COMPLETED");
      const activePrincipal = active.reduce((s, i) => s + i.principal, 0);
      const expectedProfitActive = active.reduce((s, i) => s + i.expectedProfit, 0);
      const walletTotal = wallet.balances.AVAILABLE + wallet.balances.RESERVED + wallet.balances.BONUS + wallet.balances.PENDING;
      const next = active.filter((i) => i.maturesAt).sort((a, b) => a.maturesAt!.localeCompare(b.maturesAt!))[0];
      const open = opportunities.filter((o) => o.round.status === "OPEN" || o.round.status === "NEARING_CAPACITY");
      return {
        ...shell,
        greetingName: profile.displayName.split(/\s+/)[0] || shell.greetingName,
        asOf: new Date().toISOString(),
        totalPortfolioValue: activePrincipal + walletTotal,
        activePrincipal,
        activeInvestmentCount: active.length,
        expectedProfitActive,
        projectedMaturityValueActive: activePrincipal + expectedProfitActive,
        realisedProfitLifetime: completed.reduce((s, i) => s + i.expectedProfit, 0),
        wallet: {
          available: wallet.balances.AVAILABLE,
          reserved: wallet.balances.RESERVED,
          bonus: wallet.balances.BONUS,
          pending: wallet.balances.PENDING,
        },
        nextMaturity: next
          ? {
              investmentId: next.id,
              propertyName: next.propertyName,
              maturesAt: next.maturesAt!,
              maturityValue: next.maturityValue,
              daysRemaining: next.daysRemaining ?? 0,
            }
          : null,
        featuredOpportunitySlugs: open.slice(0, 3).map((o) => o.property.slug),
        openOpportunityCount: open.length,
      };
    },

    // ── catalogue — real (Phase 6B) ─────────────────────────────────────────
    async listOpportunities(filter?: OpportunityFilter): Promise<Opportunity[]> {
      if (!(await hasSession())) return domain.listOpportunities(filter);
      return applyOpportunityFilter(await fetchOpportunities(), filter);
    },
    async getOpportunity(slug: string): Promise<Opportunity | null> {
      if (!(await hasSession())) return domain.getOpportunity(slug);
      const opps = await fetchOpportunities();
      return opps.find((o) => o.property.slug === slug) ?? null;
    },

    // ── checkout — real (Phase 6B) ──────────────────────────────────────────
    async quoteInvestment(roundId: string, slots: number): Promise<InvestmentQuote> {
      if (!(await hasSession())) return domain.quoteInvestment(roundId, slots);
      const { data, error } = await client.rpc("investment_quote", { p_round_id: roundId, p_slots: slots });
      if (error) throw investmentError(error);
      return mapQuote(data as RawQuote);
    },
    async submitInvestment(input): Promise<InvestmentSubmission> {
      if (!(await hasSession())) return domain.submitInvestment(input);
      const { data, error } = await client.rpc("request_investment", {
        p_round_id: input.roundId,
        p_slots: input.slots,
        p_idempotency_key: input.idempotencyKey,
        p_funding_source: input.fundingSource,
      });
      if (error) throw investmentError(error);
      return mapSubmission(data as RawInvestmentRow);
    },
    async getSubmission(reference: string): Promise<InvestmentSubmission | null> {
      if (!(await hasSession())) return domain.getSubmission(reference);
      const { data, error } = await client
        .from("investments")
        .select("id,reference,status,funding_source,principal_minor,currency,created_at")
        .eq("reference", reference)
        .maybeSingle();
      if (error) throw investmentError(error);
      return data ? mapSubmission(data as RawInvestmentRow) : null;
    },

    // ── portfolio — real (Phase 6B) ─────────────────────────────────────────
    listInvestments: (filter?: InvestmentFilter) =>
      hasSession().then((ok) => (ok ? fetchInvestments(filter) : domain.listInvestments(filter))),
    async getInvestment(id: string): Promise<Investment | null> {
      if (!(await hasSession())) return domain.getInvestment(id);
      const { data, error } = await client
        .from("investments")
        .select(INVESTMENT_SELECT)
        .eq("id", id)
        .maybeSingle();
      if (error) throw investmentError(error);
      if (!data) return null;
      const row = data as unknown as RawInvestmentRow;
      const { data: events } = await client
        .from("investment_events")
        .select("id,investment_id,event_type,created_at,metadata")
        .eq("investment_id", row.id)
        .order("created_at", { ascending: true });
      return mapInvestment(row, (events ?? []) as RawEventRow[]);
    },

    // ── wallet — real (Phase 6B) ────────────────────────────────────────────
    getWallet: () => hasSession().then((ok) => (ok ? fetchWalletSummary() : domain.getWallet())),
    listTransactions: (filter?: TransactionFilter) =>
      hasSession().then(async (ok) =>
        ok ? applyTransactionFilter(await fetchTransactions(), filter) : domain.listTransactions(filter),
      ),
    async getTransaction(id: string) {
      if (!(await hasSession())) return domain.getTransaction(id);
      const entryId = Number(id.replace(/^tx-/, ""));
      const { data, error } = await client
        .from("ledger_entries")
        .select("id,direction,amount_minor,balance_after_minor,created_at, account:ledger_accounts!inner(bucket), journal:journal_entries!inner(reference,journal_type,currency,description,entity_type,entity_id)")
        .eq("id", entryId)
        .maybeSingle();
      if (error) throw investmentError(error);
      if (!data) return null;
      const e = data as unknown as {
        id: number; direction: "CREDIT" | "DEBIT"; amount_minor: number;
        balance_after_minor: number | null; created_at: string;
        account: { bucket: WalletAccountType };
        journal: { reference: string; journal_type: string; currency: "NGN" | "USD"; description: string | null; entity_type: string | null; entity_id: string | null };
      };
      return mapTransaction({
        entry_id: e.id,
        journal_id: "",
        reference: e.journal.reference,
        journal_type: e.journal.journal_type,
        bucket: e.account.bucket,
        direction: e.direction,
        amount_minor: e.amount_minor,
        currency: e.journal.currency,
        description: e.journal.description,
        entity_type: e.journal.entity_type,
        entity_id: e.journal.entity_id,
        balance_after_minor: e.balance_after_minor,
        occurred_at: e.created_at,
      });
    },

    // Non-secret provider/limit options — server truth via deposit_options().
    async getDepositOptions(): Promise<DepositOptions> {
      const { data, error } = await client.rpc("deposit_options");
      if (error || !data) return domain.getDepositOptions();
      const o = data as {
        min_minor?: number | null;
        max_minor?: number | null;
        expiry_minutes?: number | null;
        providers?: Record<string, boolean>;
      };
      return {
        currency: "NGN",
        minDeposit: o.min_minor ?? 0,
        maxDeposit: o.max_minor ?? null,
        expiryMinutes: o.expiry_minutes ?? null,
        providers: (["PAYSTACK", "KORAPAY"] as const).map((id) => ({
          id,
          enabled: !!o.providers?.[id],
        })),
      };
    },
    // Real deposit init through the initialize-deposit Edge Function —
    // provider call + secrets stay server-side. Falls back to the mock when
    // there is no session (demo toolbar path).
    async createDeposit(input) {
      const {
        data: { session },
      } = await client.auth.getSession();
      if (!session) return domain.createDeposit(input);
      const provider = input.provider ?? "PAYSTACK";
      const { data, error } = await client.functions.invoke("initialize-deposit", {
        body: {
          amount_minor: input.amount,
          provider,
          idempotency_key: input.idempotencyKey,
        },
      });
      if (error) throw new Error(await invokeErrorMessage(error));
      const init = data as {
        deposit_id: string;
        reference: string;
        status: string;
        checkout_url: string | null;
      };
      const intent: DepositIntent = {
        id: init.deposit_id,
        reference: init.reference,
        amount: input.amount,
        currency: "NGN",
        method: input.method,
        status: wireStatus(init.status),
        fee: 0,
        createdAt: new Date().toISOString(),
        creditedAt: null,
        checkoutUrl: init.checkout_url ?? null,
      };
      return intent;
    },
    async getDeposit(id) {
      const row = await client
        .from("deposits")
        .select("id,reference,status,provider,amount_minor,currency,created_at,confirmed_at,metadata")
        .eq("id", id)
        .maybeSingle();
      if (row.error || !row.data) return domain.getDeposit(id);
      const d = row.data as {
        id: string;
        reference: string;
        status: string;
        provider: string;
        amount_minor: number;
        currency: string;
        created_at: string;
        confirmed_at: string | null;
        metadata: { checkout_url?: string } | null;
      };
      const intent: DepositIntent = {
        id: d.id,
        reference: d.reference,
        amount: d.amount_minor,
        currency: (d.currency === "USD" ? "USD" : "NGN") as DepositIntent["currency"],
        method: d.provider === "KORAPAY" ? "BANK_TRANSFER" : "CARD",
        status: wireStatus(d.status),
        fee: 0,
        createdAt: d.created_at,
        creditedAt: d.confirmed_at,
        checkoutUrl: d.metadata?.checkout_url ?? null,
      };
      return intent;
    },
    // ── withdrawals — real (Phase 8B): server quote, PIN + KYC gates ─────────
    quoteWithdrawal: (amount, destinationId) =>
      hasSession().then((ok) => (ok ? fetchWithdrawalQuote(amount, destinationId) : domain.quoteWithdrawal(amount, destinationId))),
    async requestWithdrawal(input) {
      if (!(await hasSession())) return domain.requestWithdrawal(input);
      const { data, error } = await client.rpc("request_withdrawal", {
        p_amount_minor: input.amount,
        p_destination: null,
        p_idempotency_key: input.idempotencyKey,
        p_pin: input.pin,
        p_bank_account_id: input.destinationId,
      });
      if (error) throw investmentError(error);
      const row = data as RawWithdrawalRow;
      const fresh = await fetchWithdrawal(row.id);
      if (fresh) return fresh;
      return mapWithdrawal(row, [
        {
          id: 0,
          withdrawal_id: row.id,
          from_status: null,
          to_status: "REQUESTED",
          source: "USER",
          note: "withdrawal requested",
          created_at: row.requested_at,
        },
      ]);
    },
    getWithdrawal: (id) => hasSession().then((ok) => (ok ? fetchWithdrawal(id) : domain.getWithdrawal(id))),
    async listWithdrawals(): Promise<Withdrawal[]> {
      if (!(await hasSession())) return domain.listWithdrawals();
      const { data, error } = await client.from("withdrawals").select(WD_SELECT).order("requested_at", { ascending: false });
      if (error) throw investmentError(error);
      const rows = (data ?? []) as unknown as RawWithdrawalRow[];
      const events = await fetchWithdrawalEvents(rows.map((r) => r.id));
      return rows.map((r) => mapWithdrawal(r, events.get(r.id) ?? []));
    },
    async saveBankAccount(input: BankAccountInput): Promise<PayoutMethod> {
      if (!(await hasSession())) return domain.saveBankAccount(input);
      const { data, error } = await client.rpc("save_bank_account", {
        p_bank_name: input.bankName,
        p_bank_code: input.bankCode,
        p_account_number: input.accountNumber,
        p_account_name: input.accountName,
        p_make_default: input.makeDefault ?? false,
      });
      if (error) throw investmentError(error);
      return mapPayoutMethod(data as RawBankAccount);
    },
    async archiveBankAccount(id: string): Promise<void> {
      if (!(await hasSession())) return domain.archiveBankAccount(id);
      const { error } = await client.rpc("archive_bank_account", { p_id: id });
      if (error) throw investmentError(error);
    },
    async setDefaultBankAccount(id: string): Promise<void> {
      if (!(await hasSession())) return domain.setDefaultBankAccount(id);
      const { error } = await client.rpc("set_default_bank_account", { p_id: id });
      if (error) throw investmentError(error);
    },
    getReferralSummary: () => domain.getReferralSummary(),
    listReferrals: () => domain.listReferrals(),
    listNotifications: () => domain.listNotifications(),
    markNotificationRead: (id) => domain.markNotificationRead(id),
    markAllNotificationsRead: () => domain.markAllNotificationsRead(),
    getContent: () => domain.getContent(),
  };
}
