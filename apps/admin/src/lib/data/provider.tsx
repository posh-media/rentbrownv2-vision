"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminActor, AdminDataSource, AdminRole, AuthGateway, Permission } from "@rentbrown/types";
import { createMockAdminDataSource } from "@rentbrown/mock-data";
import { createAuthGateway, resolveAdminActor, type SupabaseClient } from "@rentbrown/supabase";

import { getSupabaseBrowserClient } from "../supabase/client";

const ROLE_KEY = "rb.admin.role";

const ROLES: AdminRole[] = ["SUPPORT", "KYC_REVIEWER", "OPERATIONS_ADMIN", "FINANCE_ADMIN", "SUPER_ADMIN"];

function readRole(): AdminRole {
  if (typeof window === "undefined") return "FINANCE_ADMIN";
  const raw = window.localStorage.getItem(ROLE_KEY);
  return (ROLES as string[]).includes(raw ?? "") ? (raw as AdminRole) : "FINANCE_ADMIN";
}

/**
 * "supabase" — real auth via Supabase (env present). Role is server truth,
 * resolved from public.admin_roles via resolveAdminActor.
 * "demo" — no Supabase env: the app renders the mock actor behind a DEMO MODE
 * banner so the UI stays reviewable without a backend. Dev/demo path only.
 */
export type AdminAuthMode = "supabase" | "demo";

interface AdminAuthContextValue {
  mode: AdminAuthMode;
  client: SupabaseClient | null;
  gateway: AuthGateway | null;
  signOut: () => Promise<void>;
}

interface RoleControls {
  role: AdminRole;
  /** Demo mode only — in Supabase mode the role is server truth (no-op). */
  setRole: (role: AdminRole) => void;
  /** True when the role comes from the server's admin_roles grant. */
  serverRole: boolean;
}

const AuthContext = React.createContext<AdminAuthContextValue | null>(null);
const DataSourceContext = React.createContext<AdminDataSource | null>(null);
const RoleContext = React.createContext<RoleControls | null>(null);
const ActorResolverContext = React.createContext<(() => Promise<AdminActor | null>) | null>(null);

export function AdminDataProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, retry: 1 } } }),
  );
  const [client] = React.useState<SupabaseClient | null>(() => getSupabaseBrowserClient());
  const gateway = React.useMemo(() => (client ? createAuthGateway(client) : null), [client]);
  const mode: AdminAuthMode = client ? "supabase" : "demo";

  const signOut = React.useCallback(async () => {
    await gateway?.signOut();
  }, [gateway]);

  const auth = React.useMemo<AdminAuthContextValue>(
    () => ({ mode, client, gateway, signOut }),
    [mode, client, gateway, signOut],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <AdminSession>{children}</AdminSession>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

/**
 * Session layer: resolves the actor (real or mock), derives the effective
 * role, owns the domain data source and the auth-state subscription.
 */
function AdminSession({ children }: { children: React.ReactNode }) {
  const { mode, client, gateway } = useAdminAuth();
  const queryClient = useQueryClient();
  const router = useRouter();

  // Demo-mode role switcher state (localStorage). Ignored in Supabase mode.
  const [demoRole, setDemoRole] = React.useState<AdminRole>("FINANCE_ADMIN");
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    // Hydration gate: localStorage is only readable after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDemoRole(readRole());
    setHydrated(true);
  }, []);

  // In Supabase mode the role is server truth — resolve the actor once here.
  // Shares cache with useActor() (same query key). Errors (e.g. admin_roles
  // RPC missing because the migration is pending) resolve to null, which the
  // access gate renders as the NotAuthorized state.
  const actorQuery = useQuery<AdminActor | null>({
    queryKey: ["rb-admin", mode, "actor"],
    enabled: mode === "supabase" && client != null,
    staleTime: 30_000,
    queryFn: async () => {
      if (!client) return null;
      try {
        return await resolveAdminActor(client);
      } catch {
        return null;
      }
    },
  });

  const role: AdminRole = mode === "supabase" ? (actorQuery.data?.roles[0] ?? "SUPPORT") : demoRole;

  // Domain reads stay mock in Phase 2 — only the actor/permissions are real.
  // Phase 3+ swaps these for real adapters behind the same AdminDataSource seam.
  const source = React.useMemo(() => createMockAdminDataSource({ role, latencyMs: 320 }), [role]);

  const resolveActor = React.useCallback(async (): Promise<AdminActor | null> => {
    if (mode === "supabase") {
      if (!client) return null;
      try {
        return await resolveAdminActor(client);
      } catch {
        return null;
      }
    }
    return source.getActor();
  }, [mode, client, source]);

  const setRole = React.useCallback(
    (next: AdminRole) => {
      if (mode !== "demo") return; // server truth — no client-side switching
      window.localStorage.setItem(ROLE_KEY, next);
      queryClient.clear();
      setDemoRole(next);
    },
    [mode, queryClient],
  );

  const controls = React.useMemo<RoleControls>(
    () => ({ role, setRole, serverRole: mode === "supabase" }),
    [role, setRole, mode],
  );

  // Auth-state subscription: sign-out anywhere clears caches and leaves the app.
  React.useEffect(() => {
    if (!gateway) return;
    return gateway.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        queryClient.clear();
        router.replace("/login");
      } else {
        queryClient.invalidateQueries({ queryKey: ["rb-admin"] });
      }
    });
  }, [gateway, queryClient, router]);

  if (!hydrated) return null;

  return (
    <DataSourceContext.Provider value={source}>
      <RoleContext.Provider value={controls}>
        <ActorResolverContext.Provider value={resolveActor}>{children}</ActorResolverContext.Provider>
      </RoleContext.Provider>
    </DataSourceContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used inside <AdminDataProvider>");
  return ctx;
}

export function useDataSource(): AdminDataSource {
  const ctx = React.useContext(DataSourceContext);
  if (!ctx) throw new Error("useDataSource must be used inside <AdminDataProvider>");
  return ctx;
}

export function useRole(): RoleControls {
  const ctx = React.useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used inside <AdminDataProvider>");
  return ctx;
}

/**
 * Current admin actor (name, roles, effective permissions).
 * Supabase mode: resolved from the server's admin_roles grant — null when the
 * signed-in user holds no admin role (or no session). Demo mode: mock actor.
 */
export function useActor() {
  const { mode } = useAdminAuth();
  const resolve = React.useContext(ActorResolverContext);
  if (!resolve) throw new Error("useActor must be used inside <AdminDataProvider>");
  return useQuery<AdminActor | null>({ queryKey: ["rb-admin", mode, "actor"], queryFn: resolve });
}

/** Permission helpers — UI affordances only, never security. */
export function usePermissions() {
  const { data: actor } = useActor();
  const permissions = React.useMemo(() => new Set<Permission>(actor?.permissions ?? []), [actor]);
  return React.useMemo(
    () => ({
      actor: actor ?? undefined,
      ready: actor !== undefined,
      has: (permission: Permission) => permissions.has(permission),
      hasAll: (...list: Permission[]) => list.every((p) => permissions.has(p)),
    }),
    [actor, permissions],
  );
}
