"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button, Sheet, SheetContent, SheetTitle, SheetTrigger, cn } from "@rentbrown/ui";
import { MOCK_NOW } from "@rentbrown/mock-data";

import { useProfile, useSession } from "../../lib/data/hooks";
import { Brand } from "./brand";
import { NotificationsPanel } from "./notifications-panel";
import { UserMenu } from "./user-menu";

const memberNav = [
  { href: "/dashboard", label: "Home" },
  { href: "/explore", label: "Explore" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/wallet", label: "Wallet" },
  { href: "/account", label: "Account" },
];

const guestNav = [
  { href: "/explore", label: "Explore" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/property-proof", label: "Property proof" },
  { href: "/faq", label: "FAQ" },
];

function NavLinks({ items, pathname, onNavigate }: { items: typeof memberNav; pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-semibold",
              active ? "bg-accent text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export function Header() {
  const pathname = usePathname();
  const session = useSession();
  const profile = useProfile();
  const signedIn = !!session.data;
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <header className="glass-strong sticky top-0 z-40 border-b border-glass-border">
      <div className="rb-container grid h-16 grid-cols-[auto_1fr_auto] items-center gap-4">
        <Brand />

        <nav aria-label="Primary" className="hidden items-center justify-center gap-1 lg:flex">
          <NavLinks items={signedIn ? memberNav : guestNav} pathname={pathname} />
        </nav>

        <div className="flex items-center justify-end gap-2">
          {signedIn ? (
            <>
              <NotificationsPanel now={MOCK_NOW} />
              {profile.data ? <UserMenu profile={profile.data} /> : null}
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/signup">Create account</Link>
              </Button>
            </>
          )}
          {/* Mobile menu (guests and members) */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open menu"
                className="flex size-10 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring lg:hidden"
              >
                <Menu className="size-5" />
              </button>
            </SheetTrigger>
            <SheetContent>
              <SheetTitle>Menu</SheetTitle>
              <nav aria-label="Mobile" className="flex flex-col gap-1">
                <NavLinks
                  items={signedIn ? memberNav : guestNav}
                  pathname={pathname}
                  onNavigate={() => setMenuOpen(false)}
                />
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
