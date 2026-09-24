"use client";

import Link from "next/link";
import {
  Button,
  EmptyState,
  MoneyFigure,
  SkeletonCard,
  StatePanel,
  StatCard,
} from "@rentbrown/ui";
import { Building2 } from "lucide-react";
import {
  formatDate,
  formatDayHeading,
  formatDaysRemaining,
  formatListDate,
  formatMoney,
  formatMoneySigned,
} from "@rentbrown/utils";

import {
  useDashboard,
  useInvestments,
  useKyc,
  useOpportunities,
  useReferralSummary,
  useTransactions,
} from "../../../lib/data/hooks";
import { useRequireSession } from "../../../lib/session";
import { PageHeader } from "../../../components/layout/page-header";
import { Section } from "../../../components/layout/section";
import { PortfolioHero } from "../../../components/dashboard/portfolio-hero";
import { PendingActionCard } from "../../../components/dashboard/pending-action-card";
import { KycStatusCard } from "../../../components/dashboard/kyc-status-card";
import { ReferralSummaryCard } from "../../../components/dashboard/referral-summary-card";
import { InvestmentRow } from "../../../components/investments/investment-row";
import { OpportunityGrid } from "../../../components/opportunities/opportunity-grid";

function greeting(asOf: string): string {
  const hour = (new Date(asOf).getUTCHours() + 1) % 24; // Africa/Lagos (UTC+1)
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export default function DashboardPage() {
  const session = useRequireSession();
  const dashboard = useDashboard();
  const investments = useInvestments({ status: "ACTIVE" });
  const kyc = useKyc();
  const referrals = useReferralSummary();
  const transactions = useTransactions();
  const featured = useOpportunities();

  if (session.isPending || dashboard.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <SkeletonCard className="h-48" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.45fr_.55fr]">
          <SkeletonCard className="h-64" />
          <SkeletonCard className="h-64" />
        </div>
      </div>
    );
  }

  if (dashboard.isError) {
    return (
      <StatePanel
        tone="error"
        title="We couldn't load your dashboard"
        copy={dashboard.error.message}
        action={
          <Button variant="outline" size="sm" onClick={() => dashboard.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const d = dashboard.data;
  const activeInvestments = investments.data ?? [];
  const featuredOpps = (featured.data ?? []).filter((o) =>
    d.featuredOpportunitySlugs.includes(o.property.slug),
  );
  const recentTx = (transactions.data ?? []).slice(0, 3);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={formatDayHeading(d.asOf)}
        title={`Good ${greeting(d.asOf)}, ${d.greetingName}`}
        copy="Here's a clear view of your investments and available funds."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/wallet/deposit">Deposit</Link>
            </Button>
            <Button asChild>
              <Link href="/explore">Explore investments</Link>
            </Button>
          </>
        }
      />

      <PortfolioHero summary={d} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Wallet available"
          value={
            <>
              <MoneyFigure amount={d.wallet.available} currency={d.currency} size="sm" className="sm:hidden" />
              <MoneyFigure amount={d.wallet.available} currency={d.currency} size="md" className="hidden sm:block" />
            </>
          }
          note="Ready to invest or withdraw"
          href="/wallet"
        />
        <StatCard
          label="Next maturity"
          value={
            <span className="tabular text-base font-extrabold leading-[1.375rem] text-foreground sm:text-[1.375rem] sm:leading-[1.75rem]">
              {d.nextMaturity ? formatDaysRemaining(d.nextMaturity.daysRemaining) : "—"}
            </span>
          }
          note={
            d.nextMaturity
              ? `${d.nextMaturity.propertyName} · ${formatDate(d.nextMaturity.maturesAt)} · ${formatMoney(d.nextMaturity.maturityValue, d.currency)}`
              : "No upcoming maturity"
          }
          href={d.nextMaturity ? `/portfolio/${d.nextMaturity.investmentId}` : undefined}
        />
        <StatCard
          label="Active investments"
          value={
            <span className="tabular text-base font-extrabold leading-[1.375rem] text-foreground sm:text-[1.375rem] sm:leading-[1.75rem]">
              {d.activeInvestmentCount}
            </span>
          }
          note={`Realised profit to date ${formatMoney(d.realisedProfitLifetime, d.currency)}`}
        />
        <StatCard
          label="Referral rewards"
          value={
            <>
              <MoneyFigure amount={d.referral.earned} currency={d.currency} size="sm" className="sm:hidden" />
              <MoneyFigure amount={d.referral.earned} currency={d.currency} size="md" className="hidden sm:block" />
            </>
          }
          note={`${formatMoney(d.referral.pending, d.currency)} pending`}
          href="/referrals"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.45fr_.55fr]">
        <div className="flex min-w-0 flex-col gap-8">
          <Section title="Active investments" actionHref="/portfolio" actionLabel="View all">
            {investments.isPending ? (
              <SkeletonCard />
            ) : activeInvestments.length === 0 ? (
              <EmptyState
                icon={<Building2 />}
                title="No investments yet"
                copy="Open rounds appear in Explore with slot price, expected return and proof documents shown separately."
                action={
                  <Button asChild>
                    <Link href="/explore">Explore opportunities</Link>
                  </Button>
                }
              />
            ) : (
              <div className="financial-card divide-y divide-border overflow-hidden">
                {activeInvestments.map((i) => (
                  <InvestmentRow key={i.id} investment={i} />
                ))}
              </div>
            )}
            {activeInvestments
              .filter((i) => i.status === "PAYMENT_PENDING")
              .map((i) => (
                <p key={i.id} className="text-xs text-muted-foreground">
                  {i.propertyName}:{" "}
                  <Link href={`/payment/${i.reference}`} className="font-bold text-primary hover:underline">
                    Complete payment
                  </Link>{" "}
                  to confirm your slots.
                </p>
              ))}
          </Section>

          <Section title="Featured opportunities" actionHref="/explore" actionLabel="See all">
            <OpportunityGrid opportunities={featuredOpps} compact />
          </Section>
        </div>

        <aside className="flex min-w-0 flex-col gap-8">
          <Section title="Needs your attention">
            {d.pendingActions.length === 0 ? (
              <StatePanel tone="success" title="You're all caught up" copy="Nothing needs action right now." />
            ) : (
              <div className="flex flex-col gap-2.5">
                {d.pendingActions.map((a) => (
                  <PendingActionCard key={a.id} action={a} />
                ))}
              </div>
            )}
          </Section>

          {kyc.data ? <KycStatusCard kyc={kyc.data} /> : null}
          {referrals.data ? <ReferralSummaryCard summary={referrals.data} /> : null}

          <Section title="Recent activity" actionHref="/wallet" actionLabel="View wallet">
            <div className="financial-card divide-y divide-border">
              {recentTx.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                recentTx.map((t) => (
                  <div key={t.id} className="flex items-baseline justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{t.title}</p>
                      <p className="text-[11px] text-tertiary">{formatListDate(t.occurredAt, d.asOf)}</p>
                    </div>
                    <span
                      className={`tabular shrink-0 text-sm font-bold ${
                        t.direction === "CREDIT" ? "text-[var(--success-fg)]" : "text-foreground"
                      }`}
                    >
                      {formatMoneySigned(t.direction === "CREDIT" ? t.amount : -t.amount, t.currency)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Section>
        </aside>
      </div>
    </div>
  );
}
