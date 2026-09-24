"use client";

import * as React from "react";
import type { Permission } from "@rentbrown/types";
import { EmptyState, Tooltip, TooltipContent, TooltipTrigger } from "@rentbrown/ui";
import { Lock } from "lucide-react";

import { usePermissions } from "../lib/data/provider";

/**
 * RBAC affordance. Renders children when the actor holds the permission.
 * mode="hide"   → renders nothing otherwise (nav items, secondary actions)
 * mode="disable"→ renders children disabled with a "Requires X" tooltip
 * mode="page"   → renders a full-page insufficient-permission state
 */
export function PermissionGate({
  permission,
  mode = "hide",
  children,
}: {
  permission: Permission;
  mode?: "hide" | "disable" | "page";
  children: React.ReactElement;
}) {
  const { has, ready } = usePermissions();

  if (!ready) return mode === "page" ? <div className="h-40 animate-pulse rounded-lg bg-surface-sunken" /> : null;
  if (has(permission)) return children;

  if (mode === "page") {
    return (
      <EmptyState
        icon={<Lock />}
        title="Insufficient permission"
        copy={
          <>
            Your current role does not hold <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-xs">{permission}</code>.
            Switch roles in the top bar to preview another permission set.
          </>
        }
      />
    );
  }

  if (mode === "disable") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed opacity-60">
            {/* fieldset[disabled] disables every descendant control — works for
                single buttons and whole action groups alike. */}
            <fieldset disabled aria-disabled="true" className="contents">
              {children}
            </fieldset>
          </span>
        </TooltipTrigger>
        <TooltipContent>Requires {permission}</TooltipContent>
      </Tooltip>
    );
  }

  return null;
}
