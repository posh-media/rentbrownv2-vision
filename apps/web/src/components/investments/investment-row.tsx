import Link from "next/link";
import Image from "next/image";
import { MoneyFigure, ProgressBar, StatusPill } from "@rentbrown/ui";
import type { Investment } from "@rentbrown/types";
import { formatDate, formatMoney } from "@rentbrown/utils";

import { propertyImage } from "../../lib/images";
import { labelFor, toneFor } from "../../lib/status";

export function InvestmentRow({ investment }: { investment: Investment }) {
  const pending = investment.status === "PAYMENT_PENDING";
  return (
    <Link
      href={`/portfolio/${investment.id}`}
      className="flex items-start gap-3 px-4 py-4 transition-colors hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-ring sm:items-center sm:gap-4 sm:px-5"
    >
      <Image
        src={propertyImage(investment.propertyImage)}
        alt={`${investment.propertyName}, fictional property`}
        width={56}
        height={56}
        className="size-11 shrink-0 rounded-md object-cover sm:size-14"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-bold text-foreground">{investment.propertyName}</span>
          <StatusPill tone={toneFor(investment.status)} className="shrink-0">
            {labelFor(investment.status)}
          </StatusPill>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Principal {formatMoney(investment.principal, investment.currency)} ·{" "}
          {pending ? "Payment pending" : `Matures ${formatDate(investment.maturesAt ?? "")}`}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <ProgressBar
            value={investment.termProgressPct}
            size="sm"
            tone={pending ? "warning" : "success"}
            className="max-w-40"
            label="Term progress"
          />
          <span className="text-[11px] text-tertiary">{investment.termProgressPct}% of term</span>
        </div>
        <div className="mt-2 sm:hidden">
          <MoneyFigure amount={investment.maturityValue} currency={investment.currency} size="sm" />
          <p className="mt-0.5 text-[11px] text-tertiary">
            {pending ? "Maturity value if confirmed" : "Maturity value"}
          </p>
        </div>
      </div>
      <div className="hidden shrink-0 text-right sm:block">
        <MoneyFigure amount={investment.maturityValue} currency={investment.currency} size="sm" />
        <p className="mt-0.5 text-[11px] text-tertiary">
          {pending ? "Maturity value if confirmed" : "Maturity value"}
        </p>
      </div>
    </Link>
  );
}
