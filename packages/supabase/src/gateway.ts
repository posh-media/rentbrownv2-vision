import type {
  AppProfile,
  AuthChangeEvent,
  AuthGateway,
  RequestPasswordResetInput,
  Session,
  SignInInput,
  SignUpInput,
  SignUpResult,
} from "@rentbrown/types";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { fetchProfile } from "./profile";

function toSession(user: User, issuedAt?: string | null): Session {
  return {
    userId: user.id,
    displayName:
      (user.user_metadata?.display_name as string | undefined) ??
      (user.user_metadata?.full_name as string | undefined) ??
      user.email?.split("@")[0] ??
      "Investor",
    issuedAt: issuedAt ?? user.created_at,
  };
}

/** Map Supabase auth errors to copy the UI can show verbatim. */
function authError(err: { message: string; code?: string }): Error {
  const code = err.code ?? "";
  const msg = err.message.toLowerCase();
  if (code === "invalid_credentials" || msg.includes("invalid login")) {
    return new Error("Incorrect email or password.");
  }
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) {
    return new Error("Please verify your email first — we sent you a confirmation link when you signed up.");
  }
  if (code === "user_banned" || msg.includes("banned")) {
    return new Error("This account is disabled. Contact support.");
  }
  if (code === "over_request_rate_limit" || msg.includes("rate limit")) {
    return new Error("Too many attempts — wait a moment and try again.");
  }
  if (code === "weak_password" || msg.includes("password")) {
    return new Error(err.message);
  }
  if (msg.includes("already registered") || msg.includes("already been registered")) {
    return new Error("An account already exists for this email. Try signing in instead.");
  }
  return new Error(err.message);
}

export function createAuthGateway(client: SupabaseClient): AuthGateway {
  return {
    async getAuthState() {
      // getUser() verifies the token server-side — never trust stored claims alone.
      const {
        data: { user },
        error,
      } = await client.auth.getUser();
      if (error || !user) return null;
      const profile = await fetchProfile(client, user);
      return { session: toSession(user), profile };
    },

    async signIn(input: SignInInput) {
      const { data, error } = await client.auth.signInWithPassword({
        email: input.email.trim().toLowerCase(),
        password: input.password,
      });
      if (error) throw authError(error);
      if (!data.user || !data.session) throw new Error("Sign in did not return a session.");
      const profile = await fetchProfile(client, data.user);
      if (!profile) throw new Error("Your profile is still being set up — try again in a moment.");
      if (profile.accountStatus === "SUSPENDED" || profile.accountStatus === "CLOSED") {
        await client.auth.signOut();
        throw new Error("This account is not active. Contact support.");
      }
      return { session: toSession(data.user, data.session.user.created_at), profile };
    },

    async signUp(input: SignUpInput): Promise<SignUpResult> {
      const { data, error } = await client.auth.signUp({
        email: input.email.trim().toLowerCase(),
        password: input.password,
        options: {
          data: {
            username: input.username.trim(),
            display_name: input.fullName.trim(),
            full_name: input.fullName.trim(),
            phone: input.phone,
            referral_code: input.referralCode?.trim() || undefined,
          },
        },
      });
      if (error) throw authError(error);
      if (!data.user) throw new Error("Sign up failed.");
      // Supabase returns no session when email confirmation is required.
      return {
        requiresEmailConfirmation: data.session == null,
        userId: data.user.id,
      };
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw authError(error);
    },

    async requestPasswordReset(input: RequestPasswordResetInput) {
      const { error } = await client.auth.resetPasswordForEmail(input.email.trim().toLowerCase(), {
        redirectTo: input.redirectTo,
      });
      if (error) throw authError(error);
    },

    async updatePassword(newPassword: string) {
      const { error } = await client.auth.updateUser({ password: newPassword });
      if (error) throw authError(error);
    },

    async getProfile(): Promise<AppProfile | null> {
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user) return null;
      return fetchProfile(client, user);
    },

    onAuthStateChange(cb: (event: AuthChangeEvent) => void) {
      const {
        data: { subscription },
      } = client.auth.onAuthStateChange((event) => {
        if (
          event === "SIGNED_IN" ||
          event === "SIGNED_OUT" ||
          event === "TOKEN_REFRESHED" ||
          event === "USER_UPDATED" ||
          event === "PASSWORD_RECOVERY"
        ) {
          cb(event);
        }
      });
      return () => subscription.unsubscribe();
    },
  };
}
