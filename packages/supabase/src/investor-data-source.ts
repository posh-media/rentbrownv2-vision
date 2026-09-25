import type {
  AuthGateway,
  DepositIntent,
  DepositOptions,
  DepositStatus,
  InvestorDataSource,
  Session,
  SignInInput,
  SignUpInput,
  UserProfile,
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

/**
 * InvestorDataSource where identity/session is REAL (Supabase Auth +
 * public.profiles) and every domain read is delegated to another data source
 * — today the mock source, later per-domain Supabase adapters.
 *
 * Screens keep depending on InvestorDataSource; nothing in this file knows
 * about React, and no screen imports @supabase/supabase-js directly.
 */
export function createSupabaseInvestorDataSource(
  client: SupabaseClient,
  domain: InvestorDataSource,
): InvestorDataSource & { auth: AuthGateway } {
  const auth = createAuthGateway(client);

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
    async getProfile(): Promise<UserProfile> {
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
    },

    // ── everything else — delegated unchanged ───────────────────────────────
    getKyc: () => domain.getKyc(),
    getDashboard: () => domain.getDashboard(),
    listOpportunities: (filter) => domain.listOpportunities(filter),
    getOpportunity: (slug) => domain.getOpportunity(slug),
    quoteInvestment: (roundId, slots) => domain.quoteInvestment(roundId, slots),
    submitInvestment: (input) => domain.submitInvestment(input),
    getSubmission: (reference) => domain.getSubmission(reference),
    listInvestments: (filter) => domain.listInvestments(filter),
    getInvestment: (id) => domain.getInvestment(id),
    getWallet: () => domain.getWallet(),
    listTransactions: (filter) => domain.listTransactions(filter),
    getTransaction: (id) => domain.getTransaction(id),
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
    quoteWithdrawal: (amount, destinationId) => domain.quoteWithdrawal(amount, destinationId),
    requestWithdrawal: (input) => domain.requestWithdrawal(input),
    getWithdrawal: (id) => domain.getWithdrawal(id),
    listWithdrawals: () => domain.listWithdrawals(),
    getReferralSummary: () => domain.getReferralSummary(),
    listReferrals: () => domain.listReferrals(),
    listNotifications: () => domain.listNotifications(),
    markNotificationRead: (id) => domain.markNotificationRead(id),
    markAllNotificationsRead: () => domain.markAllNotificationsRead(),
    getContent: () => domain.getContent(),
  };
}
