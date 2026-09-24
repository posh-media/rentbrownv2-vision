import type {
  AuthGateway,
  InvestorDataSource,
  Session,
  SignInInput,
  SignUpInput,
  UserProfile,
} from "@rentbrown/types";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAuthGateway } from "./gateway";
import { fetchProfile } from "./profile";

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
    createDeposit: (input) => domain.createDeposit(input),
    getDeposit: (id) => domain.getDeposit(id),
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
