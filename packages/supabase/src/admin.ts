import { ADMIN_PERMISSIONS_BY_ROLE } from "@rentbrown/types";
import type { AdminActor, AdminRole } from "@rentbrown/types";
import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchProfile } from "./profile";

/**
 * Resolve the signed-in user's admin actor, or null when they hold no
 * admin_roles grant. The role row is server-side truth; permission bundles
 * come from the shared vocabulary in @rentbrown/types.
 */
export async function resolveAdminActor(client: SupabaseClient): Promise<AdminActor | null> {
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) return null;

  const { data: role } = await client.rpc("current_admin_role");
  if (!role) return null;

  const profile = await fetchProfile(client, user);
  const displayName =
    profile?.displayName ??
    (user.user_metadata?.display_name as string | undefined) ??
    user.email?.split("@")[0] ??
    "Admin";

  return {
    id: user.id,
    displayName,
    initials: displayName
      .split(/\s+/)
      .map((w) => w[0] ?? "")
      .slice(0, 2)
      .join("")
      .toUpperCase(),
    email: user.email ?? "",
    roles: [role as AdminRole],
    permissions: ADMIN_PERMISSIONS_BY_ROLE[role as AdminRole] ?? [],
  };
}
