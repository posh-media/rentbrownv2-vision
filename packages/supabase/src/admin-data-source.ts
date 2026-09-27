/**
 * AdminDataSource over real Supabase RPCs (Phase 6B).
 *
 * The investments surface — list, detail, review actions, reconciliation —
 * executes against the Phase 6B admin RPCs. Every other domain still delegates
 * to the mock source; those adapters land with their own phases. The server
 * enforces has_admin_role on every RPC — the client only maps results.
 */
import type {
  AdminDataSource,
  AdminInvestmentEvent,
  AdminInvestmentRow,
  AdminKycCase,
  AdminKycEvent,
  AdminWithdrawalRow,
  FinanceFilter,
  InvestmentAdminFilter,
  InvestmentReconciliationItem,
  InvestmentStatus,
  KycCheck,
  KycFilter,
  KycReviewQueue,
  KycStatus,
  Page,
  PaymentStatus,
  WithdrawalStatus,
} from "@rentbrown/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const ADMIN_PAYMENT_STATUS: Record<string, PaymentStatus> = {
  ACTIVE: "SUCCESSFUL",
  MATURITY_DUE: "SUCCESSFUL",
  SETTLING: "SUCCESSFUL",
  COMPLETED: "SUCCESSFUL",
  PAYMENT_PENDING: "PENDING",
  REVIEW_REQUIRED: "CONFIRMING",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
};

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
  REVIEW_REQUIRED: "Marked for review",
  NOTE_ADDED: "Note added",
};

interface RawAdminInvestmentRow {
  id: string; reference: string; user_id: string; user_display_name: string | null;
  round_id: string; plan_id: string; property_id: string;
  property_name: string; property_slug: string; plan_name: string;
  round_number: number; round_status: string; seed_tag: string | null;
  funding_source: "WALLET" | "BANK_TRANSFER" | "CARD";
  status: InvestmentStatus; currency: "NGN" | "USD";
  slots: number; principal_minor: number; roi_bps: number;
  expected_profit_minor: number; maturity_value_minor: number;
  activated_at: string | null; matures_at: string | null;
  payment_reference: string | null; created_at: string;
}

function mapRow(r: RawAdminInvestmentRow): AdminInvestmentRow {
  return {
    id: r.id,
    reference: r.reference,
    userId: r.user_id,
    userDisplayName: r.user_display_name ?? "Unknown investor",
    propertyId: r.property_id,
    propertyName: r.property_name,
    planName: r.plan_name,
    roundId: r.round_id,
    roundNumber: r.round_number,
    slots: r.slots,
    principal: r.principal_minor,
    expectedProfit: r.expected_profit_minor,
    maturityValue: r.maturity_value_minor,
    currency: r.currency,
    roiBps: r.roi_bps,
    status: r.status,
    paymentStatus: ADMIN_PAYMENT_STATUS[r.status] ?? "PENDING",
    fundingSource: r.funding_source,
    createdAt: r.created_at,
    activatedAt: r.activated_at,
    maturesAt: r.matures_at,
    settledAt: r.status === "COMPLETED" ? r.matures_at : null,
    paymentReference: r.payment_reference,
    seedTag: r.seed_tag,
  };
}

function mapEvent(e: {
  id: string; event_type: string; actor_kind: string;
  created_at: string; metadata: { note?: string } | null;
}): AdminInvestmentEvent {
  return {
    id: e.id,
    type: e.event_type,
    label: e.metadata?.note ? `${EVENT_LABEL[e.event_type] ?? e.event_type} — ${e.metadata.note}` : EVENT_LABEL[e.event_type] ?? e.event_type,
    at: e.created_at,
    actor: (e.actor_kind as AdminInvestmentEvent["actor"]) ?? "SYSTEM",
    note: e.metadata?.note,
  };
}

const match = (haystack: unknown[], q?: string) =>
  !q || haystack.map((h) => String(h ?? "")).join(" ").toLowerCase().includes(q.toLowerCase());

// ── Phase 8B: KYC review + withdrawal ops mappers ───────────────────────────

/** "Waiting" label for queue rows — display formatting only. */
function ageLabel(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

interface RawKycCaseRow {
  id: string;
  user_id: string;
  user_display_name: string | null;
  status: KycStatus;
  db_status: string;
  queue: KycReviewQueue;
  attempt_no: number;
  document_type: string;
  document_number_masked: string | null;
  submitted_at: string | null;
  updated_at: string;
  reviewer: string | null;
  decision_note: string | null;
}

function reviewCheck(status: string): KycCheck {
  const s: KycCheck["status"] = status === "VERIFIED" ? "PASSED" : status === "REJECTED" ? "FAILED" : "MANUAL";
  return {
    id: "manual-review",
    label: "Manual document review",
    status: s,
    detail:
      status === "VERIFIED"
        ? "Documents approved by a reviewer."
        : status === "REJECTED"
          ? "Rejected — see the decision note."
          : "Awaiting a reviewer decision.",
  };
}

function mapKycCaseRow(r: RawKycCaseRow): AdminKycCase {
  return {
    id: r.id,
    userId: r.user_id,
    userDisplayName: r.user_display_name ?? "Investor",
    status: r.status,
    queue: r.queue,
    submittedAt: r.submitted_at ?? r.updated_at,
    updatedAt: r.updated_at,
    tier: "TIER_1",
    documentType: "BVN",
    documentNumberMasked: r.document_number_masked ?? "—",
    checks: [reviewCheck(r.db_status)],
    reviewer: r.reviewer,
    decisionNote: r.decision_note,
    ageLabel: ageLabel(r.submitted_at ?? r.updated_at),
    attemptNo: r.attempt_no,
  };
}

interface RawKycCaseDetail {
  id: string;
  user_id: string;
  user_display_name: string | null;
  status: string;
  attempt_no: number;
  full_legal_name: string | null;
  gender: string | null;
  bvn: string | null;
  poa_type: string | null;
  selfie_path: string | null;
  poa_path: string | null;
  provider: string;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  rejection_reason: string | null;
  events: Array<{ from: string | null; to: string; source: string; note: string | null; at: string }> | null;
}

const KYC_DETAIL_STATUS: Record<string, KycStatus> = {
  DRAFT: "IN_PROGRESS",
  SUBMITTED: "PENDING_REVIEW",
  UNDER_REVIEW: "PENDING_REVIEW",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
};

const KYC_DETAIL_QUEUE: Record<string, KycReviewQueue> = {
  SUBMITTED: "PENDING",
  UNDER_REVIEW: "PENDING",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
};

function mapKycCaseDetail(d: RawKycCaseDetail, reviewerName: string | null): AdminKycCase {
  const status = KYC_DETAIL_STATUS[d.status] ?? "IN_PROGRESS";
  const presence = (label: string, present: boolean, detail: string): KycCheck => ({
    id: label.toLowerCase().replace(/\s+/g, "-"),
    label,
    status: present ? "MANUAL" : "PENDING",
    detail,
  });
  return {
    id: d.id,
    userId: d.user_id,
    userDisplayName: d.user_display_name ?? "Investor",
    status,
    queue: KYC_DETAIL_QUEUE[d.status] ?? "NEEDS_ACTION",
    submittedAt: d.submitted_at ?? d.reviewed_at ?? new Date().toISOString(),
    updatedAt: d.reviewed_at ?? d.submitted_at ?? new Date().toISOString(),
    tier: "TIER_1",
    documentType: "BVN",
    documentNumberMasked: d.bvn ? (d.bvn.startsWith("***") ? d.bvn : `***${d.bvn.slice(-4)}`) : "—",
    checks: [
      presence("Legal name provided", !!d.full_legal_name, d.full_legal_name ?? "Not provided yet"),
      presence("BVN provided", !!d.bvn, d.bvn ?? "Not provided yet"),
      presence("Selfie uploaded", !!d.selfie_path, d.selfie_path ? "Stored privately — open via the document viewer" : "Not uploaded yet"),
      presence("Proof of address uploaded", !!d.poa_path, d.poa_type ? d.poa_type.replace(/_/g, " ").toLowerCase() : "Not uploaded yet"),
      reviewCheck(d.status),
    ],
    reviewer: reviewerName,
    decisionNote: d.rejection_reason ?? d.review_note,
    ageLabel: ageLabel(d.submitted_at ?? d.reviewed_at ?? new Date().toISOString()),
    attemptNo: d.attempt_no,
    legalName: d.full_legal_name,
    gender: d.gender,
    bvn: d.bvn,
    poaType: d.poa_type,
    hasSelfie: !!d.selfie_path,
    hasPoa: !!d.poa_path,
    events: (d.events ?? []) as AdminKycEvent[],
  };
}

interface RawAdminWithdrawalRow {
  id: string;
  reference: string;
  user_id: string;
  user_display_name: string | null;
  kyc_status: KycStatus;
  currency: "NGN" | "USD";
  amount_minor: number;
  fee_minor: number;
  net_minor: number;
  status: WithdrawalStatus;
  destination_label?: string | null;
  requested_at: string;
  reviewed_at: string | null;
  reviewer?: string | null;
  paid_at: string | null;
  rejected_at: string | null;
}

function mapWithdrawalRow(r: RawAdminWithdrawalRow): AdminWithdrawalRow {
  return {
    id: r.id,
    reference: r.reference,
    userId: r.user_id,
    userDisplayName: r.user_display_name ?? "Investor",
    amount: r.amount_minor,
    fee: r.fee_minor,
    netAmount: r.net_minor,
    currency: r.currency,
    destinationLabel: r.destination_label ?? "Bank account",
    status: r.status,
    kycStatus: r.kyc_status ?? "NOT_STARTED",
    riskFlags: [],
    requestedAt: r.requested_at,
    reviewedBy: r.reviewer ?? null,
    reviewedAt: r.reviewed_at,
    paidAt: r.paid_at,
  };
}

interface RawAdminWithdrawalDetail extends RawAdminWithdrawalRow {
  destination: {
    bank_name?: string;
    bank_code?: string;
    account_number?: string;
    account_name?: string;
    bank_account_id?: string;
  } | null;
  events: Array<{ from: string | null; to: string; source: string; note: string | null; at: string }> | null;
  outbound: Array<{
    event_type: string;
    status: string;
    attempts: number;
    delivered_at: string | null;
    last_response_code: number | null;
  }> | null;
}

function applySortOn<T>(items: T[], sort: string | undefined, fallback: keyof T): T[] {
  const key = (sort ?? fallback) as keyof T & string;
  const desc = key.startsWith("-");
  const k = (desc ? key.slice(1) : key) as keyof T;
  return [...items].sort((a, b) => {
    const av = a[k];
    const bv = b[k];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return desc ? -cmp : cmp;
  });
}

function pageOf<T>(items: T[], filter?: { page?: number; pageSize?: number }): Page<T> {
  const page = Math.max(1, filter?.page ?? 1);
  const pageSize = Math.max(1, filter?.pageSize ?? 15);
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize };
}

function applySort(items: AdminInvestmentRow[], sort?: string): AdminInvestmentRow[] {
  if (!sort) return items;
  const desc = sort.startsWith("-");
  const key = (desc ? sort.slice(1) : sort) as keyof AdminInvestmentRow;
  return [...items].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return desc ? -cmp : cmp;
  });
}

/**
 * Wraps the mock AdminDataSource: investment-domain calls hit the Phase 6B
 * RPCs when a session exists, everything else delegates untouched.
 */
export function createSupabaseAdminDataSource(
  client: SupabaseClient,
  domain: AdminDataSource,
): AdminDataSource {
  const hasSession = async () => {
    const {
      data: { session },
    } = await client.auth.getSession();
    return !!session;
  };

  return {
    ...domain,

    async listInvestments(filter?: InvestmentAdminFilter): Promise<Page<AdminInvestmentRow>> {
      if (!(await hasSession())) return domain.listInvestments(filter);
      const { data, error } = await client.rpc("admin_list_investments", {
        p_status: filter?.status?.length === 1 ? filter.status[0] : null,
        p_property_id: filter?.propertyId ?? null,
        p_user_id: filter?.userId ?? null,
        p_limit: 500,
        p_offset: 0,
      });
      if (error) throw new Error(error.message);
      let items = ((data ?? []) as RawAdminInvestmentRow[]).map(mapRow);
      if (filter?.status && filter.status.length > 1) items = items.filter((i) => filter.status!.includes(i.status));
      items = items.filter((i) => match([i.reference, i.userDisplayName, i.propertyName], filter?.query));
      items = applySort(items, filter?.sort ?? "-createdAt");
      const page = Math.max(1, filter?.page ?? 1);
      const pageSize = Math.max(1, filter?.pageSize ?? 15);
      return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize };
    },

    async getInvestment(id: string): Promise<AdminInvestmentRow | null> {
      if (!(await hasSession())) return domain.getInvestment(id);
      const { data, error } = await client.rpc("admin_investment_detail", { p_investment_id: id });
      if (error) {
        if (error.message.includes("not found")) return null;
        throw new Error(error.message);
      }
      const d = data as {
        investment: RawAdminInvestmentRow & { completed_at?: string | null };
        investor: { id: string; display_name: string } | null;
        property: { seed_tag?: string | null } | null;
        events: Array<Parameters<typeof mapEvent>[0]> | null;
        journals: Array<{ reference: string; journal_type: string; created_at: string }> | null;
      };
      const row = mapRow(d.investment);
      row.userDisplayName = d.investor?.display_name ?? row.userDisplayName;
      row.settledAt = d.investment.completed_at ?? null;
      row.seedTag = d.property?.seed_tag ?? row.seedTag ?? null;
      row.events = (d.events ?? []).map(mapEvent);
      row.journals = (d.journals ?? []).map((j) => ({
        reference: j.reference,
        journalType: j.journal_type,
        createdAt: j.created_at,
      }));
      return row;
    },

    async markInvestmentReview(input) {
      if (!(await hasSession())) return domain.markInvestmentReview(input);
      const { error } = await client.rpc("admin_mark_investment_review", {
        p_investment_id: input.investmentId,
        p_reason: input.reason ?? "Marked for review",
        p_request_id: input.idempotencyKey,
      });
      if (error) return { ok: false, auditId: "", message: error.message };
      return { ok: true, auditId: input.idempotencyKey, message: "Investment is now under review." };
    },

    async resolveInvestmentReview(input) {
      if (!(await hasSession())) return domain.resolveInvestmentReview(input);
      const { error } = await client.rpc("admin_resolve_investment_review", {
        p_investment_id: input.investmentId,
        p_to: input.to,
        p_reason: input.reason ?? "Review resolved",
        p_request_id: input.idempotencyKey,
      });
      if (error) return { ok: false, auditId: "", message: error.message };
      return { ok: true, auditId: input.idempotencyKey, message: `Investment moved to ${input.to.toLowerCase()}.` };
    },

    async retrySettlement(input) {
      if (!(await hasSession())) return domain.retrySettlement(input);
      const { data, error } = await client.rpc("admin_retry_settlement", {
        p_investment_id: input.investmentId,
        p_reason: input.reason ?? "Settlement retry",
        p_request_id: input.idempotencyKey,
      });
      if (error) return { ok: false, auditId: "", message: error.message };
      const status = (data as { status?: string } | null)?.status;
      return { ok: status === "COMPLETED", auditId: input.idempotencyKey,
        message: status === "COMPLETED" ? "Settlement completed." : `Retry finished — status ${status}.` };
    },

    async reconcileInvestments(): Promise<InvestmentReconciliationItem[]> {
      if (!(await hasSession())) return domain.reconcileInvestments();
      const { data, error } = await client.rpc("reconcile_investments");
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{ check_name: string; entity_type: string; entity_id: string; detail: string }>).map(
        (r) => ({ checkName: r.check_name, entityType: r.entity_type, entityId: r.entity_id, detail: r.detail }),
      );
    },

    // ── Phase 8B: KYC review queue ──────────────────────────────────────────

    async listKycCases(filter?: KycFilter): Promise<Page<AdminKycCase>> {
      if (!(await hasSession())) return domain.listKycCases(filter);
      const { data, error } = await client.rpc("admin_list_kyc_cases", {
        p_queue: filter?.queue ?? null,
        p_limit: 500,
        p_offset: 0,
      });
      if (error) throw new Error(error.message);
      let items = ((data ?? []) as RawKycCaseRow[]).map(mapKycCaseRow);
      items = items.filter((c) => match([c.userDisplayName, c.id, c.documentType, c.documentNumberMasked], filter?.query));
      items = applySortOn(items, filter?.sort, "submittedAt");
      return pageOf(items, filter);
    },

    async getKycCase(id: string): Promise<AdminKycCase | null> {
      if (!(await hasSession())) return domain.getKycCase(id);
      const { data, error } = await client.rpc("admin_get_kyc_case", { p_submission_id: id });
      if (error) {
        if (error.message.includes("not found")) return null;
        throw new Error(error.message);
      }
      const d = data as RawKycCaseDetail;
      let reviewerName: string | null = null;
      if (d.reviewed_by) {
        const { data: prof } = await client.from("profiles").select("display_name").eq("id", d.reviewed_by).maybeSingle();
        reviewerName = (prof as { display_name?: string } | null)?.display_name ?? null;
      }
      return mapKycCaseDetail(d, reviewerName);
    },

    async decideKyc(input) {
      if (!(await hasSession())) return domain.decideKyc(input);
      // The backend transition map is APPROVE/REJECT — "request more info" is a
      // rejection that invites resubmission, so the reason explains what is needed.
      const decision = input.decision === "REQUEST_MORE_INFO" ? "REJECT" : input.decision;
      const reason = input.decision === "REQUEST_MORE_INFO" ? `Additional information required — ${input.reason}` : input.reason;
      const { error } = await client.rpc("admin_decide_kyc", {
        p_submission_id: input.caseId,
        p_decision: decision,
        p_reason: reason,
        p_request_id: input.idempotencyKey,
      });
      if (error) return { ok: false, auditId: "", message: error.message };
      return {
        ok: true,
        auditId: input.idempotencyKey,
        message: input.decision === "APPROVE" ? "Submission verified." : "Submission rejected — the investor can resubmit.",
      };
    },

    async getKycDocumentUrl(submissionId: string, kind: "selfie" | "poa"): Promise<string> {
      const { data, error } = await client.functions.invoke("kyc-document-url", {
        body: { submission_id: submissionId, kind },
      });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        let msg = error.message;
        if (ctx instanceof Response) {
          try {
            const body = (await ctx.json()) as { error?: string };
            if (body?.error) msg = body.error;
            else msg = await ctx.text();
          } catch { /* fall through */ }
        }
        throw new Error(msg || "Couldn't open the document.");
      }
      return (data as { url: string }).url;
    },

    // ── Phase 8B: withdrawal ops ─────────────────────────────────────────────

    async listWithdrawals(filter?: FinanceFilter): Promise<Page<AdminWithdrawalRow>> {
      if (!(await hasSession())) return domain.listWithdrawals(filter);
      const { data, error } = await client.rpc("admin_list_withdrawals", {
        p_status: filter?.status?.length === 1 ? filter.status[0] : null,
        p_limit: 500,
        p_offset: 0,
      });
      if (error) throw new Error(error.message);
      let items = ((data ?? []) as RawAdminWithdrawalRow[]).map(mapWithdrawalRow);
      if (filter?.status && filter.status.length > 1) items = items.filter((w) => filter.status!.includes(w.status));
      items = items.filter((w) => match([w.reference, w.userDisplayName, w.destinationLabel], filter?.query));
      items = applySortOn(items, filter?.sort, "requestedAt");
      return pageOf(items, filter);
    },

    async getWithdrawal(id: string): Promise<AdminWithdrawalRow | null> {
      if (!(await hasSession())) return domain.getWithdrawal(id);
      const { data, error } = await client.rpc("admin_get_withdrawal", { p_withdrawal_id: id });
      if (error) {
        if (error.message.includes("not found")) return null;
        throw new Error(error.message);
      }
      const d = data as RawAdminWithdrawalDetail;
      const row = mapWithdrawalRow(d);
      const dest = d.destination ?? {};
      row.destinationLabel = dest.bank_name
        ? `${dest.bank_name}${dest.account_number ? ` ····${dest.account_number.slice(-4)}` : ""}`
        : row.destinationLabel;
      row.destination = {
        bankName: dest.bank_name,
        bankCode: dest.bank_code,
        accountNumber: dest.account_number,
        accountName: dest.account_name,
        bankAccountId: dest.bank_account_id,
      };
      row.events = (d.events ?? []).map((e) => ({ from: e.from, to: e.to, source: e.source, note: e.note, at: e.at }));
      row.outbound = (d.outbound ?? []).map((o) => ({
        eventType: o.event_type,
        status: o.status,
        attempts: o.attempts,
        deliveredAt: o.delivered_at,
        lastResponseCode: o.last_response_code,
      }));
      return row;
    },

    async decideWithdrawal(input) {
      if (!(await hasSession())) return domain.decideWithdrawal(input);
      const { error } = await client.rpc("decide_withdrawal", {
        p_withdrawal_id: input.withdrawalId,
        p_decision: input.decision,
        p_reason: input.reason,
        p_request_id: input.idempotencyKey,
      });
      if (error) return { ok: false, auditId: "", message: error.message };
      const message =
        input.decision === "APPROVE"
          ? "Withdrawal approved for payout."
          : input.decision === "MARK_PAID"
            ? "Marked paid — reserved funds released to the payout journal."
            : "Withdrawal rejected — reserved funds returned to the investor.";
      return { ok: true, auditId: input.idempotencyKey, message };
    },

    async reconcileWithdrawals(): Promise<InvestmentReconciliationItem[]> {
      if (!(await hasSession())) return domain.reconcileWithdrawals();
      const { data, error } = await client.rpc("reconcile_withdrawals");
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{ check_name: string; entity_type: string; entity_id: string; detail: string }>).map(
        (r) => ({ checkName: r.check_name, entityType: r.entity_type, entityId: r.entity_id, detail: r.detail }),
      );
    },

    async reconcileKyc(): Promise<InvestmentReconciliationItem[]> {
      if (!(await hasSession())) return domain.reconcileKyc();
      const { data, error } = await client.rpc("reconcile_kyc");
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{ check_name: string; entity_type: string; entity_id: string; detail: string }>).map(
        (r) => ({ checkName: r.check_name, entityType: r.entity_type, entityId: r.entity_id, detail: r.detail }),
      );
    },
  };
}
