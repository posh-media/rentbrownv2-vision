import Link from "next/link";
import Image from "next/image";
import { MapPin } from "lucide-react";
import { MoneyFigure, ProgressBar, Skeleton, cn } from "@rentbrown/ui";
import type { Opportunity } from "@rentbrown/types";
import {
  formatBps,
  formatDate,
  formatDurationShort,
  pluralize,
} from "@rentbrown/utils";

import { propertyImage } from "../../lib/images";
import { labelFor } from "../../lib/status";

export function OpportunityCard({ opportunity, compact = false }: { opportunity: Opportunity; compact?: boolean }) {
  const { property, plan, round, perSlot } = opportunity;
  const soldOut = round.status === "SOLD_OUT";
  const tone = soldOut ? "neutral" : round.allocatedPct >= 80 ? "warning" : "success";

  return (
    <article className="h-full">
      <Link
        href={`/opportunities/${property.slug}`}
        className="financial-card group flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
      >
        <div className="relative">
          <Image
            src={propertyImage(property.images[0] ?? "ikoyi-residences")}
            alt={`${property.name}, fictional property`}
            width={640}
            height={compact ? 360 : 400}
            sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
            className={cn(
              "w-full object-cover",
              compact ? "aspect-[16/9]" : "aspect-[16/10]",
              soldOut && "opacity-90 saturate-50",
            )}
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-foreground/50 via-transparent to-transparent" />
          <span className="glass-dark absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold text-primary-foreground">
            {labelFor(round.status)}
          </span>
          <span
            className="glass absolute bottom-3 right-3 rounded-full px-2.5 py-1 text-[11px] font-bold text-foreground"
            aria-label="return · term"
          >
            {formatBps(plan.roiBps)} · {formatDurationShort(plan.duration)}
          </span>
        </div>

        <div className="flex flex-1 flex-col p-5">
          <p className="eyebrow text-secondary">{plan.name}</p>
          <h3 className="mt-1 truncate text-lg font-extrabold text-foreground">{property.name}</h3>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3.5" aria-hidden /> {property.location.label}
          </p>

          {compact ? (
            <div className="mt-4 grid grid-cols-2 gap-3 border-y border-border py-3">
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground">Slot price</p>
                <MoneyFigure amount={perSlot.principal} currency={plan.currency} size="xs" className="mt-1" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground">Min slots</p>
                <p className="tabular mt-1 text-[0.8125rem] font-bold text-foreground">{plan.minSlots}</p>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-3 gap-3 border-y border-border py-4">
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground">Slot price</p>
                <MoneyFigure amount={perSlot.principal} currency={plan.currency} size="xs" className="mt-1" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground">Expected return</p>
                <p className="tabular mt-1 text-[0.8125rem] font-bold text-foreground">{formatBps(plan.roiBps)}</p>
                <p className="text-[10px] text-tertiary">full term</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground">Duration</p>
                <p className="tabular mt-1 text-[0.8125rem] font-bold text-foreground">
                  {formatDurationShort(plan.duration)}
                </p>
              </div>
            </div>
          )}

          <div className="mt-4">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-semibold text-muted-foreground">Capacity allocated</span>
              <span className="tabular font-bold text-foreground">{round.allocatedPct}%</span>
            </div>
            <ProgressBar value={round.allocatedPct} tone={tone} size="sm" className="mt-2" label="Capacity allocated" />
            <p className="mt-2 text-xs text-muted-foreground">
              {soldOut
                ? "Fully subscribed"
                : round.status === "SCHEDULED"
                  ? `Opens ${formatDate(round.opensAt)}`
                  : `${pluralize(round.availableSlots, "slot")} available · min ${plan.minSlots}`}
            </p>
          </div>

          {!compact ? (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Projected maturity {formatDate(round.projectedMaturityAt)}
              </span>
              <span className="text-sm font-extrabold text-primary">View terms →</span>
            </div>
          ) : null}
        </div>
      </Link>
    </article>
  );
}

export function OpportunityCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="financial-card h-full overflow-hidden" aria-hidden>
      <Skeleton className={cn("w-full rounded-none", compact ? "aspect-[16/9]" : "aspect-[16/10]")} />
      <div className="p-5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-2 h-5 w-3/4" />
        <Skeleton className="mt-2 h-3 w-1/2" />
        {!compact ? <Skeleton className="mt-4 h-16 w-full" /> : null}
        <Skeleton className="mt-4 h-1.5 w-full" />
        <Skeleton className="mt-2 h-3 w-2/3" />
      </div>
    </div>
  );
}
