import Link from "next/link";
import Image from "next/image";
import { MoneyFigure, ProgressBar, StatusPill, cn } from "@rentbrown/ui";
import type { Investment } from "@rentbrown/types";
import { formatDate, pluralize } from "@rentbrown/utils";

import { propertyImage } from "../../lib/images";
import { labelFor, toneFor } from "../../lib/status";

function metaLine(inv: Investment): string {
  if (inv.status === "COMPLETED" && inv.completedAt) return `Completed ${formatDate(inv.completedAt)}`;
  if (inv.status === "PAYMENT_PENDING") return "Awaiting payment";
  if (inv.activatedAt && inv.maturesAt) return `Activated ${formatDate(inv.activatedAt)} · Matures ${formatDate(inv.maturesAt)}`;
  if (inv.maturesAt) return `Matures ${formatDate(inv.maturesAt)}`;
  return "";
}

export function InvestmentCard({ investment: inv }: { investment: Investment }) {
  const completed = inv.status === "COMPLETED";
  return (
    <Link
      href={`/portfolio/${inv.id}`}
      className="financial-card grid gap-4 p-4 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 sm:grid-cols-[7rem_1fr_auto] sm:items-center sm:p-5"
    >
      <Image
        src={propertyImage(inv.propertyImage)}
        alt={`${inv.propertyName}, fictional property`}
        width={112}
        height={84}
        className="aspect-[4/3] w-full rounded-md object-cover sm:w-28"
      />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-bold text-foreground">{inv.propertyName}</span>
          <StatusPill tone={toneFor(inv.status)} className="shrink-0">
            {labelFor(inv.status)}
          </StatusPill>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {inv.planName} · {pluralize(inv.slots, "slot")}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{metaLine(inv)}</p>
        {!completed ? (
          <div className="mt-2.5 flex items-center gap-2">
            <ProgressBar
              value={inv.termProgressPct}
              size="sm"
              tone={inv.status === "PAYMENT_PENDING" ? "warning" : "success"}
              className="max-w-48"
              label="Term progress"
            />
            <span className="text-[11px] text-tertiary">
              {inv.termProgressPct}% of term
              {inv.daysRemaining !== null ? ` · ${inv.daysRemaining} days left` : ""}
            </span>
          </div>
        ) : null}
      </div>
      <div className={cn("grid grid-cols-2 gap-4 sm:grid-cols-1 sm:gap-3 sm:text-right")}>
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground">Principal</p>
          <MoneyFigure amount={inv.principal} currency={inv.currency} size="sm" className="mt-0.5" />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground">
            {completed ? "Settled value" : "Maturity value"}
          </p>
          <MoneyFigure amount={inv.maturityValue} currency={inv.currency} size="sm" className="mt-0.5" />
          {completed && inv.settlement ? (
            <p className="mt-0.5 text-[10px] text-tertiary">credited {formatDate(inv.settlement.creditedAt)}</p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
