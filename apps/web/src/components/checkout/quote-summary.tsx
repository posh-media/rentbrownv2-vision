import { DataRow, Divider, MoneyFigure } from "@rentbrown/ui";
import type { InvestmentQuote, Opportunity } from "@rentbrown/types";
import { formatBps, formatDate, formatDateTime, formatDuration, formatMoney } from "@rentbrown/utils";

export function QuoteSummary({
  opportunity,
  quote,
  children,
}: {
  opportunity: Opportunity;
  quote: InvestmentQuote;
  children?: React.ReactNode;
}) {
  return (
    <div className="financial-card p-6">
      <p className="eyebrow text-secondary">{opportunity.plan.name}</p>
      <h2 className="mt-1 text-lg font-extrabold text-foreground">
        {opportunity.property.name} · Round {opportunity.round.roundNumber}
      </h2>
      <div className="mt-4">
        <DataRow label="Slots" value={quote.slots} />
        <DataRow label="Slot price" value={formatMoney(quote.slotPrice, quote.currency)} />
        <DataRow label="Principal" value={formatMoney(quote.principal, quote.currency)} strong />
        <DataRow
          label="Expected profit"
          value={formatMoney(quote.expectedProfit, quote.currency)}
          hint={`${formatBps(quote.roiBps)} full term`}
        />
        <DataRow
          label="Maturity value"
          value={<MoneyFigure amount={quote.maturityValue} currency={quote.currency} size="sm" tone="success" />}
          strong
          tone="success"
        />
        <Divider className="my-2" />
        <DataRow label="Duration" value={formatDuration(quote.duration)} />
        <DataRow label="Projected start" value={formatDate(quote.projectedStartAt)} />
        <DataRow label="Projected maturity" value={formatDate(quote.projectedMaturityAt)} />
        <DataRow label="Fees" value={quote.fees === 0 ? "None" : formatMoney(quote.fees, quote.currency)} />
      </div>
      <p className="mt-3 text-[11px] text-tertiary">Quote valid until {formatDateTime(quote.expiresAt)}</p>
      {children}
    </div>
  );
}
