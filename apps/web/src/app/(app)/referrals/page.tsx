"use client";

import { Button, EmptyState, MoneyFigure, StatCard, StatePanel } from "@rentbrown/ui";
import { Gift } from "lucide-react";

import { useReferralSummary, useReferrals } from "../../../lib/data/hooks";
import { useRequireSession } from "../../../lib/session";
import { PageHeader } from "../../../components/layout/page-header";
import { PageSkeleton } from "../../../components/layout/page-skeleton";
import { Section } from "../../../components/layout/section";
import { ReferralCodeCard } from "../../../components/referrals/referral-code-card";
import { ReferralPolicyCard } from "../../../components/referrals/referral-policy-card";
import { ReferralRow } from "../../../components/referrals/referral-row";

export default function ReferralsPage() {
  const session = useRequireSession();
  const summary = useReferralSummary();
  const referrals = useReferrals();

  if (session.isPending || summary.isPending || referrals.isPending) return <PageSkeleton />;

  if (summary.isError || referrals.isError) {
    const err = summary.error ?? referrals.error;
    return (
      <StatePanel
        tone="error"
        title="We couldn't load referrals"
        copy={err?.message}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void summary.refetch();
              void referrals.refetch();
            }}
          >
            Retry
          </Button>
        }
      />
    );
  }

  const s = summary.data;
  const items = referrals.data ?? [];
  const recent = items.slice(0, 5);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Referrals"
        copy="Invite people you know. Rewards qualify only after a referred investor completes the stated requirements."
      />

      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard
          label="People referred"
          value={<span className="tabular text-[1.375rem] font-extrabold text-foreground">{s.referredCount}</span>}
        />
        <StatCard
          label="Rewards credited"
          value={<MoneyFigure amount={s.earnedRewards} currency={s.currency} size="md" />}
          emphasis
        />
        <StatCard
          label="Pending rewards"
          value={<MoneyFigure amount={s.pendingRewards} currency={s.currency} size="md" />}
          note="Credited when requirements complete"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
        <div className="flex flex-col gap-6">
          <ReferralCodeCard summary={s} />
          <ReferralPolicyCard policy={s.policy} />
        </div>

        <Section title="Recent referrals" actionHref="/referrals/history" actionLabel="View full history">
          {recent.length === 0 ? (
            <EmptyState
              icon={<Gift />}
              title="No referrals yet"
              copy="Share your code — qualified rewards appear here."
            />
          ) : (
            <div className="financial-card divide-y divide-border overflow-hidden">
              {recent.map((r) => (
                <ReferralRow key={r.id} referral={r} />
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
