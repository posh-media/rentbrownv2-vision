import Link from "next/link";
import { siteContent } from "@rentbrown/mock-data";

export function SiteFooter() {
  const { tagline, disclaimer, columns } = siteContent.siteFooter;
  return (
    <footer className="band-inverse mt-24">
      <div className="rb-container py-14">
        <div className="grid gap-10 md:grid-cols-[1.2fr_2fr]">
          <div>
            <Link href="/" className="flex items-center gap-2.5" aria-label="RentBrown home">
              <span className="flex size-8 items-center justify-center rounded-md bg-primary-foreground/15 font-display text-sm text-primary-foreground">
                RB
              </span>
              <span className="text-lg font-extrabold tracking-tight">RentBrown</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm text-primary-foreground/70">{tagline}</p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {columns.map((col) => (
              <div key={col.title}>
                <p className="eyebrow text-primary-foreground/60">{col.title}</p>
                <ul className="mt-3 flex flex-col gap-2">
                  {col.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-primary-foreground/80 underline-offset-4 hover:text-primary-foreground hover:underline"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-12 border-t border-primary-foreground/15 pt-6">
          <p className="max-w-3xl text-xs leading-relaxed text-primary-foreground/60">{disclaimer}</p>
          <p className="mt-4 text-xs text-primary-foreground/50">© 2026 RentBrown — Phase 1 design prototype.</p>
        </div>
      </div>
    </footer>
  );
}
