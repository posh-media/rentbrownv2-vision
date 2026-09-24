"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  EmptyState,
  MoneyFigure,
  StatCard,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@rentbrown/ui";
import { Building2 } from "lucide-react";
import { formatDate, pluralize } from "@rentbrown/utils";

import { useInvestments } from "../../../lib/data/hooks";
import { useRequireSession } from "../../../lib/session";
import { PageHeader } from "../../../components/layout/page-header";
import { PageSkeleton } from "../../../components/layout/page-skeleton";
import { InvestmentCard } from "../../../components/portfolio/investment-card";

const TABS = [
  { value: "active", label: "Active", filter: "ACTIVE" as const },
  { value: "matured", label: "Matured", filter: "MATURED" as const },
  { value: "all", label: "All", filter: "ALL" as const },
];

export default function PortfolioPage() {
  const session = useRequireSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = TABS.find((t) => t.value === searchParams.get("tab")) ?? TABS[0]!;
  const investments = useInvestments({ status: tab.filter });
  const allActive = useInvestments({ status: "ACTIVE" });
  const all = useInvestments({ status: "ALL" });

  if (session.isPending || investments.isPending || allActive.isPending) {
    return <PageSkeleton />;
  }

  if (investments.isError) {
    return (
      <div>
        <PageHeader title="Portfolio" />
        <EmptyState
          title="We couldn't load your portfolio"
          copy={investments.error.message}
          action={
            <Button variant="outline" size="sm" onClick={() => investments.refetch()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  const items = investments.data ?? [];
  const active = allActive.data ?? [];
  const everything = all.data ?? [];
  const activePrincipal = active.reduce((s, i) => s + i.principal, 0);
  const expectedProfit = active.reduce((s, i) => s + i.expectedProfit, 0);
  const nextMaturity = active
    .filter((i) => i.maturesAt)
    .sort((a, b) => a.maturesAt!.localeCompare(b.maturesAt!))[0];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Portfolio"
        copy="Track principal, expected profit and maturity without mixing them together."
        actions={
          <Button asChild>
            <Link href="/explore">Explore investments</Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard
          label="Active principal"
          value={<MoneyFigure amount={activePrincipal} currency="NGN" size="md" />}
          note={`Across ${pluralize(active.length, "active investment")}`}
        />
        <StatCard
          label="Expected profit (active)"
          value={<MoneyFigure amount={expectedProfit} currency="NGN" size="md" />}
          note="Expected, not guaranteed"
        />
        <StatCard
          label="Projected at maturity"
          value={<MoneyFigure amount={activePrincipal + expectedProfit} currency="NGN" size="md" />}
          note="Expected, not guaranteed"
          emphasis
        />
      </div>

      <Tabs
        value={tab.value}
        onValueChange={(v) => router.replace(`/portfolio?tab=${v}`)}
      >
        <TabsList aria-label="Portfolio filter">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {items.length === 0 ? (
        tab.value === "matured" ? (
          <EmptyState
            icon={<Building2 />}
            title="Nothing has matured yet"
            copy={
              nextMaturity?.maturesAt
                ? `Your first maturity is ${formatDate(nextMaturity.maturesAt)} — ${nextMaturity.propertyName}.`
                : "Matured investments will appear here."
            }
          />
        ) : (
          <EmptyState
            icon={<Building2 />}
            title={everything.length === 0 ? "No investments yet" : "No active investments"}
            copy="Open rounds appear in Explore with slot price, expected return and proof documents shown separately."
            action={
              <Button asChild>
                <Link href="/explore">Explore opportunities</Link>
              </Button>
            }
          />
        )
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((i) => (
            <InvestmentCard key={i.id} investment={i} />
          ))}
        </div>
      )}
    </div>
  );
}
