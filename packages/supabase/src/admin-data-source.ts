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
  InvestmentAdminFilter,
  InvestmentReconciliationItem,
  InvestmentStatus,
  Page,
  PaymentStatus,
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

    async reconcileInvestments(): Promise<InvestmentReconciliationItem[]> {
      if (!(await hasSession())) return domain.reconcileInvestments();
      const { data, error } = await client.rpc("reconcile_investments");
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{ check_name: string; entity_type: string; entity_id: string; detail: string }>).map(
        (r) => ({ checkName: r.check_name, entityType: r.entity_type, entityId: r.entity_id, detail: r.detail }),
      );
    },
  };
}
