/**
 * In-memory implementation of `InvestorDataSource`.
 *
 * Plays the role of the trusted backend for domain data: it "computes"
 * quotes, fees and eligibility so that screens never do. Per-domain
 * Supabase/PostgreSQL adapters replace it in later phases without touching
 * the UI. (Firebase was superseded — see docs/DECISIONS.md.)
 */
import type {
  DashboardSummary,
  DepositIntent,
  DepositOptions,
  Investment,
  InvestmentQuote,
  InvestmentSubmission,
  InvestorDataSource,
  KycSummary,
  Notification,
  Opportunity,
  OpportunityFilter,
  PendingAction,
  Session,
  Transaction,
  UserProfile,
  WalletSummary,
  Withdrawal,
  WithdrawalQuote,
} from "@rentbrown/types";
import { daysBetween, formatMoney, naira } from "@rentbrown/utils";
import { properties } from "./fixtures/catalogue";
import { content } from "./fixtures/content";
import * as ada from "./fixtures/investor";
import { MOCK_NOW } from "./fixtures/investor";
import { opportunityForRound, applyOpportunityFilter } from "./opportunities";
import { buildScenario, type MockScenario, type ScenarioState } from "./scenarios";

export interface MockDataSourceOptions {
  scenario?: MockScenario;
  /** Simulated network latency so loading/skeleton states are visible. */
  latencyMs?: number;
  /** Methods that should reject with a network-style error (for error-state demos). */
  failing?: Array<keyof InvestorDataSource>;
  /** Override "now" (ISO). Defaults to the fixture anchor 2026-09-24T10:00Z. */
  now?: string;
}

export class MockNetworkError extends Error {
  readonly code = "NETWORK_ERROR";
  constructor(method: string) {
    super(`We couldn't reach RentBrown while loading ${method}. Check your connection and try again.`);
    this.name = "MockNetworkError";
  }
}

let refCounter = 9000;
const nextRef = (prefix: string, now: string) => {
  const d = new Date(now);
  const yymmdd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  refCounter += 1;
  return `RB-${prefix}-${yymmdd}-${refCounter}`;
};

export function createMockDataSource(options: MockDataSourceOptions = {}): InvestorDataSource & {
  readonly scenario: MockScenario;
  readonly now: string;
} {
  const scenario = options.scenario ?? "default";
  const latency = options.latencyMs ?? 450;
  const failing = new Set(options.failing ?? []);
  const now = options.now ?? MOCK_NOW;

  // Mutable per-instance state (deep-ish copies so scenarios stay pristine).
  const state: ScenarioState = buildScenario(scenario);
  let session: Session | null = state.signedIn ? { userId: state.profile.id, displayName: state.profile.displayName, issuedAt: now } : null;
  const submissions = new Map<string, InvestmentSubmission>();
  const deposits = new Map<string, DepositIntent>();

  async function respond<T>(method: keyof InvestorDataSource, value: () => T): Promise<T> {
    if (latency > 0) await new Promise((r) => setTimeout(r, latency));
    if (failing.has(method)) throw new MockNetworkError(method);
    return value();
  }

  const clone = <T>(v: T): T => (typeof structuredClone === "function" ? structuredClone(v) : (JSON.parse(JSON.stringify(v)) as T));

  const listOpps = (filter?: OpportunityFilter): Opportunity[] =>
    applyOpportunityFilter(state.roundIds.map(opportunityForRound).filter((o): o is Opportunity => o !== null), filter);

  const dashboard = (): DashboardSummary => {
    const active = state.investments.filter((i) => i.status === "ACTIVE");
    const completed = state.investments.filter((i) => i.status === "COMPLETED");
    const activePrincipal = active.reduce((s, i) => s + i.principal, 0);
    const expectedProfitActive = active.reduce((s, i) => s + i.expectedProfit, 0);
    const walletTotal = Object.values(state.wallet.balances).reduce((s, v) => s + v, 0);
    const next = active.filter((i) => i.maturesAt).sort((a, b) => a.maturesAt!.localeCompare(b.maturesAt!))[0];
    const open = listOpps({ status: ["OPEN", "NEARING_CAPACITY"] });
    return {
      greetingName: state.profile.firstName,
      asOf: now,
      currency: "NGN",
      totalPortfolioValue: activePrincipal + walletTotal,
      activePrincipal,
      activeInvestmentCount: active.length,
      expectedProfitActive,
      projectedMaturityValueActive: activePrincipal + expectedProfitActive,
      realisedProfitLifetime: completed.reduce((s, i) => s + i.expectedProfit, 0),
      wallet: {
        available: state.wallet.balances.AVAILABLE,
        reserved: state.wallet.balances.RESERVED,
        bonus: state.wallet.balances.BONUS,
        pending: state.wallet.balances.PENDING,
      },
      nextMaturity: next
        ? { investmentId: next.id, propertyName: next.propertyName, maturesAt: next.maturesAt!, maturityValue: next.maturityValue, daysRemaining: daysBetween(now, next.maturesAt!) }
        : null,
      unreadNotifications: state.notifications.filter((n) => !n.read).length,
      referral: { earned: state.referralSummary.earnedRewards, pending: state.referralSummary.pendingRewards },
      kycStatus: state.kyc.status,
      pendingActions: pendingActions(),
      featuredOpportunitySlugs: open.slice(0, 3).map((o) => o.property.slug),
      openOpportunityCount: open.length,
    };
  };

  const pendingActions = (): PendingAction[] => {
    const items: PendingAction[] = [];
    if (!state.profile.emailVerified) items.push({ id: "pa_email", kind: "VERIFY_EMAIL", tone: "warning", title: "Verify your email address", body: "Confirm your email to secure your account and enable investing." });
    if (state.kyc.status === "NOT_STARTED") items.push({ id: "pa_kyc", kind: "COMPLETE_KYC", tone: "info", title: "Complete identity verification", body: "Required before your first withdrawal. Takes about five minutes.", link: { kind: "kyc" } });
    if (state.kyc.status === "REJECTED") items.push({ id: "pa_kyc_rej", kind: "KYC_ACTION_REQUIRED", tone: "error", title: "Verification needs your attention", body: state.kyc.rejectionReason ?? "One of your documents could not be accepted.", link: { kind: "kyc" } });
    if (state.kyc.status === "PENDING_REVIEW") items.push({ id: "pa_kyc_pend", kind: "KYC_PENDING", tone: "pending", title: "Verification under review", body: "Your documents were received. Reviews usually complete within one business day.", link: { kind: "kyc" } });
    if (!state.profile.security.hasTransactionPin) items.push({ id: "pa_pin", kind: "SET_TRANSACTION_PIN", tone: "info", title: "Set your transaction PIN", body: "Your PIN confirms investments and withdrawals.", link: { kind: "security" } });
    for (const w of state.withdrawals.filter((w) => w.status === "UNDER_REVIEW")) items.push({ id: `pa_${w.id}`, kind: "WITHDRAWAL_UNDER_REVIEW", tone: "pending", title: `Withdrawal of ${formatMoney(w.amount)} under review`, body: `${w.reference} · ${formatMoney(w.netAmount)} to ${w.destination.bankName} ${w.destination.accountNumberMasked} when approved.`, link: { kind: "withdrawal", id: w.id } });
    if (state.wallet.balances.PENDING > 0) items.push({ id: "pa_dep", kind: "DEPOSIT_CONFIRMING", tone: "pending", title: `${formatMoney(state.wallet.balances.PENDING)} deposit confirming`, body: "Your transfer has been received and is being confirmed with the bank.", link: { kind: "wallet" } });
    for (const i of state.investments.filter((i) => i.status === "PAYMENT_PENDING")) items.push({ id: `pa_${i.id}`, kind: "PAYMENT_PENDING", tone: "warning", title: `Complete payment for ${i.propertyName}`, body: `Transfer ${formatMoney(i.principal)} using the instructions issued. Slots are confirmed when payment is verified.`, link: { kind: "investment", id: i.id } });
    if (state.referralSummary.pendingRewards > 0) items.push({ id: "pa_ref", kind: "REFERRAL_REWARD_PENDING", tone: "neutral", title: `${formatMoney(state.referralSummary.pendingRewards)} in referral rewards pending`, body: "Credited when the people you referred complete verification and invest.", link: { kind: "referrals" } });
    return items;
  };

  const quote = (roundId: string, slots: number): InvestmentQuote => {
    const opp = opportunityForRound(roundId);
    if (!opp) throw new Error("Round not found");
    const { plan, round } = opp;
    const maxSlots = Math.min(round.availableSlots, plan.maxSlotsPerUser ?? Number.MAX_SAFE_INTEGER);
    const s = Math.max(plan.minSlots, Math.min(slots, Math.max(maxSlots, plan.minSlots)));
    const principal = plan.slotPrice * s;
    const expectedProfit = Math.round((principal * plan.roiBps) / 10_000);
    const fees = Math.round((principal * plan.investmentFeeBps) / 10_000);
    const walletAvailable = state.wallet.balances.AVAILABLE;
    const walletOk = walletAvailable >= principal + fees;
    return {
      roundId,
      slots: s,
      slotPrice: plan.slotPrice,
      principal,
      roiBps: plan.roiBps,
      expectedProfit,
      maturityValue: principal + expectedProfit,
      fees,
      currency: plan.currency,
      duration: plan.duration,
      projectedStartAt: round.projectedStartAt,
      projectedMaturityAt: round.projectedMaturityAt,
      minSlots: plan.minSlots,
      maxSlots,
      availableSlots: round.availableSlots,
      fundingOptions: [
        { source: "WALLET", available: walletOk, walletAvailable, reason: walletOk ? undefined : `Your available balance is ${formatMoney(walletAvailable)}. Top up or choose another method.` },
        { source: "BANK_TRANSFER", available: true },
        { source: "CARD", available: true },
      ],
      quotedAt: now,
      expiresAt: new Date(new Date(now).getTime() + 15 * 60_000).toISOString(),
    };
  };

  const withdrawalQuote = (amount: number, destinationId?: string): WithdrawalQuote => {
    const p = state.wallet.policies;
    const available = state.wallet.balances.AVAILABLE;
    const fee = Math.min(Math.round((amount * p.withdrawalFeeBps) / 10_000), p.withdrawalFeeCap);
    const dest = destinationId ? state.wallet.payoutMethods.find((m) => m.id === destinationId) : state.wallet.payoutMethods.find((m) => m.isDefault);
    let blockedReason: string | undefined;
    if (p.kycRequiredForWithdrawal && state.kyc.status !== "VERIFIED") blockedReason = "Identity verification is required before withdrawals.";
    else if (!state.profile.security.hasTransactionPin) blockedReason = "Set a transaction PIN before withdrawing.";
    else if (amount <= 0) blockedReason = "Enter an amount to withdraw.";
    else if (amount < p.minWithdrawal) blockedReason = `Minimum withdrawal is ${formatMoney(p.minWithdrawal)}.`;
    else if (amount > available) blockedReason = `Amount exceeds your available balance of ${formatMoney(available)}.`;
    else if (!dest) blockedReason = "Choose a verified bank account.";
    else if (!dest.verified) blockedReason = "This bank account has not been verified.";
    return {
      amount,
      fee,
      netAmount: Math.max(0, amount - fee),
      currency: "NGN",
      feeDescription: `${p.withdrawalFeeBps / 100}% fee, capped at ${formatMoney(p.withdrawalFeeCap)}`,
      minAmount: p.minWithdrawal,
      maxAmount: available,
      eligible: !blockedReason,
      blockedReason,
      estimatedArrival: "Typically within 1 business day after review",
    };
  };

  return {
    scenario,
    now,

    getSession: () => respond("getSession", () => session),
    signIn: (input) => respond("signIn", () => {
      if (!input.email.includes("@") || input.password.length < 8) throw new Error("We couldn't sign you in with those details.");
      session = { userId: state.profile.id, displayName: state.profile.displayName, issuedAt: now };
      return session;
    }),
    signUp: (input) => respond("signUp", () => {
      session = { userId: "usr_new", displayName: input.fullName, issuedAt: now };
      return session;
    }),
    signOut: () => respond("signOut", () => { session = null; }),

    getProfile: () => respond("getProfile", () => clone<UserProfile>(state.profile)),
    getKyc: () => respond("getKyc", () => clone<KycSummary>(state.kyc)),
    saveKycDraft: (input) => respond("saveKycDraft", () => {
      const done = new Set<"PERSONAL" | "IDENTITY" | "ADDRESS" | "SELFIE">();
      if (state.kyc.status === "VERIFIED") done.add("PERSONAL");
      if (input.fullLegalName && input.gender) done.add("PERSONAL");
      if (input.bvn) done.add("IDENTITY");
      if (input.poaType) done.add("ADDRESS");
      if (state.kyc.status === "PENDING_REVIEW" || state.kyc.status === "VERIFIED") {
        state.kyc.steps.forEach((s) => done.add(s.id));
      }
      state.kyc.status = state.kyc.status === "VERIFIED" ? "VERIFIED" : "IN_PROGRESS";
      let currentSet = false;
      state.kyc.steps = state.kyc.steps.map((s) => {
        if (done.has(s.id)) return { ...s, state: "complete" as const };
        if (!currentSet) {
          currentSet = true;
          return { ...s, state: "current" as const };
        }
        return { ...s, state: "upcoming" as const };
      });
      return clone<KycSummary>(state.kyc);
    }),
    uploadKycDocument: (kind) => respond("uploadKycDocument", () => {
      const stepId = kind === "SELFIE" ? "SELFIE" : "ADDRESS";
      state.kyc.status = "IN_PROGRESS";
      state.kyc.steps = state.kyc.steps.map((s) => (s.id === stepId ? { ...s, state: "complete" as const } : s));
      return clone<KycSummary>(state.kyc);
    }),
    submitKyc: () => respond("submitKyc", () => {
      state.kyc.status = "PENDING_REVIEW";
      state.kyc.submittedAt = now;
      state.kyc.steps = state.kyc.steps.map((s) => ({ ...s, state: "complete" as const }));
      return clone<KycSummary>(state.kyc);
    }),
    setTransactionPin: (pin) => respond("setTransactionPin", () => {
      if (!/^\d{6}$/.test(pin)) throw new Error("PIN must be exactly 6 digits.");
      state.profile.security.hasTransactionPin = true;
    }),
    hasTransactionPin: () => respond("hasTransactionPin", () => state.profile.security.hasTransactionPin),
    getDashboard: () => respond("getDashboard", dashboard),

    listOpportunities: (filter) => respond("listOpportunities", () => clone(listOpps(filter))),
    getOpportunity: (slug) => respond("getOpportunity", () => {
      const property = properties.find((p) => p.slug === slug);
      if (!property) return null;
      const opp = state.roundIds.map(opportunityForRound).find((o) => o?.property.id === property.id);
      return opp ? clone(opp) : null;
    }),

    quoteInvestment: (roundId, slots) => respond("quoteInvestment", () => quote(roundId, slots)),
    submitInvestment: (input) => respond("submitInvestment", () => {
      const existing = submissions.get(input.idempotencyKey);
      if (existing) return clone(existing);
      const q = quote(input.roundId, input.slots);
      const opp = opportunityForRound(input.roundId)!;
      const reference = nextRef("IV", now);
      let submission: InvestmentSubmission;
      if (input.fundingSource === "WALLET") {
        const option = q.fundingOptions.find((f) => f.source === "WALLET")!;
        if (!option.available) {
          submission = { reference, investmentId: null, paymentStatus: "FAILED", fundingSource: "WALLET", amount: q.principal, currency: q.currency, submittedAt: now, failureReason: option.reason };
        } else {
          state.wallet.balances.AVAILABLE -= q.principal;
          const inv: Investment = {
            id: `inv_${reference.toLowerCase()}`, reference, roundId: input.roundId, propertySlug: opp.property.slug, propertyName: opp.property.name,
            propertyImage: opp.property.images[0] ?? "ikoyi-residences", locationLabel: opp.property.location.label, planName: opp.plan.name, status: "ACTIVE", currency: q.currency,
            slots: q.slots, slotPrice: q.slotPrice, principal: q.principal, roiBps: q.roiBps, expectedProfit: q.expectedProfit, maturityValue: q.maturityValue, duration: q.duration,
            fundingSource: "WALLET", activatedAt: now, maturesAt: q.projectedMaturityAt, completedAt: null, termProgressPct: 0, daysRemaining: daysBetween(now, q.projectedMaturityAt),
            timeline: [
              { id: "paid", label: "Payment confirmed", at: now, state: "done", reference },
              { id: "active", label: "Investment active", at: now, state: "done" },
              { id: "mid", label: "Term midpoint", at: null, state: "upcoming" },
              { id: "maturity", label: "Maturity", at: q.projectedMaturityAt, state: "upcoming" },
              { id: "settle", label: "Settlement to wallet", at: null, state: "upcoming" },
            ],
          };
          state.investments.unshift(inv);
          const tx: Transaction = { id: `tx_${reference}`, reference, type: "INVESTMENT", status: "SUCCESSFUL", direction: "DEBIT", amount: q.principal, currency: q.currency, account: "AVAILABLE", title: `${opp.property.name} — ${q.slots} ${q.slots === 1 ? "slot" : "slots"}`, description: `Principal allocated to Round ${opp.round.roundNumber}`, occurredAt: now, related: { kind: "investment", id: inv.id } };
          state.transactions.unshift(tx);
          submission = { reference, investmentId: inv.id, paymentStatus: "SUCCESSFUL", fundingSource: "WALLET", amount: q.principal, currency: q.currency, submittedAt: now };
        }
      } else if (input.fundingSource === "BANK_TRANSFER") {
        submission = {
          reference, investmentId: null, paymentStatus: "PENDING", fundingSource: "BANK_TRANSFER", amount: q.principal, currency: q.currency, submittedAt: now,
          transferInstructions: { bankName: "Providus Bank", accountNumber: "9912004682", accountName: `RentBrown Collections / ${state.profile.displayName}`, reference: reference.replace("IV", "PAY"), expiresAt: new Date(new Date(now).getTime() + 24 * 3_600_000).toISOString() },
        };
      } else {
        submission = { reference, investmentId: null, paymentStatus: "CONFIRMING", fundingSource: "CARD", amount: q.principal, currency: q.currency, submittedAt: now };
      }
      submissions.set(input.idempotencyKey, submission);
      submissions.set(reference, submission);
      return clone(submission);
    }),
    getSubmission: (reference) => respond("getSubmission", () => clone(submissions.get(reference) ?? null)),

    listInvestments: (filter) => respond("listInvestments", () => {
      const status = filter?.status ?? "ALL";
      const items = state.investments.filter((i) =>
        status === "ALL" ? true : status === "ACTIVE" ? ["ACTIVE", "PAYMENT_PENDING", "MATURITY_DUE", "SETTLING", "REVIEW_REQUIRED"].includes(i.status) : ["COMPLETED", "REFUNDED", "FAILED"].includes(i.status),
      );
      return clone(items);
    }),
    getInvestment: (id) => respond("getInvestment", () => clone(state.investments.find((i) => i.id === id) ?? null)),

    getWallet: () => respond("getWallet", () => clone<WalletSummary>({ ...state.wallet, total: Object.values(state.wallet.balances).reduce((s, v) => s + v, 0), updatedAt: now })),
    listTransactions: (filter) => respond("listTransactions", () => {
      let items = state.transactions;
      if (filter?.type && filter.type !== "ALL") items = items.filter((t) => (filter.type as string[]).includes(t.type));
      if (filter?.status && filter.status !== "ALL") items = items.filter((t) => (filter.status as string[]).includes(t.status));
      if (filter?.query) {
        const q = filter.query.toLowerCase();
        items = items.filter((t) => `${t.title} ${t.reference} ${t.description}`.toLowerCase().includes(q));
      }
      return clone(items);
    }),
    getTransaction: (id) => respond("getTransaction", () => clone(state.transactions.find((t) => t.id === id) ?? null)),

    getDepositOptions: () => respond("getDepositOptions", () =>
      clone<DepositOptions>({
        currency: "NGN",
        minDeposit: state.wallet.policies.minDeposit,
        maxDeposit: null,
        expiryMinutes: null,
        providers: [
          { id: "PAYSTACK", enabled: true },
          { id: "KORAPAY", enabled: true },
        ],
      })),
    createDeposit: (input) => respond("createDeposit", () => {
      const existing = deposits.get(input.idempotencyKey);
      if (existing) return clone(existing);
      const reference = nextRef("DP", now);
      const intent: DepositIntent = {
        id: `dep_${reference.toLowerCase()}`, reference, amount: input.amount, currency: "NGN", method: input.method,
        status: input.method === "BANK_TRANSFER" ? "AWAITING_TRANSFER" : "CONFIRMING", fee: 0, createdAt: now, creditedAt: null,
        transferInstructions: input.method === "BANK_TRANSFER" ? { bankName: "Providus Bank", accountNumber: "9912004682", accountName: `RentBrown / ${state.profile.displayName}`, reference, expiresAt: new Date(new Date(now).getTime() + 24 * 3_600_000).toISOString() } : undefined,
      };
      deposits.set(input.idempotencyKey, intent);
      deposits.set(intent.id, intent);
      return clone(intent);
    }),
    getDeposit: (id) => respond("getDeposit", () => clone(deposits.get(id) ?? state.deposits.find((d) => d.id === id) ?? null)),

    quoteWithdrawal: (amount, destinationId) => respond("quoteWithdrawal", () => withdrawalQuote(amount, destinationId)),
    requestWithdrawal: (input) => respond("requestWithdrawal", () => {
      const q = withdrawalQuote(input.amount, input.destinationId);
      if (!q.eligible) throw new Error(q.blockedReason);
      const destination = state.wallet.payoutMethods.find((m) => m.id === input.destinationId)!;
      const reference = nextRef("WD", now);
      state.wallet.balances.AVAILABLE -= input.amount;
      state.wallet.balances.RESERVED += input.amount;
      const w: Withdrawal = {
        id: `wd_${reference.toLowerCase()}`, reference, amount: input.amount, fee: q.fee, netAmount: q.netAmount, currency: "NGN", destination, status: "UNDER_REVIEW", requestedAt: now, completedAt: null,
        timeline: [
          { status: "REQUESTED", at: now },
          { status: "UNDER_REVIEW", at: now, note: "Funds reserved. Reviews typically complete within 1 business day." },
          { status: "PROCESSING", at: null },
          { status: "COMPLETED", at: null },
        ],
      };
      state.withdrawals.unshift(w);
      state.transactions.unshift({ id: `tx_${reference}`, reference, type: "WITHDRAWAL", status: "UNDER_REVIEW", direction: "DEBIT", amount: input.amount, currency: "NGN", account: "RESERVED", title: "Bank withdrawal", description: `To ${destination.bankName} ${destination.accountNumberMasked} · reserved pending review`, occurredAt: now, related: { kind: "withdrawal", id: w.id } });
      return clone(w);
    }),
    getWithdrawal: (id) => respond("getWithdrawal", () => clone(state.withdrawals.find((w) => w.id === id) ?? null)),
    listWithdrawals: () => respond("listWithdrawals", () => clone(state.withdrawals)),
    saveBankAccount: (input) => respond("saveBankAccount", () => {
      const method = {
        id: `pm_${input.accountNumber.slice(-4)}_${state.wallet.payoutMethods.length}`,
        bankName: input.bankName,
        bankCode: input.bankCode,
        accountNumberMasked: `•••• ${input.accountNumber.slice(-4)}`,
        accountName: input.accountName,
        isDefault: input.makeDefault ?? state.wallet.payoutMethods.length === 0,
        verified: true,
        addedAt: now,
      };
      if (method.isDefault) state.wallet.payoutMethods.forEach((m) => (m.isDefault = false));
      state.wallet.payoutMethods.push(method);
      return clone(method);
    }),
    archiveBankAccount: (id) => respond("archiveBankAccount", () => {
      state.wallet.payoutMethods = state.wallet.payoutMethods.filter((m) => m.id !== id);
    }),
    setDefaultBankAccount: (id) => respond("setDefaultBankAccount", () => {
      state.wallet.payoutMethods.forEach((m) => (m.isDefault = m.id === id));
    }),

    getReferralSummary: () => respond("getReferralSummary", () => clone(state.referralSummary)),
    listReferrals: () => respond("listReferrals", () => clone(state.referrals)),

    listNotifications: () => respond("listNotifications", () => clone<Notification[]>(state.notifications)),
    markNotificationRead: (id) => respond("markNotificationRead", () => { const n = state.notifications.find((n) => n.id === id); if (n) n.read = true; }),
    markAllNotificationsRead: () => respond("markAllNotificationsRead", () => { state.notifications.forEach((n) => { n.read = true; }); }),

    getContent: () => respond("getContent", () => clone(content)),
  };
}

export { ada, MOCK_NOW, naira };
