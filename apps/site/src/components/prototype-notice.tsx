import { cn } from "@rentbrown/ui";

/** Slim always-visible honesty strip — fictional data notice. */
export function PrototypeNotice({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "rounded-lg border border-pending-border bg-pending-soft px-4 py-2.5 text-xs font-semibold text-[var(--pending-fg)]",
        className,
      )}
    >
      Preview data — all properties, figures and documents are fictional. Expected returns are not guaranteed.
    </p>
  );
}
