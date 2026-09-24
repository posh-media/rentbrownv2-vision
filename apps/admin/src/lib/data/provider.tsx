"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { AdminActor, AdminDataSource, AdminRole, Permission } from "@rentbrown/types";
import { createMockAdminDataSource } from "@rentbrown/mock-data";

const ROLE_KEY = "rb.admin.role";

const ROLES: AdminRole[] = ["SUPPORT", "KYC_REVIEWER", "OPERATIONS_ADMIN", "FINANCE_ADMIN", "SUPER_ADMIN"];

function readRole(): AdminRole {
  if (typeof window === "undefined") return "FINANCE_ADMIN";
  const raw = window.localStorage.getItem(ROLE_KEY);
  return (ROLES as string[]).includes(raw ?? "") ? (raw as AdminRole) : "FINANCE_ADMIN";
}

interface RoleControls {
  role: AdminRole;
  setRole: (role: AdminRole) => void;
}

const DataSourceContext = React.createContext<AdminDataSource | null>(null);
const RoleContext = React.createContext<RoleControls | null>(null);

export function AdminDataProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = React.useState<AdminRole>("FINANCE_ADMIN");
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    // Hydration gate: localStorage is only readable after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRoleState(readRole());
    setHydrated(true);
  }, []);

  const source = React.useMemo(() => createMockAdminDataSource({ role, latencyMs: 320 }), [role]);

  // A new role means a fresh mock backend — recreate the QueryClient so every
  // cached query is dropped along with the old source instance.
  const queryClient = React.useMemo(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 20_000, retry: 1 } },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- role intentionally recreates the client
    [role],
  );

  const controls = React.useMemo<RoleControls>(
    () => ({
      role,
      setRole: (next) => {
        window.localStorage.setItem(ROLE_KEY, next);
        setRoleState(next);
      },
    }),
    [role],
  );

  if (!hydrated) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <DataSourceContext.Provider value={source}>
        <RoleContext.Provider value={controls}>{children}</RoleContext.Provider>
      </DataSourceContext.Provider>
    </QueryClientProvider>
  );
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

/** Current admin actor (name, roles, effective permissions). */
export function useActor() {
  const ds = useDataSource();
  const { role } = useRole();
  return useQuery({ queryKey: ["rb-admin", role, "actor"], queryFn: () => ds.getActor() });
}

/** Permission helpers — UI affordances only, never security. */
export function usePermissions() {
  const { data: actor } = useActor();
  const permissions = React.useMemo(() => new Set<Permission>(actor?.permissions ?? []), [actor]);
  return React.useMemo(
    () => ({
      actor: actor as AdminActor | undefined,
      ready: actor !== undefined,
      has: (permission: Permission) => permissions.has(permission),
      hasAll: (...list: Permission[]) => list.every((p) => permissions.has(p)),
    }),
    [actor, permissions],
  );
}
