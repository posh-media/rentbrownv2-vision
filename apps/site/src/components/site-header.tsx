"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button, cn } from "@rentbrown/ui";

const NAV = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/explore", label: "Explore" },
  { href: "/learn", label: "Learn" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader({ signInHref, getStartedHref }: { signInHref: string; getStartedHref: string }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  return (
    <header className="glass-strong sticky top-0 z-40 border-b border-glass-border">
      <div className="rb-container grid h-16 grid-cols-[auto_1fr_auto] items-center gap-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label="RentBrown home">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary font-display text-sm text-primary-foreground">
            RB
          </span>
          <span className="text-lg font-extrabold tracking-tight text-foreground">RentBrown</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center justify-center gap-1 lg:flex">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-semibold",
                  active ? "bg-accent text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <a href={signInHref}>Sign in</a>
          </Button>
          <Button size="sm" asChild className="hidden sm:inline-flex">
            <a href={getStartedHref}>Get started</a>
          </Button>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="site-mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="flex size-10 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring lg:hidden"
          >
            {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </div>

      {/* Mobile slide-down menu */}
      <div
        id="site-mobile-menu"
        className={cn(
          "overflow-hidden border-glass-border transition-[max-height] duration-300 ease-out motion-reduce:transition-none lg:hidden",
          open ? "max-h-96 border-t" : "max-h-0",
        )}
      >
        <nav aria-label="Mobile" className="rb-container flex flex-col gap-1 py-4">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded-md px-3 py-2.5 text-sm font-semibold",
                  active ? "bg-accent text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
          <div className="mt-3 flex gap-2 px-3 sm:hidden">
            <Button variant="outline" size="sm" asChild className="flex-1">
              <a href={signInHref}>Sign in</a>
            </Button>
            <Button size="sm" asChild className="flex-1">
              <a href={getStartedHref}>Get started</a>
            </Button>
          </div>
        </nav>
      </div>
    </header>
  );
}
