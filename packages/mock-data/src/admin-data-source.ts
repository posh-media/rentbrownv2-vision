/**
 * In-memory implementation of `AdminDataSource`.
 *
 * Plays the role of the trusted ops backend for Phase 1. Mutations record
 * INTENT: they update the in-memory store so queues visibly change and
 * append an `AuditEvent`, exactly like a real admin API would project —
 * but nothing here is authoritative and a page reload resets everything.
 */
import type {
  AdminActionInput,
  AdminActionResult,
  AdminActor,
  AdminDataSource,
  AdminPlanDetail,
  AdminPlanRow,
  AdminPropertyDetail,
  AdminPropertyRow,
  AdminRoundRow,
  AdminTaskRequirement,
  AdminUserDetail,
  AuditEvent,
  AuditFilter,
  FinanceFilter,
  InvestmentAdminFilter,
  KycFilter,
  KycDecisionInput,
  LedgerOverview,
  Page,
  PageRequest,
  ReferralOverview,
  ReportBundle,
  RewardGrantRow,
  RoundFilter,
  AdminRole,
  UserFilter,
  WithdrawalDecisionInput,
} from "@rentbrown/types";
import { plans, properties, rounds } from "./fixtures/catalogue";
import * as fixtures from "./fixtures/admin";
import { MOCK_NOW } from "./fixtures/investor";

export interface MockAdminDataSourceOptions {
  /** Actor role for the mock session. Default FINANCE_ADMIN ("Tunde A."). */
  role?: AdminRole;
  /** Simulated network latency so loading states are visible. */
  latencyMs?: number;
  /** Override "now" (ISO). Defaults to the fixture anchor. */
  now?: string;
}

const clone = <T>(v: T): T =>
  typeof structuredClone === "function" ? structuredClone(v) : (JSON.parse(JSON.stringify(v)) as T);

function applyPage<T>(items: T[], req?: PageRequest): Page<T> {
  const page = Math.max(1, req?.page ?? 1);
  const pageSize = Math.max(1, req?.pageSize ?? 15);
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total: items.length,
    page,
    pageSize,
  };
}

/** Generic sort: "field" asc, "-field" desc. Flat keys only. */
function applySort<T>(items: T[], sort?: string): T[] {
  if (!sort) return items;
  const desc = sort.startsWith("-");
  const key = desc ? sort.slice(1) : sort;
  const get = (o: T) => (o as unknown as Record<string, unknown>)[key];
  return [...items].sort((a, b) => {
    const av = get(a);
    const bv = get(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
    return desc ? -cmp : cmp;
  });
}

const match = (haystack: unknown[], q?: string) =>
  !q ||
  haystack
    .map((h) => String(h ?? ""))
    .join(" ")
    .toLowerCase()
    .includes(q.toLowerCase());

export function createMockAdminDataSource(
  options: MockAdminDataSourceOptions = {},
): AdminDataSource {
  const role: AdminRole = options.role ?? "FINANCE_ADMIN";
  const latency = options.latencyMs ?? 350;
  const now = options.now ?? MOCK_NOW;

  // ── Mutable per-instance store (fixture copies) ──────────────────────────
  const actor: AdminActor = clone(fixtures.adminActors[role]);
  const store = {
    users: clone(fixtures.users),
    kycCases: clone(fixtures.kycCases),
    investments: clone(fixtures.investments),
    deposits: clone(fixtures.deposits),
    withdrawals: clone(fixtures.withdrawals),
    transactions: clone(fixtures.transactions),
    reconciliation: clone(fixtures.reconciliationItems),
    referrals: clone(fixtures.referrals),
    rewardGrants: clone(fixtures.rewardGrants),
    rewardReceivables: clone(fixtures.rewardReceivables),
    rewardTasks: clone(fixtures.rewardTasks),
    taskClaims: clone(fixtures.taskClaims),
    templates: clone(fixtures.notificationTemplates),
    deliveries: clone(fixtures.deliveries),
    policies: clone(fixtures.policySet),
    audit: clone(fixtures.auditEvents),
    legal: clone(fixtures.legalDocuments),
  };

  let auditCounter = 100;
  const nextAuditId = () => `aud_new_${++auditCounter}`;

  async function respond<T>(value: () => T): Promise<T> {
    if (latency > 0) await new Promise((r) => setTimeout(r, latency));
    return value();
  }

  const recordAudit = (
    action: string,
    resource: AuditEvent["resource"],
    summary: string,
  ): string => {
    const id = nextAuditId();
    store.audit.unshift({
      id,
      occurredAt: now,
      actor: {
        id: actor.id,
        displayName: actor.displayName,
        role: actor.roles[0] ?? "SUPER_ADMIN",
      },
      action,
      resource,
      result: "SUCCESS",
      requestId: `req_${id}`,
      ip: "197.210.55.14",
      summary,
    });
    return id;
  };

  const requireIdempotency = (input: AdminActionInput) => {
    if (!input.idempotencyKey || input.idempotencyKey.trim() === "") {
      throw new Error("idempotencyKey is required for admin actions.");
    }
  };

  // ── Catalogue projections (derived — never stored separately) ───────────

  const roundRow = (roundId: string): AdminRoundRow | null => {
    const r = rounds.find((x) => x.id === roundId);
    const plan = r && plans.find((p) => p.id === r.planId);
    const property = plan && properties.find((p) => p.id === plan.propertyId);
    if (!r || !plan || !property) return null;
    return {
      id: r.id,
      planId: plan.id,
      planName: plan.name,
      propertyId: property.id,
      propertyName: property.name,
      roundNumber: r.roundNumber,
      status: r.status,
      totalSlots: r.totalSlots,
      allocatedSlots: r.allocatedSlots,
      reservedSlots: r.reservedSlots,
      availableSlots: r.availableSlots,
      allocatedPct: r.allocatedPct,
      slotPrice: plan.slotPrice,
      raised: r.allocatedSlots * plan.slotPrice,
      currency: plan.currency,
      investors: fixtures.roundInvestors[r.id] ?? 0,
      opensAt: r.opensAt,
      closesAt: r.closesAt,
      projectedStartAt: r.projectedStartAt,
      projectedMaturityAt: r.projectedMaturityAt,
    };
  };

  const planRow = (planId: string): AdminPlanRow | null => {
    const p = plans.find((x) => x.id === planId);
    const property = p && properties.find((x) => x.id === p.propertyId);
    if (!p || !property) return null;
    return {
      id: p.id,
      propertyId: property.id,
      propertyName: property.name,
      name: p.name,
      currency: p.currency,
      slotPrice: p.slotPrice,
      roiBps: p.roiBps,
      duration: p.duration,
      minSlots: p.minSlots,
      maxSlotsPerUser: p.maxSlotsPerUser,
      investmentFeeBps: p.investmentFeeBps,
      eligibility: fixtures.planEligibility[p.id] ?? ["KYC Tier 1+"],
      status: p.status,
      rounds: rounds.filter((r) => r.planId === p.id).length,
      updatedAt: fixtures.propertyAdminMeta[property.id]?.updatedAt ?? now,
    };
  };

  const propertyRow = (propertyId: string): AdminPropertyRow | null => {
    const p = properties.find((x) => x.id === propertyId);
    if (!p) return null;
    const meta = fixtures.propertyAdminMeta[p.id] ?? {
      status: "PUBLISHED" as const,
      updatedAt: now,
    };
    const roundRows = rounds
      .filter((r) => plans.find((pl) => pl.id === r.planId)?.propertyId === p.id)
      .map((r) => roundRow(r.id)!);
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      type: p.type,
      location: p.location,
      status: meta.status,
      images: p.images,
      plans: plans.filter((pl) => pl.propertyId === p.id).length,
      openRounds: roundRows.filter((r) => r.status === "OPEN" || r.status === "NEARING_CAPACITY")
        .length,
      totalRaised: roundRows.reduce((s, r) => s + r.raised, 0),
      currency: "NGN",
      evidenceCount: p.proofDocuments.length,
      evidencePending: p.proofDocuments.filter((d) => d.status === "PENDING_REVIEW").length,
      updatedAt: meta.updatedAt,
    };
  };

  // ── Dashboard ────────────────────────────────────────────────────────────

  const dashboard = () => {
    const pendingKyc = store.kycCases.filter((c) => c.queue === "PENDING");
    const needsAction = store.kycCases.filter((c) => c.queue === "NEEDS_ACTION");
    const pendingWithdrawals = store.withdrawals.filter((w) =>
      ["REQUESTED", "UNDER_REVIEW"].includes(w.status),
    );
    const pendingDeposits = store.deposits.filter((d) =>
      ["AWAITING_TRANSFER", "CONFIRMING"].includes(d.status),
    );
    const pendingRewards = store.rewardGrants.filter(
      (g) => g.status === "PENDING" || g.status === "QUALIFIED",
    );
    const openRecon = store.reconciliation.filter(
      (r) => r.status === "UNMATCHED" || r.status === "INVESTIGATING",
    );
    const activeInv = store.investments.filter((i) => i.status === "ACTIVE");
    const openRounds = rounds.filter((r) => r.status === "OPEN" || r.status === "NEARING_CAPACITY");
    const today = now.slice(0, 10);
    const depositsToday = store.deposits.filter((d) => d.createdAt.slice(0, 10) === today);
    const oldest = (dates: string[]) => dates.sort()[0] ?? null;

    return {
      asOf: now,
      metrics: [
        {
          id: "users",
          label: "Total users",
          value: store.users.length,
          format: "count" as const,
          href: "/users",
          delta: { value: 3, direction: "up" as const, label: "+3 this week" },
        },
        {
          id: "active_investments",
          label: "Active investments",
          value: activeInv.length,
          format: "count" as const,
          href: "/investments",
        },
        {
          id: "principal",
          label: "Principal deployed",
          value: activeInv.reduce((s, i) => s + i.principal, 0),
          format: "money" as const,
          currency: "NGN" as const,
          href: "/investments",
        },
        {
          id: "open_rounds",
          label: "Open rounds",
          value: openRounds.length,
          format: "count" as const,
          href: "/rounds",
        },
        {
          id: "deposits_today",
          label: "Deposits today",
          value: depositsToday.reduce((s, d) => s + d.amount, 0),
          format: "money" as const,
          currency: "NGN" as const,
          href: "/finance/deposits",
        },
        {
          id: "withdrawals_pending",
          label: "Withdrawals pending",
          value: pendingWithdrawals.reduce((s, w) => s + w.amount, 0),
          format: "money" as const,
          currency: "NGN" as const,
          href: "/finance/withdrawals",
        },
        {
          id: "kyc_pending",
          label: "Pending KYC",
          value: pendingKyc.length + needsAction.length,
          format: "count" as const,
          href: "/kyc",
        },
        {
          id: "rewards_pending",
          label: "Rewards pending",
          value: pendingRewards.reduce((s, g) => s + g.amount, 0),
          format: "money" as const,
          currency: "NGN" as const,
          href: "/referrals",
        },
      ],
      queues: [
        {
          id: "kyc" as const,
          label: "KYC review",
          pending: pendingKyc.length,
          oldestAt: oldest(pendingKyc.map((c) => c.submittedAt)),
          href: "/kyc",
        },
        {
          id: "withdrawals" as const,
          label: "Withdrawal review",
          pending: pendingWithdrawals.length,
          oldestAt: oldest(pendingWithdrawals.map((w) => w.requestedAt)),
          href: "/finance/withdrawals",
        },
        {
          id: "deposits" as const,
          label: "Deposits in flight",
          pending: pendingDeposits.length,
          oldestAt: oldest(pendingDeposits.map((d) => d.createdAt)),
          href: "/finance/deposits",
        },
        {
          id: "rewards" as const,
          label: "Reward grants",
          pending: pendingRewards.length,
          oldestAt: oldest(pendingRewards.map((g) => g.createdAt)),
          href: "/referrals",
        },
        {
          id: "reconciliation" as const,
          label: "Reconciliation",
          pending: openRecon.length,
          oldestAt: oldest(openRecon.map((r) => r.detectedAt)),
          href: "/finance/reconciliation",
        },
      ],
      alerts: clone(fixtures.alerts),
      recentActivity: clone(store.audit.slice(0, 8)),
    };
  };

  // ── Data source ──────────────────────────────────────────────────────────

  return {
    getActor: () => respond(() => clone(actor)),
    listRoles: () => respond(() => clone(fixtures.roleDefinitions)),

    getDashboard: () => respond(dashboard),

    listUsers: (filter?: UserFilter) =>
      respond(() => {
        let items = store.users;
        if (filter?.accountStatus?.length)
          items = items.filter((u) => filter.accountStatus!.includes(u.accountStatus));
        if (filter?.kycStatus?.length)
          items = items.filter((u) => filter.kycStatus!.includes(u.kycStatus));
        items = items.filter((u) =>
          match([u.displayName, u.email, u.id, u.referralCode], filter?.query),
        );
        items = applySort(items, filter?.sort ?? "-lastActiveAt");
        return applyPage(items, filter);
      }),

    getUser: (id: string) =>
      respond(() => {
        const u = store.users.find((x) => x.id === id);
        if (!u) return null;
        const detail: AdminUserDetail = {
          ...clone(u),
          investments: clone(store.investments.filter((i) => i.userId === id)),
          deposits: clone(store.deposits.filter((d) => d.userId === id)),
          withdrawals: clone(store.withdrawals.filter((w) => w.userId === id)),
          referrals: clone(store.referrals.filter((r) => r.referrerId === id)),
          activity: clone(store.audit.filter((a) => a.resource.id === id).slice(0, 10)),
        };
        return detail;
      }),

    setUserStatus: (input) =>
      respond(() => {
        requireIdempotency(input);
        const u = store.users.find((x) => x.id === input.userId);
        if (!u)
          return { ok: false, auditId: "", message: "User not found." } satisfies AdminActionResult;
        const previous = u.accountStatus;
        u.accountStatus = input.status;
        const auditId = recordAudit(
          "user.status_changed",
          { type: "user", id: u.id, label: u.displayName },
          `Account status ${previous} → ${input.status}.${input.reason ? ` Reason: ${input.reason}` : ""}`,
        );
        return {
          ok: true,
          auditId,
          message: `${u.displayName} is now ${input.status.toLowerCase()}.`,
        };
      }),

    listKycCases: (filter?: KycFilter) =>
      respond(() => {
        let items = store.kycCases;
        if (filter?.queue) items = items.filter((c) => c.queue === filter.queue);
        items = items.filter((c) =>
          match([c.userDisplayName, c.id, c.documentType], filter?.query),
        );
        items = applySort(items, filter?.sort ?? "submittedAt");
        return applyPage(items, filter);
      }),

    getKycCase: (id: string) =>
      respond(() => clone(store.kycCases.find((c) => c.id === id) ?? null)),

    getKycDocumentUrl: () =>
      Promise.reject(new Error("Document preview isn't available in the demo dataset.")),

    reconcileWithdrawals: () => respond(() => []),
    reconcileKyc: () => respond(() => []),

    decideKyc: (input: KycDecisionInput) =>
      respond(() => {
        requireIdempotency(input);
        const c = store.kycCases.find((x) => x.id === input.caseId);
        if (!c)
          return { ok: false, auditId: "", message: "Case not found." } satisfies AdminActionResult;
        const u = store.users.find((x) => x.id === c.userId);
        c.reviewer = actor.displayName;
        c.decisionNote = input.reason;
        c.updatedAt = now;
        if (input.decision === "APPROVE") {
          c.status = "VERIFIED";
          c.queue = "VERIFIED";
          if (u) u.kycStatus = "VERIFIED";
          c.checks = c.checks.map((chk) =>
            chk.status === "PENDING" || chk.status === "MANUAL"
              ? { ...chk, status: "PASSED" as const }
              : chk,
          );
        } else if (input.decision === "REJECT") {
          c.status = "REJECTED";
          c.queue = "REJECTED";
          if (u) u.kycStatus = "REJECTED";
        } else {
          c.queue = "NEEDS_ACTION";
          if (u) u.kycStatus = "IN_PROGRESS";
        }
        const verb =
          input.decision === "APPROVE"
            ? "approved"
            : input.decision === "REJECT"
              ? "rejected"
              : "requested more info on";
        const auditId = recordAudit(
          `kyc.${input.decision.toLowerCase()}`,
          { type: "kyc_case", id: c.id, label: c.userDisplayName },
          `${actor.displayName} ${verb} ${c.userDisplayName}'s ${c.tier === "TIER_2" ? "Tier 2" : "Tier 1"} case. Reason: ${input.reason}`,
        );
        return { ok: true, auditId, message: `Case ${c.id} updated.` };
      }),

    listProperties: (filter?: PageRequest) =>
      respond(() => {
        let items = properties.map((p) => propertyRow(p.id)!);
        items = items.filter((p) => match([p.name, p.type, p.location.label], filter?.query));
        items = applySort(items, filter?.sort ?? "-totalRaised");
        return applyPage(items, filter);
      }),

    getProperty: (id: string) =>
      respond(() => {
        const base = propertyRow(id);
        const p = properties.find((x) => x.id === id);
        if (!base || !p) return null;
        const detail: AdminPropertyDetail = {
          ...base,
          summary: p.summary,
          description: p.description,
          operator: p.operator,
          revenueModel: p.revenueModel,
          proofDocuments: clone(p.proofDocuments),
          planRows: plans.filter((pl) => pl.propertyId === id).map((pl) => planRow(pl.id)!),
          roundRows: rounds
            .filter((r) => plans.find((pl) => pl.id === r.planId)?.propertyId === id)
            .map((r) => roundRow(r.id)!),
          history: clone(store.audit.filter((a) => a.resource.id === id).slice(0, 10)),
        };
        return detail;
      }),

    listPlans: (filter?: PageRequest) =>
      respond(() => {
        let items = plans.map((p) => planRow(p.id)!);
        items = items.filter((p) => match([p.name, p.propertyName], filter?.query));
        items = applySort(items, filter?.sort ?? "-slotPrice");
        return applyPage(items, filter);
      }),

    getPlan: (id: string) =>
      respond(() => {
        const base = planRow(id);
        const p = plans.find((x) => x.id === id);
        if (!base || !p) return null;
        const detail: AdminPlanDetail = {
          ...base,
          terms: p.terms,
          riskDisclosures: p.riskDisclosures,
          roundRows: rounds.filter((r) => r.planId === id).map((r) => roundRow(r.id)!),
          history: clone(store.audit.filter((a) => a.resource.id === id).slice(0, 10)),
        };
        return detail;
      }),

    listRounds: (filter?: RoundFilter) =>
      respond(() => {
        let items = rounds.map((r) => roundRow(r.id)!);
        if (filter?.status?.length) items = items.filter((r) => filter.status!.includes(r.status));
        if (filter?.propertyId) items = items.filter((r) => r.propertyId === filter.propertyId);
        items = items.filter((r) => match([r.propertyName, r.planName, r.id], filter?.query));
        items = applySort(items, filter?.sort ?? "-opensAt");
        return applyPage(items, filter);
      }),

    getRound: (id: string) => respond(() => clone(roundRow(id))),

    listInvestments: (filter?: InvestmentAdminFilter) =>
      respond(() => {
        let items = store.investments;
        if (filter?.status?.length) items = items.filter((i) => filter.status!.includes(i.status));
        if (filter?.propertyId) items = items.filter((i) => i.propertyId === filter.propertyId);
        if (filter?.userId) items = items.filter((i) => i.userId === filter.userId);
        items = items.filter((i) =>
          match([i.reference, i.userDisplayName, i.propertyName], filter?.query),
        );
        items = applySort(items, filter?.sort ?? "-createdAt");
        return applyPage(items, filter);
      }),

    getInvestment: (id: string) =>
      respond(() => clone(store.investments.find((i) => i.id === id) ?? null)),

    markInvestmentReview: (input) =>
      respond(() => {
        requireIdempotency(input);
        const i = store.investments.find((x) => x.id === input.investmentId);
        if (!i)
          return {
            ok: false,
            auditId: "",
            message: "Investment not found.",
          } satisfies AdminActionResult;
        i.status = "REVIEW_REQUIRED";
        const auditId = recordAudit(
          "investment.review",
          { type: "investment", id: i.id, label: i.reference },
          `${actor.displayName} marked ${i.reference} for review. Reason: ${input.reason}`,
        );
        return { ok: true, auditId, message: `${i.reference} is now under review.` };
      }),

    resolveInvestmentReview: (input) =>
      respond(() => {
        requireIdempotency(input);
        const i = store.investments.find((x) => x.id === input.investmentId);
        if (!i)
          return {
            ok: false,
            auditId: "",
            message: "Investment not found.",
          } satisfies AdminActionResult;
        i.status = input.to;
        const auditId = recordAudit(
          "investment.review_resolve",
          { type: "investment", id: i.id, label: i.reference },
          `${actor.displayName} resolved ${i.reference} → ${input.to}. Reason: ${input.reason}`,
        );
        return { ok: true, auditId, message: `${i.reference} moved to ${input.to.toLowerCase()}.` };
      }),

    retrySettlement: (input) =>
      respond(() => {
        requireIdempotency(input);
        const i = store.investments.find((x) => x.id === input.investmentId);
        if (!i)
          return {
            ok: false,
            auditId: "",
            message: "Investment not found.",
          } satisfies AdminActionResult;
        if (!["MATURITY_DUE", "SETTLING"].includes(i.status))
          return { ok: false, auditId: "", message: "Investment is not settleable." };
        i.status = "COMPLETED";
        i.settledAt = new Date().toISOString();
        const auditId = recordAudit(
          "investment.settlement_retry",
          { type: "investment", id: i.id, label: i.reference },
          `${actor.displayName} retried settlement for ${i.reference}. Reason: ${input.reason}`,
        );
        return { ok: true, auditId, message: `${i.reference} settlement completed.` };
      }),

    reconcileInvestments: () => respond(() => []),

    getLedgerOverview: () =>
      respond(() => {
        const accountKeys = ["AVAILABLE", "RESERVED", "BONUS", "PENDING"] as const;
        const labels: Record<(typeof accountKeys)[number], string> = {
          AVAILABLE: "Available",
          RESERVED: "Reserved",
          BONUS: "Bonus",
          PENDING: "Pending",
        };
        const accounts = accountKeys.map((account) => ({
          account,
          label: labels[account],
          total: store.users.reduce((s, u) => s + u.wallet[account], 0),
          currency: "NGN" as const,
          holders: store.users.filter((u) => u.wallet[account] > 0).length,
        }));
        const overview: LedgerOverview = {
          ...clone(fixtures.ledgerOverview),
          accounts,
          postedToday: store.transactions.filter(
            (t) => t.occurredAt.slice(0, 10) === now.slice(0, 10),
          ).length,
          reversalsToday: store.transactions.filter(
            (t) => t.type === "REVERSAL" && t.occurredAt.slice(0, 10) === now.slice(0, 10),
          ).length,
        };
        return overview;
      }),

    listDeposits: (filter?: FinanceFilter) =>
      respond(() => {
        let items = store.deposits;
        if (filter?.status?.length) items = items.filter((d) => filter.status!.includes(d.status));
        if (filter?.from) items = items.filter((d) => d.createdAt >= filter.from!);
        if (filter?.to) items = items.filter((d) => d.createdAt <= filter.to!);
        items = items.filter((d) =>
          match([d.reference, d.userDisplayName, d.channelLabel], filter?.query),
        );
        items = applySort(items, filter?.sort ?? "-createdAt");
        return applyPage(items, filter);
      }),

    listWithdrawals: (filter?: FinanceFilter) =>
      respond(() => {
        let items = store.withdrawals;
        if (filter?.status?.length) items = items.filter((w) => filter.status!.includes(w.status));
        if (filter?.from) items = items.filter((w) => w.requestedAt >= filter.from!);
        if (filter?.to) items = items.filter((w) => w.requestedAt <= filter.to!);
        items = items.filter((w) =>
          match([w.reference, w.userDisplayName, w.destinationLabel], filter?.query),
        );
        items = applySort(items, filter?.sort ?? "requestedAt");
        return applyPage(items, filter);
      }),

    getWithdrawal: (id: string) =>
      respond(() => clone(store.withdrawals.find((w) => w.id === id) ?? null)),

    decideWithdrawal: (input: WithdrawalDecisionInput) =>
      respond(() => {
        requireIdempotency(input);
        const w = store.withdrawals.find((x) => x.id === input.withdrawalId);
        if (!w)
          return {
            ok: false,
            auditId: "",
            message: "Withdrawal not found.",
          } satisfies AdminActionResult;
        w.reviewedBy = actor.displayName;
        w.reviewedAt = now;
        if (input.decision === "APPROVE") w.status = "APPROVED";
        else if (input.decision === "MARK_PAID") {
          w.status = "COMPLETED";
          w.paidAt = now;
        } else w.status = "REJECTED";
        const label =
          input.decision === "APPROVE"
            ? "approved"
            : input.decision === "MARK_PAID"
              ? "marked paid"
              : "rejected";
        const auditId = recordAudit(
          `withdrawal.${input.decision.toLowerCase()}`,
          { type: "withdrawal", id: w.id, label: w.reference },
          `${actor.displayName} ${label} ${w.reference} for ${w.userDisplayName}. Reason: ${input.reason}`,
        );
        return { ok: true, auditId, message: `${w.reference} ${label}.` };
      }),

    listTransactions: (filter?: FinanceFilter) =>
      respond(() => {
        let items = store.transactions;
        if (filter?.status?.length) items = items.filter((t) => filter.status!.includes(t.status));
        if (filter?.from) items = items.filter((t) => t.occurredAt >= filter.from!);
        if (filter?.to) items = items.filter((t) => t.occurredAt <= filter.to!);
        items = items.filter((t) => match([t.reference, t.userDisplayName, t.type], filter?.query));
        items = applySort(items, filter?.sort ?? "-occurredAt");
        return applyPage(items, filter);
      }),

    listReconciliation: (filter?: FinanceFilter) =>
      respond(() => {
        let items = store.reconciliation;
        if (filter?.status?.length) items = items.filter((r) => filter.status!.includes(r.status));
        items = items.filter((r) =>
          match([r.externalReference, r.ledgerReference ?? "", r.note], filter?.query),
        );
        items = applySort(items, filter?.sort ?? "-detectedAt");
        return applyPage(items, filter);
      }),

    getReferralOverview: () =>
      respond(() => {
        const grants = store.rewardGrants;
        const sum = (statuses: RewardGrantRow["status"][]) =>
          grants.filter((g) => statuses.includes(g.status)).reduce((s, g) => s + g.amount, 0);
        const overview: ReferralOverview = {
          asOf: now,
          policy: clone(fixtures.referralPolicy),
          totals: {
            attributed: store.referrals.length,
            qualified: store.referrals.filter(
              (r) => r.status === "QUALIFIED" || r.status === "CREDITED",
            ).length,
            pendingRewards: sum(["PENDING", "QUALIFIED"]),
            creditedRewards: sum(["CREDITED"]),
            reversedRewards: sum(["REVERSED", "BLOCKED"]),
            currency: "NGN",
          },
        };
        return overview;
      }),

    listReferrals: (filter?: PageRequest) =>
      respond(() => {
        let items = store.referrals;
        items = items.filter((r) =>
          match([r.referrerName, r.referredName, r.codeSnapshot], filter?.query),
        );
        items = applySort(items, filter?.sort ?? "-attributedAt");
        return applyPage(items, filter);
      }),

    listRewardGrants: (filter) =>
      respond(() => {
        let items = store.rewardGrants;
        if (filter?.status?.length) items = items.filter((g) => filter.status!.includes(g.status));
        items = items.filter((g) => match([g.referrerName, g.referredName, g.kind], filter?.query));
        items = applySort(items, filter?.sort ?? "-createdAt");
        return applyPage(items, filter);
      }),

    listRewardReceivables: (filter) =>
      respond(() => {
        let items = store.rewardReceivables;
        if (filter?.status?.length) items = items.filter((r) => filter.status!.includes(r.status));
        items = items.filter((r) => match([r.userDisplayName, r.sourceGrantId], filter?.query));
        items = applySort(items, filter?.sort ?? "-createdAt");
        return applyPage(items, filter);
      }),

    reevaluateReferral: (input) =>
      respond(() => {
        requireIdempotency(input);
        const r = store.referrals.find((x) => x.id === input.referralId);
        if (!r) return { ok: false, auditId: "", message: "Referral not found." };
        if (r.status === "PENDING") {
          r.status = "QUALIFIED";
          r.qualifiedAt = now;
        }
        const auditId = recordAudit(
          "referral.reevaluate",
          { type: "referral", id: r.id, label: `${r.referrerName} → ${r.referredName}` },
          `${actor.displayName} re-ran referral qualification for ${r.id}. Reason: ${input.reason}`,
        );
        return { ok: true, auditId, message: `Referral ${r.id} re-evaluated — now ${r.status}.` };
      }),

    reverseRewardGrant: (input) =>
      respond(() => {
        requireIdempotency(input);
        const g = store.rewardGrants.find((x) => x.id === input.grantId);
        if (!g) return { ok: false, auditId: "", message: "Reward grant not found." };
        if (g.status !== "CREDITED" && g.status !== "QUALIFIED" && g.status !== "PENDING") {
          return {
            ok: false,
            auditId: "",
            message: `Grant ${g.id} cannot be reversed from status ${g.status}.`,
          };
        }
        const alreadyCredited = g.status === "CREDITED";
        g.status = "REVERSED";
        g.note = `${g.note} Reversed by ${actor.displayName}.`;
        if (alreadyCredited) {
          store.rewardReceivables.unshift({
            id: `rr_${g.id}`,
            userId: g.referralId,
            userDisplayName: g.referrerName,
            currency: g.currency,
            amount: g.amount,
            outstanding: g.amount,
            sourceGrantId: g.id,
            status: "OPEN",
            createdAt: now,
            settledAt: null,
          });
        }
        const auditId = recordAudit(
          "reward.reverse",
          { type: "reward_grant", id: g.id, label: `${g.kind} ${g.id}` },
          `${actor.displayName} reversed reward grant ${g.id} (${g.referrerName}). Reason: ${input.reason}`,
        );
        return {
          ok: true,
          auditId,
          message: `Grant ${g.id} reversed${alreadyCredited ? " — receivable opened" : ""}.`,
        };
      }),

    releaseBlockedReward: (input) =>
      respond(() => {
        requireIdempotency(input);
        const g = store.rewardGrants.find((x) => x.id === input.grantId);
        if (!g) return { ok: false, auditId: "", message: "Reward grant not found." };
        if (g.status !== "BLOCKED")
          return { ok: false, auditId: "", message: `Grant ${g.id} is not blocked (${g.status}).` };
        g.status = "CREDITED";
        g.creditedAt = now;
        g.note = `${g.note} Released by ${actor.displayName}.`;
        const auditId = recordAudit(
          "reward.release_blocked",
          { type: "reward_grant", id: g.id, label: `${g.kind} ${g.id}` },
          `${actor.displayName} released blocked reward grant ${g.id}. Reason: ${input.reason}`,
        );
        return { ok: true, auditId, message: `Grant ${g.id} released and credited.` };
      }),

    reconcileRewards: () => respond(() => []),

    listRewardTasks: (filter) =>
      respond(() => {
        let items = store.rewardTasks;
        if (filter?.status?.length) items = items.filter((t) => filter.status!.includes(t.status));
        items = items.filter((t) => match([t.title, t.slug], filter?.query));
        items = applySort(items, filter?.sort ?? "-createdAt");
        return applyPage(items, filter);
      }),

    upsertRewardTask: (input) =>
      respond(() => {
        requireIdempotency(input);
        const f = input.fields;
        const read = <T>(k: string, d: T): T => (f[k] === undefined ? d : (f[k] as T));
        let task = input.taskId ? store.rewardTasks.find((t) => t.id === input.taskId) : undefined;
        if (input.taskId && !task)
          return { ok: false, auditId: "", message: `Task ${input.taskId} not found.` };
        if (
          task &&
          task.status === "PUBLISHED" &&
          f["rewardAmount"] !== undefined &&
          f["rewardAmount"] !== task.rewardAmount
        ) {
          return {
            ok: false,
            auditId: "",
            message: "Reward amount is frozen once a task is published.",
          };
        }
        if (!task) {
          task = {
            id: `task_${String(store.rewardTasks.length + 1).padStart(2, "0")}`,
            slug: read("slug", `task-${store.rewardTasks.length + 1}`),
            title: read("title", "Untitled task"),
            description: read("description", ""),
            status: "DRAFT",
            rewardAmount: read("rewardAmount", 0),
            rewardCurrency: read("rewardCurrency", "NGN"),
            claimPolicy: read("claimPolicy", "ONE_TIME"),
            maxClaims: read("maxClaims", 0),
            eligibility: read("eligibility", {}),
            startsAt: read("startsAt", null),
            endsAt: read("endsAt", null),
            version: 1,
            publishedAt: null,
            createdAt: now,
            requirements: [],
            claims: { total: 0, pending: 0, rewarded: 0, rejected: 0 },
          };
          store.rewardTasks.push(task);
        } else {
          task.title = read("title", task.title);
          task.description = read("description", task.description);
          task.rewardAmount = read("rewardAmount", task.rewardAmount);
          task.claimPolicy = read("claimPolicy", task.claimPolicy);
          task.maxClaims = read("maxClaims", task.maxClaims);
          task.eligibility = read("eligibility", task.eligibility);
          task.startsAt = read("startsAt", task.startsAt);
          task.endsAt = read("endsAt", task.endsAt);
          task.version += 1;
        }
        const auditId = recordAudit(
          input.taskId ? "task.update" : "task.create",
          { type: "reward_task", id: task.id, label: task.title },
          `${actor.displayName} ${input.taskId ? "updated" : "created"} reward task ${task.slug}. Reason: ${input.reason}`,
        );
        return {
          ok: true,
          auditId,
          message: `Task ${task.slug} saved as ${task.status}.`,
          taskId: task.id,
        };
      }),

    setTaskStatus: (input) =>
      respond(() => {
        requireIdempotency(input);
        const task = store.rewardTasks.find((t) => t.id === input.taskId);
        if (!task) return { ok: false, auditId: "", message: `Task ${input.taskId} not found.` };
        const allowed: Record<string, string[]> = {
          DRAFT: ["PUBLISHED", "ARCHIVED"],
          PUBLISHED: ["PAUSED", "ARCHIVED"],
          PAUSED: ["PUBLISHED", "ARCHIVED"],
          ARCHIVED: [],
        };
        if (!allowed[task.status]!.includes(input.to)) {
          return {
            ok: false,
            auditId: "",
            message: `Cannot move ${task.slug} from ${task.status} to ${input.to}.`,
          };
        }
        task.status = input.to;
        if (input.to === "PUBLISHED" && !task.publishedAt) task.publishedAt = now;
        task.version += 1;
        const auditId = recordAudit(
          `task.${input.to.toLowerCase()}`,
          { type: "reward_task", id: task.id, label: task.title },
          `${actor.displayName} moved task ${task.slug} to ${input.to}. Reason: ${input.reason}`,
        );
        return { ok: true, auditId, message: `Task ${task.slug} is now ${input.to}.` };
      }),

    upsertTaskRequirement: (input) =>
      respond(() => {
        requireIdempotency(input);
        const task = store.rewardTasks.find((t) => t.id === input.taskId);
        if (!task) return { ok: false, auditId: "", message: `Task ${input.taskId} not found.` };
        const f = input.fields;
        let req = input.requirementId
          ? task.requirements.find((r) => r.id === input.requirementId)
          : undefined;
        if (input.requirementId && !req)
          return {
            ok: false,
            auditId: "",
            message: `Requirement ${input.requirementId} not found on ${task.slug}.`,
          };
        if (!req) {
          req = {
            id: `req_${Math.random().toString(36).slice(2, 8)}`,
            kind: (f["kind"] as AdminTaskRequirement["kind"]) ?? "MANUAL_EVIDENCE",
            config: (f["config"] as Record<string, unknown>) ?? {},
            required: f["required"] !== false,
            position: task.requirements.length,
          };
          task.requirements.push(req);
        } else {
          if (f["kind"] !== undefined) req.kind = f["kind"] as typeof req.kind;
          if (f["config"] !== undefined) req.config = f["config"] as Record<string, unknown>;
          if (f["required"] !== undefined) req.required = f["required"] as boolean;
          if (f["position"] !== undefined) req.position = f["position"] as number;
        }
        task.version += 1;
        const auditId = recordAudit(
          input.requirementId ? "task_requirement.update" : "task_requirement.create",
          { type: "reward_task", id: task.id, label: task.title },
          `${actor.displayName} ${input.requirementId ? "updated" : "added"} requirement ${req.kind} on ${task.slug}. Reason: ${input.reason}`,
        );
        return { ok: true, auditId, message: `Requirement ${req.id} saved on ${task.slug}.` };
      }),

    listTaskClaims: (filter) =>
      respond(() => {
        let items = store.taskClaims;
        if (filter?.taskId) items = items.filter((c) => c.taskId === filter.taskId);
        if (filter?.status?.length) items = items.filter((c) => filter.status!.includes(c.status));
        items = items.filter((c) => match([c.userDisplayName, c.taskTitle, c.id], filter?.query));
        items = applySort(items, filter?.sort ?? "-createdAt");
        return applyPage(items, filter);
      }),

    reviewTaskClaim: (input) =>
      respond(() => {
        requireIdempotency(input);
        const claim = store.taskClaims.find((c) => c.id === input.claimId);
        if (!claim)
          return { ok: false, auditId: "", message: `Task claim ${input.claimId} not found.` };
        const leg = claim.legs.find((l) => l.id === input.legId);
        if (!leg)
          return {
            ok: false,
            auditId: "",
            message: `Leg ${input.legId} not found on claim ${claim.id}.`,
          };
        if (
          leg.status !== "MANUAL_REVIEW" &&
          leg.status !== "PENDING" &&
          leg.status !== "VERIFYING"
        ) {
          return { ok: false, auditId: "", message: `Leg ${leg.id} is already ${leg.status}.` };
        }
        leg.status = input.decision === "APPROVE" ? "VERIFIED" : "FAILED";
        leg.verifiedAt = now;
        leg.verifiedBy = actor.id;
        claim.reviewedBy = actor.id;
        if (claim.legs.every((l) => l.status === "VERIFIED")) {
          claim.status = "REWARDED";
          claim.resolvedAt = now;
          const task = store.rewardTasks.find((t) => t.id === claim.taskId);
          if (task) {
            task.claims.rewarded += 1;
            task.claims.pending = Math.max(0, task.claims.pending - 1);
          }
          store.rewardGrants.unshift({
            id: `gr_task_${claim.id}`,
            referralId: claim.userId,
            referrerName: claim.userDisplayName,
            referredName: "—",
            kind: "TASK",
            amount: task?.rewardAmount ?? 0,
            currency: task?.rewardCurrency ?? "NGN",
            status: "CREDITED",
            createdAt: now,
            creditedAt: now,
            note: `Task reward — ${claim.taskTitle} (claim ${claim.id}).`,
          });
        } else if (claim.legs.some((l) => l.status === "FAILED")) {
          claim.status = "REJECTED";
          claim.resolvedAt = now;
          const task = store.rewardTasks.find((t) => t.id === claim.taskId);
          if (task) {
            task.claims.rejected += 1;
            task.claims.pending = Math.max(0, task.claims.pending - 1);
          }
        } else {
          claim.status = "MANUAL_REVIEW";
        }
        const auditId = recordAudit(
          `task_claim.${input.decision.toLowerCase()}`,
          {
            type: "task_claim",
            id: claim.id,
            label: `${claim.taskTitle} — ${claim.userDisplayName}`,
          },
          `${actor.displayName} ${input.decision === "APPROVE" ? "approved" : "rejected"} leg ${leg.kind} on claim ${claim.id}. Reason: ${input.reason}`,
        );
        return {
          ok: true,
          auditId,
          message: `Leg ${leg.id} ${leg.status === "VERIFIED" ? "verified" : "rejected"} — claim now ${claim.status}.`,
        };
      }),

    getNotificationOverview: () =>
      respond(() => ({
        asOf: now,
        byChannel: (["IN_APP", "PUSH", "EMAIL"] as const).map((channel) => {
          const rows = store.deliveries.filter((d) => d.channel === channel);
          return {
            channel,
            sent: rows.length + (channel === "EMAIL" ? 210 : channel === "PUSH" ? 148 : 41),
            delivered:
              rows.filter((d) => d.status === "DELIVERED").length +
              (channel === "EMAIL" ? 198 : channel === "PUSH" ? 140 : 40),
            failed:
              rows.filter((d) => d.status === "FAILED").length +
              (channel === "EMAIL" ? 5 : channel === "PUSH" ? 3 : 0),
          };
        }),
        templates: clone(store.templates),
        recentDeliveries: clone(store.deliveries),
      })),

    getPolicies: () => respond(() => clone(store.policies)),

    listAuditEvents: (filter?: AuditFilter) =>
      respond(() => {
        let items = store.audit;
        if (filter?.actorId) items = items.filter((a) => a.actor.id === filter.actorId);
        if (filter?.resourceType)
          items = items.filter((a) => a.resource.type === filter.resourceType);
        if (filter?.result?.length) items = items.filter((a) => filter.result!.includes(a.result));
        if (filter?.from) items = items.filter((a) => a.occurredAt >= filter.from!);
        if (filter?.to) items = items.filter((a) => a.occurredAt <= filter.to!);
        items = items.filter((a) =>
          match([a.actor.displayName, a.action, a.resource.label, a.summary], filter?.query),
        );
        items = applySort(items, filter?.sort ?? "-occurredAt");
        return applyPage(items, filter);
      }),

    listLegalDocuments: () => respond(() => clone(store.legal)),

    getReports: (period) => respond((): ReportBundle => fixtures.reportBundle(period ?? "30d")),
  };
}

export { MOCK_NOW };
