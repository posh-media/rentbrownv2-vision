"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Button,
  StatePanel,
  StatusPill,
} from "@rentbrown/ui";
import {
  ChevronRight,
  CircleUserRound,
  Gift,
  HelpCircle,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { formatDate } from "@rentbrown/utils";

import { useKyc, useProfile, useSignOut } from "../../../lib/data/hooks";
import { useRequireSession } from "../../../lib/session";
import { labelFor, toneFor } from "../../../lib/status";
import { PageSkeleton } from "../../../components/layout/page-skeleton";

const links = [
  { href: "/account/profile", icon: CircleUserRound, title: "Profile & personal details", caption: "Name, email and phone" },
  { href: "/account/kyc", icon: ShieldCheck, title: "Identity verification", caption: null },
  { href: "/account/security", icon: ShieldCheck, title: "Security & transaction PIN", caption: "Password, PIN, devices and sessions" },
  { href: "/account/settings", icon: SlidersHorizontal, title: "Preferences", caption: "Currency and notifications" },
  { href: "/referrals", icon: Gift, title: "Referrals", caption: "Your code and rewards" },
  { href: "/help", icon: HelpCircle, title: "Help & tutorials", caption: "Guides and support" },
  { href: "/legal/terms", icon: ScrollText, title: "Legal", caption: "Terms, privacy and risk disclosures" },
];

export default function AccountPage() {
  const session = useRequireSession();
  const profile = useProfile();
  const kyc = useKyc();
  const signOut = useSignOut();
  const router = useRouter();

  if (session.isPending || profile.isPending) return <PageSkeleton />;

  if (profile.isError) {
    return (
      <StatePanel
        tone="error"
        title="We couldn't load your account"
        copy={profile.error.message}
        action={
          <Button variant="outline" size="sm" onClick={() => profile.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const p = profile.data;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="financial-card flex items-center gap-4 p-5 sm:p-6">
        <Avatar initials={p.initials} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold text-foreground">{p.displayName}</h1>
          <p className="truncate text-sm text-muted-foreground">{p.email}</p>
          <p className="text-xs text-muted-foreground">{p.phone}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {kyc.data ? <StatusPill tone={toneFor(kyc.data.status)}>{labelFor(kyc.data.status)}</StatusPill> : null}
          <span className="text-[11px] text-tertiary">Member since {formatDate(p.memberSince)}</span>
        </div>
      </div>

      <div className="financial-card divide-y divide-border overflow-hidden">
        {links.map((l) => {
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              className="flex min-h-11 items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-ring sm:px-5"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary-soft text-primary">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-foreground">{l.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {l.href === "/account/kyc" && kyc.data ? labelFor(kyc.data.status) : l.caption}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-tertiary" aria-hidden />
            </Link>
          );
        })}
      </div>

      <Button
        variant="outline"
        className="text-[var(--error-fg)]"
        disabled={signOut.isPending}
        onClick={() => {
          signOut.mutate(undefined, { onSuccess: () => router.replace("/login") });
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
