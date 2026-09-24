import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border py-5">
      <div className="rb-container flex flex-col items-start justify-between gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center">
        <p>Prototype — all properties, figures, people and records are fictional.</p>
        <nav aria-label="Legal" className="flex gap-4">
          <Link href="/legal/terms" className="hover:text-foreground hover:underline">
            Terms
          </Link>
          <Link href="/legal/privacy" className="hover:text-foreground hover:underline">
            Privacy
          </Link>
          <Link href="/legal/risk" className="hover:text-foreground hover:underline">
            Risk
          </Link>
        </nav>
      </div>
    </footer>
  );
}
