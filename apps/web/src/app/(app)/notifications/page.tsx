"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Building2,
  CircleUserRound,
  Gift,
  Megaphone,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { Button, EmptyState, StatePanel, cn } from "@rentbrown/ui";
import type { Notification, NotificationCategory, NotificationLink } from "@rentbrown/types";
import { formatListDate } from "@rentbrown/utils";
import { MOCK_NOW } from "@rentbrown/mock-data";

import { useMarkAllRead, useMarkRead, useNotifications } from "../../../lib/data/hooks";
import { useRequireSession } from "../../../lib/session";
import { PageHeader } from "../../../components/layout/page-header";
import { PageSkeleton } from "../../../components/layout/page-skeleton";

const CATEGORIES: Array<{ value: NotificationCategory | "ALL"; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "INVESTMENTS", label: "Investments" },
  { value: "MONEY", label: "Money" },
  { value: "KYC", label: "Verification" },
  { value: "REFERRALS", label: "Referrals" },
  { value: "SECURITY", label: "Security" },
  { value: "ANNOUNCEMENTS", label: "Announcements" },
];

const categoryIcon: Record<NotificationCategory, typeof Bell> = {
  INVESTMENTS: Building2,
  MONEY: WalletCards,
  KYC: CircleUserRound,
  REFERRALS: Gift,
  SECURITY: ShieldCheck,
  ANNOUNCEMENTS: Megaphone,
};

function linkHref(link?: NotificationLink): string | null {
  if (!link) return null;
  switch (link.kind) {
    case "investment":
      return `/portfolio/${link.id}`;
    case "withdrawal":
      return `/wallet/withdrawals/${link.id}`;
    case "wallet":
      return "/wallet";
    case "opportunity":
      return `/opportunities/${link.slug}`;
    case "referrals":
      return "/referrals";
    case "kyc":
      return "/account/kyc";
    case "security":
      return "/account/security";
  }
}

function groupFor(n: Notification): string {
  const label = formatListDate(n.createdAt, MOCK_NOW);
  return label === "Today" || label === "Yesterday" ? label : "Earlier";
}

export default function NotificationsPage() {
  const session = useRequireSession();
  const notifications = useNotifications();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const router = useRouter();
  const [category, setCategory] = React.useState<NotificationCategory | "ALL">("ALL");

  if (session.isPending || notifications.isPending) return <PageSkeleton cards={4} />;

  if (notifications.isError) {
    return (
      <StatePanel
        tone="error"
        title="We couldn't load notifications"
        copy={notifications.error.message}
        action={
          <Button variant="outline" size="sm" onClick={() => notifications.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const all = notifications.data ?? [];
  const items = category === "ALL" ? all : all.filter((n) => n.category === category);
  const unread = all.filter((n) => !n.read).length;

  const groups = ["Today", "Yesterday", "Earlier"]
    .map((g) => ({ heading: g, items: items.filter((n) => groupFor(n) === g) }))
    .filter((g) => g.items.length > 0);

  const open = (n: Notification) => {
    if (!n.read) markRead.mutate(n.id);
    const href = linkHref(n.link);
    if (href) router.push(href);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        actions={
          unread > 0 ? (
            <Button variant="outline" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
              Mark all as read
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-pressed={category === c.value}
            onClick={() => setCategory(c.value)}
            className={cn(
              "min-h-9 rounded-full border px-3.5 text-xs font-bold",
              category === c.value
                ? "border-primary bg-accent text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Bell />}
          title="You're all caught up"
          copy={category === "ALL" ? "No notifications right now." : "Nothing in this category."}
        />
      ) : (
        groups.map((g) => (
          <section key={g.heading}>
            <h2 className="eyebrow mb-2 text-muted-foreground">{g.heading}</h2>
            <div className="financial-card divide-y divide-border overflow-hidden">
              {g.items.map((n) => {
                const Icon = categoryIcon[n.category];
                const href = linkHref(n.link);
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => open(n)}
                    className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-ring sm:px-5"
                  >
                    <span
                      aria-hidden
                      className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")}
                    />
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary-soft text-primary">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm", n.read ? "font-semibold text-foreground" : "font-extrabold text-foreground")}>
                        {n.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{n.body}</span>
                      <span className="mt-1 block text-[11px] text-tertiary">
                        {formatListDate(n.createdAt, MOCK_NOW)}
                        {href ? " · Tap to view" : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
