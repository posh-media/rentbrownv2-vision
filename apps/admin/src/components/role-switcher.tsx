"use client";

import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  StatusPill,
  toast,
} from "@rentbrown/ui";
import { Check, ChevronsUpDown } from "lucide-react";
import type { AdminRole } from "@rentbrown/types";

import { useRoles } from "../lib/data/hooks";
import { useActor, useAdminAuth, useRole } from "../lib/data/provider";

const ROLE_BADGE_TONE: Record<AdminRole, "info" | "warning" | "success" | "pending" | "neutral"> = {
  SUPPORT: "neutral",
  KYC_REVIEWER: "info",
  OPERATIONS_ADMIN: "pending",
  FINANCE_ADMIN: "warning",
  SUPER_ADMIN: "success",
};

/** Demo-mode role switcher — hidden in Supabase mode where the role is server truth. */
export function RoleSwitcher() {
  const { mode } = useAdminAuth();
  const { role, setRole } = useRole();
  const { data: roles } = useRoles();

  if (mode !== "demo") return null;

  const active = roles?.find((r) => r.role === role);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-subtle">
        <span className="hidden sm:inline">{active?.label ?? role}</span>
        <span className="sm:hidden">Role</span>
        <ChevronsUpDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Mock session — switch actor role</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(roles ?? []).map((r) => (
          <DropdownMenuItem
            key={r.role}
            onSelect={() => {
              setRole(r.role);
              toast.info(`Acting as ${r.label}`, { description: "Data source recreated; caches cleared." });
            }}
            className="flex-col items-start gap-0.5 py-2"
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="font-semibold">{r.label}</span>
              {r.role === role ? <Check className="size-3.5 text-primary" /> : null}
            </span>
            <span className="text-xs font-normal text-muted-foreground">{r.description}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Actor chip for the top bar: initials, name, role badge, session note. */
export function ActorChip() {
  const { data: actor } = useActor();
  const { mode } = useAdminAuth();
  const { role } = useRole();
  if (!actor) return <div className="h-9 w-40 animate-pulse rounded-md bg-surface-sunken" />;
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
        {actor.initials}
      </span>
      <span className="hidden flex-col leading-tight md:flex">
        <span className="text-xs font-bold text-foreground">{actor.displayName}</span>
        <span className="text-[10px] text-muted-foreground">
          {mode === "demo" ? "Demo mode · no auth" : actor.email}
        </span>
      </span>
      <StatusPill tone={ROLE_BADGE_TONE[role]} className="hidden lg:inline-flex">
        {role.replace("_", " ")}
      </StatusPill>
    </div>
  );
}
