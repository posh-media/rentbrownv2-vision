"use client";

import * as React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  cn,
} from "@rentbrown/ui";
import { formatListDate } from "@rentbrown/utils";
import type { Notification } from "@rentbrown/types";

import { useMarkAllRead, useNotifications } from "../../lib/data/hooks";

export function NotificationsPanel({ now }: { now: string }) {
  const notifications = useNotifications();
  const markAll = useMarkAllRead();
  const items = notifications.data ?? [];
  const unread = items.filter((n) => !n.read).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          className="relative flex size-10 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          <Bell className="size-4.5" />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-destructive-foreground">
              {unread}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-bold text-foreground">Notifications</span>
          {unread > 0 ? (
            <button
              type="button"
              className="text-xs font-semibold text-primary hover:underline"
              onClick={() => markAll.mutate()}
            >
              Mark all read
            </button>
          ) : null}
        </div>
        <ul className="max-h-80 overflow-y-auto">
          {items.slice(0, 5).map((n: Notification) => (
            <li key={n.id} className="border-b border-border last:border-0">
              <div className={cn("flex gap-3 px-4 py-3", !n.read && "bg-surface-subtle/60")}>
                <span
                  aria-hidden
                  className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")}
                />
                <div className="min-w-0">
                  <p className="eyebrow text-muted-foreground">{n.category.toLowerCase()}</p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">{n.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-[11px] text-tertiary">{formatListDate(n.createdAt, now)}</p>
                </div>
              </div>
            </li>
          ))}
          {items.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications yet.</li>
          ) : null}
        </ul>
        <div className="border-t border-border p-2">
          <Button variant="ghost" size="sm" className="w-full" asChild>
            <Link href="/notifications">View all</Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
