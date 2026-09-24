"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CircleUserRound, Compass, House, WalletCards } from "lucide-react";
import { cn } from "@rentbrown/ui";

import { useSession } from "../../lib/data/hooks";

const tabs = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/portfolio", label: "Portfolio", icon: Building2 },
  { href: "/wallet", label: "Wallet", icon: WalletCards },
  { href: "/account", label: "Account", icon: CircleUserRound },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const session = useSession();

  // Guests use the header Sheet menu instead of a member tab bar.
  if (!session.data) return null;

  return (
    <nav
      aria-label="Primary"
      className="glass-strong fixed inset-x-0 bottom-0 z-40 border-t border-glass-border lg:hidden"
    >
      <div className="grid grid-cols-5 pb-[max(.4rem,env(safe-area-inset-bottom))] pt-1.5">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 text-[10px] font-bold",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" strokeWidth={active ? 2.4 : 2} aria-hidden />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
