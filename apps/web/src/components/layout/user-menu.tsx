"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@rentbrown/ui";
import type { UserProfile } from "@rentbrown/types";

import { useSignOut } from "../../lib/data/hooks";

export function UserMenu({ profile }: { profile: UserProfile }) {
  const signOut = useSignOut();
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="flex min-h-11 items-center gap-2 rounded-md px-1.5 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          <Avatar initials={profile.initials} size="sm" />
          <span className="hidden rounded-md bg-muted px-2.5 py-1 text-sm font-semibold text-foreground sm:block">
            {profile.firstName}
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link href="/account">Account</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/security">Security</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/settings">Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/help">Help &amp; tutorials</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            signOut.mutate(undefined, { onSuccess: () => router.replace("/login") });
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
