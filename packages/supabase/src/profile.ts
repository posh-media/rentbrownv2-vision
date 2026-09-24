import type { AppProfile } from "@rentbrown/types";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/** Row shape of public.profiles (snake_case → camelCase AppProfile). */
export interface ProfileRow {
  id: string;
  username: string;
  display_name: string;
  phone: string | null;
  account_status: AppProfile["accountStatus"];
  referral_code: string;
  referred_by: string | null;
  created_at: string;
  updated_at: string;
}

export function toAppProfile(row: ProfileRow, user: Pick<User, "email" | "email_confirmed_at">): AppProfile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: user.email ?? "",
    phone: row.phone,
    accountStatus: row.account_status,
    referralCode: row.referral_code,
    referredBy: row.referred_by,
    emailVerified: user.email_confirmed_at != null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The caller's own profile row, or null when not provisioned yet. */
export async function fetchProfile(client: SupabaseClient, user: User): Promise<AppProfile | null> {
  const { data, error } = await client.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toAppProfile(data as ProfileRow, user) : null;
}
