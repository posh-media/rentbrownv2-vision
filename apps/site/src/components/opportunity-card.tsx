import Link from "next/link";
import Image from "next/image";
import { MapPin } from "lucide-react";
import { ProgressBar, cn } from "@rentbrown/ui";
import type { Opportunity } from "@rentbrown/types";
import { formatBps, formatDate, formatDurationShort, formatMoney, pluralize, ROUND_STATUS } from "@rentbrown/utils";

import { propertyImage } from "../lib/site";

/**
 * Editorial opportunity card for the marketing site — public surface, so it
 * links to /explore/[slug] rather than the app's /opportunities routes.
 */
export function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  const { property, plan, round, perSlot } = opportunity;
  const status = ROUND_STATUS[round.status];
  const soldOut = round.status === "SOLD_OUT";
  const tone = soldOut ? "neutral" : round.allocatedPct >= 80 ? "warning" : "success";

  return (
    <article className="h-full">
      <Link
        href={`/explore/${property.slug}`}
        className="financial-card group flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
      >
        <div className="relative">
          <Image
            src={propertyImage(property.images[0] ?? "ikoyi-residences")}
            alt={`${property.name}, ${property.location.label} — fictional property`}
            width={640}
            height={400}
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className={cn("aspect-[16/10] w-full object-cover", soldOut && "opacity-90 saturate-50")}
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-foreground/50 via-transparent to-transparent" />
          <span className="glass-dark absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold">
            {status.label}
          </span>
          <span className="glass absolute bottom-3 right-3 rounded-full px-2.5 py-1 text-[11px] font-bold text-foreground">
            {formatBps(plan.roiBps)} expected · {formatDurationShort(plan.duration)}
          </span>
        </div>

        <div className="flex flex-1 flex-col p-5">
          <p className="eyebrow text-secondary">{plan.name}</p>
          <h3 className="mt-1.5 font-display text-xl tracking-tight text-foreground">{property.name}</h3>
          <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3.5" aria-hidden /> {property.location.label}
          </p>

          <div className="mt-4 grid grid-cols-3 gap-3 border-y border-border py-4">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground">Slot price</p>
              <p className="tabular mt-1 text-[0.8125rem] font-bold text-foreground">
                {formatMoney(perSlot.principal, plan.currency)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground">Expected</p>
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
                  : `${pluralize(round.availableSlots, "slot")} available`}
            </p>
          </div>

          <div className="mt-auto pt-4">
            <span className="text-sm font-extrabold text-primary group-hover:underline">View opportunity →</span>
          </div>
        </div>
      </Link>
    </article>
  );
}
