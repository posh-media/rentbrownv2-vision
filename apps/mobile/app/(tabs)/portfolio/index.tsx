import { useRouter } from "expo-router";
import * as React from "react";
import { View } from "react-native";
import { MOCK_NOW } from "@rentbrown/mock-data";
import { formatDate } from "@rentbrown/utils";

import { InvestmentCard } from "../../../src/components/investment-card";
import { useInvestments } from "../../../src/data/hooks";
import { useSession } from "../../../src/data/provider";
import {
  BodySm,
  Caption,
  EmptyState,
  HeaderBar,
  MoneyFigure,
  Screen,
  SegmentedControl,
  SkeletonCard,
  StatCard,
} from "../../../src/ui";

type Tab = "active" | "matured" | "all";

export default function Portfolio() {
  const router = useRouter();
  const session = useSession();
  const investments = useInvestments();
  const [tab, setTab] = React.useState<Tab>("active");

  if (!session.isLoading && !session.data) {
    return (
      <Screen bottomPad={110}>
        <HeaderBar large title="Portfolio" />
        <EmptyState
          title="Sign in to see your portfolio"
          body="Track principal, expected profit and maturity — kept separate."
          actionLabel="Sign in"
          onAction={() => router.push("/(auth)/login")}
        />
      </Screen>
    );
  }

  const list = investments.data ?? [];
  const active = list.filter((i) => i.status === "ACTIVE" || i.status === "MATURITY_DUE" || i.status === "SETTLING");
  const matured = list.filter((i) => i.status === "COMPLETED");
  const shown = tab === "active" ? active : tab === "matured" ? matured : list;

  const principal = active.reduce((s, i) => s + i.principal, 0);
  const profit = active.reduce((s, i) => s + i.expectedProfit, 0);
  const maturity = active.reduce((s, i) => s + i.maturityValue, 0);
  const nextMaturity = [...active].sort((a, b) => (a.maturesAt ?? "").localeCompare(b.maturesAt ?? ""))[0];

  return (
    <Screen bottomPad={110}>
      <HeaderBar large title="Portfolio" eyebrow="Principal, profit and maturity — kept separate" />
      {investments.isLoading ? (
        <>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <StatCard label="Active principal" style={{ flex: 1 }}>
              <MoneyFigure minor={principal} size="sm" />
            </StatCard>
            <StatCard label="Expected profit" style={{ flex: 1 }}>
              <MoneyFigure minor={profit} size="sm" tone="success" />
            </StatCard>
            <StatCard label="At maturity" emphasis style={{ flex: 1 }}>
              <MoneyFigure minor={maturity} size="sm" tone="inverse" />
            </StatCard>
          </View>
          <Caption tone="muted">Across {active.length} active investments · expected, not guaranteed</Caption>
          <SegmentedControl
            options={[
              { value: "active", label: "Active" },
              { value: "matured", label: "Matured" },
              { value: "all", label: "All" },
            ]}
            value={tab}
            onChange={setTab}
          />
          {shown.length === 0 ? (
            <EmptyState
              title={tab === "matured" ? "Nothing has matured yet" : "No active investments"}
              body={
                tab === "matured" && nextMaturity?.maturesAt
                  ? `Your first maturity is ${formatDate(nextMaturity.maturesAt)}.`
                  : "Explore open rounds to start investing."
              }
              actionLabel={tab !== "matured" ? "Explore investments" : undefined}
              onAction={tab !== "matured" ? () => router.push("/(tabs)/explore") : undefined}
            />
          ) : (
            shown.map((i) => <InvestmentCard key={i.id} investment={i} />)
          )}
          <BodySm tone="muted" center>
            Figures as of {formatDate(MOCK_NOW)}.
          </BodySm>
        </>
      )}
    </Screen>
  );
}
