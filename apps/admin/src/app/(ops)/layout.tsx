"use client";

import * as React from "react";
import { Button, StatePanel } from "@rentbrown/ui";
import { ShieldX } from "lucide-react";

import { AdminShell } from "../../components/layout/admin-shell";
import { useActor, useAdminAuth } from "../../lib/data/provider";

/**
 * Access gate for every operations screen. proxy.ts already bounced
 * unauthenticated requests; this layer handles the authenticated-but-not-admin
 * case: a valid session with no admin_roles grant renders NotAuthorized.
 * DEMO MODE (no Supabase env) keeps the mock actor so the UI stays reviewable.
 */
export default function OpsLayout({ children }: { children: React.ReactNode }) {
  const { mode, signOut } = useAdminAuth();
  const actor = useActor();

  if (mode === "supabase") {
    if (actor.isLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-md bg-primary text-sm font-extrabold text-primary-foreground">
              RB
            </span>
            <span className="text-xs font-semibold text-muted-foreground">Verifying admin access…</span>
          </div>
        </div>
      );
    }
    if (!actor.data) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="w-full max-w-sm">
            <StatePanel
              tone="error"
              icon={<ShieldX className="size-5" />}
              title="No admin access"
              copy="This account has no operations role. Sign in with an admin account or ask a super admin for a grant."
            />
            <Button variant="secondary" className="mt-4 w-full" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      );
    }
  }

  return <AdminShell>{children}</AdminShell>;
}
