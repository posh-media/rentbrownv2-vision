"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Input, cn } from "@rentbrown/ui";
import { Search } from "lucide-react";

import { NAV } from "../../lib/nav";
import { usePermissions } from "../../lib/data/provider";
import { ActorChip, RoleSwitcher } from "../role-switcher";

function NavLink({ item, pathname }: { item: (typeof NAV)[number]["items"][number]; pathname: string }) {
  const active = item.match ? item.match.test(pathname) : pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-label={item.label}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-semibold transition-colors",
        "max-lg:justify-center max-lg:px-0",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
      )}
    >
      <item.icon className="size-4 shrink-0" />
      <span className="hidden truncate lg:inline">{item.label}</span>
    </Link>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { has, ready } = usePermissions();
  const [search, setSearch] = React.useState("");

  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.permission || (ready && has(i.permission))),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar — icons only below lg */}
      <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r border-border bg-card lg:w-60">
        <div className="flex h-14 items-center gap-2 border-b border-border px-3 lg:px-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-extrabold text-primary-foreground">
            RB
          </span>
          <div className="hidden min-w-0 flex-col leading-tight lg:flex">
            <span className="truncate text-sm font-extrabold text-foreground">RentBrown</span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Admin · Ops</span>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3 lg:px-3" aria-label="Admin navigation">
          {groups.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="eyebrow mb-1.5 hidden px-2.5 text-tertiary lg:block">{group.label}</p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-border p-3 text-center text-[10px] text-tertiary lg:text-left">
          <span className="hidden lg:inline">Prototype — fictional data only.</span>
          <span className="lg:hidden">·</span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (chrome — glass allowed) */}
        <header className="glass sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-glass-border px-4 lg:px-6">
          <form
            className="relative w-full max-w-md"
            onSubmit={(e) => {
              e.preventDefault();
              if (search.trim()) router.push(`/users?query=${encodeURIComponent(search.trim())}`);
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tertiary" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users, references…"
              className="h-9 pl-9 text-xs"
              aria-label="Global search"
            />
          </form>
          <div className="ml-auto flex items-center gap-3">
            <RoleSwitcher />
            <ActorChip />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 lg:px-6 lg:py-6">{children}</main>
      </div>
    </div>
  );
}
