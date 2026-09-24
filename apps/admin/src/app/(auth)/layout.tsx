import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Minimal centered chrome for the admin auth screens — no ops shell. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary text-sm font-extrabold text-primary-foreground">
            RB
          </span>
          <div className="leading-tight">
            <p className="text-sm font-extrabold text-foreground">RentBrown</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Admin · restricted access
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">{children}</div>
        <p className="mt-4 text-center text-[11px] text-tertiary">
          Operations console — authorized staff only.
        </p>
      </div>
    </div>
  );
}
