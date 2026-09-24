import Link from "next/link";

import { cn } from "@rentbrown/ui";

export function Brand({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2.5", className)} aria-label="RentBrown home">
      <span className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-extrabold text-primary-foreground">
        RB
      </span>
      <span className="text-lg font-extrabold tracking-tight text-foreground">RentBrown</span>
    </Link>
  );
}
