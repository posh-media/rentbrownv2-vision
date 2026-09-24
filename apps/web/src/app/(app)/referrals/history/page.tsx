"use client";

import * as React from "react";
import Link from "next/link";
import { Button, EmptyState, StatePanel, cn } from "@rentbrown/ui";
import { Gift } from "lucide-react";
import type { ReferralStatus } from "@rentbrown/types";

import { useReferrals } from "../../../../lib/data/hooks";
import { useRequireSession } from "../../../../lib/session";
import { PageHeader } from "../../../../components/layout/page-header";
import { PageSkeleton } from "../../../../components/layout/page-skeleton";
import { ReferralRow } from "../../../../components/referrals/referral-row";

const FILTERS: Array<{ value: ReferralStatus | "ALL"; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "JOINED", label: "Joined" },
  { value: "PENDING", label: "Pending" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "CREDITED", label: "Credited" },
  { value: "DISQUALIFIED", label: "Disqualified" },
];

export default function ReferralHistoryPage() {
  const session = useRequireSession();
  const referrals = useReferrals();
  const [filter, setFilter] = React.useState<ReferralStatus | "ALL">("ALL");

  if (session.isPending || referrals.isPending) return <PageSkeleton />;

  if (referrals.isError) {
    return (
      <StatePanel
        tone="error"
        title="We couldn't load referral history"
        copy={referrals.error.message}
        action={
          <Button variant="outline" size="sm" onClick={() => referrals.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const all = referrals.data ?? [];
  const items = filter === "ALL" ? all : all.filter((r) => r.status === filter);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Referral history"
        copy="Everyone who joined with your code and where their reward stands."
        actions={
          <Button variant="outline" asChild>
            <Link href="/referrals">Back to referrals</Link>
          </Button>
        }
      />

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "min-h-9 rounded-full border px-3.5 text-xs font-bold",
              filter === f.value
                ? "border-primary bg-accent text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Gift />}
          title={all.length === 0 ? "No referrals yet" : "No referrals in this state"}
          copy={all.length === 0 ? "Share your code — qualified rewards appear here." : "Try a different filter."}
        />
      ) : (
        <div className="financial-card divide-y divide-border overflow-hidden">
          {items.map((r) => (
            <ReferralRow key={r.id} referral={r} />
          ))}
        </div>
      )}
    </div>
  );
}
