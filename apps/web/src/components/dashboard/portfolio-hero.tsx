import { MoneyFigure } from "@rentbrown/ui";
import type { DashboardSummary } from "@rentbrown/types";
import { formatDateTime } from "@rentbrown/utils";

export function PortfolioHero({ summary }: { summary: DashboardSummary }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-primary p-6 text-primary-foreground lg:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full opacity-30"
        style={{ background: "radial-gradient(circle, var(--secondary) 0%, transparent 70%)" }}
      />
      <div className="relative grid gap-8 lg:grid-cols-[1.2fr_.8fr] lg:items-center">
        <div>
          <p className="eyebrow text-primary-foreground/70">Total portfolio value</p>
          <MoneyFigure
            amount={summary.totalPortfolioValue}
            currency={summary.currency}
            size="xl"
            tone="inverse"
            className="mt-3"
          />
          <p className="mt-3 text-xs text-primary-foreground/70">
            Active principal + wallet balances · as of {formatDateTime(summary.asOf)}
          </p>
        </div>
        <div className="glass-dark rounded-lg p-5">
          {[
            { label: "Active principal", value: summary.activePrincipal },
            { label: "Expected profit (active)", value: summary.expectedProfitActive },
            { label: "Projected at maturity", value: summary.projectedMaturityValueActive },
          ].map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4 py-2">
              <span className="text-sm text-primary-foreground/70">{row.label}</span>
              <MoneyFigure amount={row.value} currency={summary.currency} size="sm" tone="inverse" />
            </div>
          ))}
          <p className="pt-2 text-[11px] text-primary-foreground/60">Expected figures are not guaranteed.</p>
        </div>
      </div>
    </div>
  );
}
