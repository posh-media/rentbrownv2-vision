import { useRouter } from "expo-router";
import {
  Bell,
  ChevronRight,
  CircleAlert,
  Gift,
  Landmark,
  Plus,
  Wallet as WalletIcon,
} from "lucide-react-native";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { MOCK_NOW } from "@rentbrown/mock-data";
import { formatDate } from "@rentbrown/utils";
import type { NotificationLink } from "@rentbrown/types";

import { InvestmentRow } from "../../../src/components/investment-card";
import { OpportunityCard } from "../../../src/components/opportunity-card";
import { useDashboard, useInvestments, useOpportunities, useProfile } from "../../../src/data/hooks";
import { useSession } from "../../../src/data/provider";
import { t } from "../../../src/theme";
import {
  Avatar,
  Body,
  BodySm,
  Button,
  Caption,
  Card,
  EmptyState,
  Eyebrow,
  GlassSurface,
  HeaderBar,
  H1,
  MoneyFigure,
  RoundIconButton,
  Screen,
  Skeleton,
  SkeletonCard,
  StatePanel,
} from "../../../src/ui";

function linkHref(link?: NotificationLink): string | null {
  if (!link) return null;
  switch (link.kind) {
    case "investment":
      return `/(tabs)/portfolio/${link.id}`;
    case "withdrawal":
      return `/(tabs)/wallet/withdrawals/${link.id}`;
    case "wallet":
      return "/(tabs)/wallet";
    case "opportunity":
      return `/(tabs)/explore/${link.slug}`;
    case "referrals":
      return "/(tabs)/account/referrals";
    case "kyc":
      return "/(tabs)/account/kyc";
    case "security":
      return "/(tabs)/account/security";
  }
}

function GuestHero() {
  const router = useRouter();
  return (
    <Screen bottomPad={110}>
      <HeaderBar large title="Welcome" eyebrow={formatDate(MOCK_NOW, "long")} />
      <Card style={{ gap: 12, alignItems: "center", paddingVertical: 28 }}>
        <H1 center>Sign in to see your portfolio</H1>
        <BodySm tone="muted" center>
          Track principal, expected profit and maturity — kept separate, always.
        </BodySm>
        <View style={{ alignSelf: "stretch", flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button fullWidth label="Sign in" onPress={() => router.push("/(auth)/login")} />
          </View>
          <View style={{ flex: 1 }}>
            <Button fullWidth variant="outline" label="Create account" onPress={() => router.push("/(auth)/signup")} />
          </View>
        </View>
      </Card>
    </Screen>
  );
}

export default function Home() {
  const router = useRouter();
  const session = useSession();
  const profile = useProfile();
  const dashboard = useDashboard();
  const investments = useInvestments();
  const opportunities = useOpportunities();
  const [refreshing, setRefreshing] = React.useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([dashboard.refetch(), investments.refetch(), opportunities.refetch()]);
    setRefreshing(false);
  };

  if (session.isLoading) {
    return (
      <Screen scroll={false} bottomPad={110}>
        <Skeleton height={40} width="60%" />
        <SkeletonCard lines={4} />
        <SkeletonCard lines={3} />
      </Screen>
    );
  }
  if (!session.data) return <GuestHero />;

  const d = dashboard.data;
  const greeting = d ? `Good morning, ${d.greetingName}` : "Good morning";
  const featured = (opportunities.data ?? []).filter((o) => d?.featuredOpportunitySlugs.includes(o.property.slug));

  return (
    <Screen refreshing={refreshing} onRefresh={() => void refresh()} bottomPad={110}>
      <HeaderBar
        large
        title={greeting}
        eyebrow={formatDate(MOCK_NOW, "long")}
        right={
          <View style={{ flexDirection: "row", gap: 8 }}>
            <RoundIconButton label="Notifications" badge={!!d?.unreadNotifications} onPress={() => router.push("/(modals)/notifications")}>
              <Bell size={18} color={t.text.primary} />
            </RoundIconButton>
            <RoundIconButton label="Account" onPress={() => router.push("/(tabs)/account")}>
              <Avatar initials="AO" size={26} />
            </RoundIconButton>
          </View>
        }
      />

      {profile.data?.accountStatus === "RESTRICTED" ? (
        <StatePanel
          tone="warning"
          icon={<CircleAlert size={16} color={t.status.warning.fg} />}
          title="Your account is restricted"
          body="Some actions may be unavailable while our team reviews your account. Contact support if this seems wrong."
        />
      ) : null}

      {dashboard.isLoading ? (
        <>
          <Skeleton height={170} radius={24} />
          <SkeletonCard lines={3} />
        </>
      ) : !d ? (
        <EmptyState title="Couldn't load your dashboard" body="Check your connection and pull to refresh." />
      ) : (
        <>
          {/* Portfolio hero */}
          <View
            style={{
              backgroundColor: t.bg.inverse,
              borderRadius: 24,
              padding: 20,
              gap: 12,
            }}
          >
            <Eyebrow tone="inverse" style={{ opacity: 0.75 }}>
              Total portfolio value
            </Eyebrow>
            <MoneyFigure minor={d.totalPortfolioValue} currency={d.currency} size="xl" tone="inverse" />
            <Caption tone="inverse" style={{ opacity: 0.7 }}>
              Active principal + wallet balances — not a promise of future value
            </Caption>
            <GlassSurface tone="dark" intensity={40} style={{ padding: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                {[
                  { l: "Active principal", v: d.activePrincipal },
                  { l: "Expected profit", v: d.expectedProfitActive },
                  { l: "At maturity", v: d.projectedMaturityValueActive },
                ].map((c) => (
                  <View key={c.l}>
                    <Caption tone="inverse" style={{ opacity: 0.7, fontSize: 10 }}>
                      {c.l}
                    </Caption>
                    <MoneyFigure minor={c.v} currency={d.currency} size="xs" tone="inverse" />
                  </View>
                ))}
              </View>
            </GlassSurface>
          </View>

          {/* Quick actions */}
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            {[
              { l: "Deposit", icon: <Plus size={20} color={t.text.brand} />, href: "/(modals)/deposit" },
              { l: "Invest", icon: <Landmark size={20} color={t.text.brand} />, href: "/(tabs)/explore" },
              { l: "Withdraw", icon: <WalletIcon size={20} color={t.text.brand} />, href: "/(modals)/withdraw" },
              { l: "Referrals", icon: <Gift size={20} color={t.text.brand} />, href: "/(tabs)/account/referrals" },
            ].map((a) => (
              <Pressable
                key={a.l}
                accessibilityRole="button"
                accessibilityLabel={a.l}
                onPress={() => router.push(a.href as never)}
                style={{ alignItems: "center", gap: 6, minWidth: 64 }}
              >
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    backgroundColor: t.action.secondary,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {a.icon}
                </View>
                <Caption tone="muted">{a.l}</Caption>
              </Pressable>
            ))}
          </View>

          {/* Stat carousel */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {[
              { l: "Wallet available", v: d.wallet.available, note: "Ready to invest or withdraw" },
              d.nextMaturity
                ? {
                    l: "Next maturity",
                    v: d.nextMaturity.maturityValue,
                    note: `${d.nextMaturity.daysRemaining} days · ${d.nextMaturity.propertyName}`,
                  }
                : null,
              { l: "Active investments", text: String(d.activeInvestmentCount), note: `${d.openOpportunityCount} open rounds to explore` },
              { l: "Rewards", v: d.referral.earned, note: `${d.referral.pending > 0 ? "pending rewards available" : "invite people you know"}` },
            ]
              .filter(Boolean)
              .map((c, i) => (
                <Card key={i} style={{ width: 170, gap: 6 }}>
                  <Caption tone="muted">{c!.l}</Caption>
                  {"v" in c! && c!.v != null ? (
                    <MoneyFigure minor={c!.v as number} currency={d.currency} size="md" />
                  ) : (
                    <Body style={{ fontSize: 22, fontWeight: "800" }}>{c!.text}</Body>
                  )}
                  <Caption tone="muted">{c!.note}</Caption>
                </Card>
              ))}
          </ScrollView>

          {/* Pending actions */}
          {d.pendingActions.length > 0 ? (
            <View style={{ gap: 8 }}>
              <Eyebrow tone="muted">Needs your attention</Eyebrow>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {d.pendingActions.map((a) => (
                  <Pressable
                    key={a.id}
                    accessibilityRole="button"
                    accessibilityLabel={a.title}
                    onPress={() => {
                      const href = linkHref(a.link);
                      if (href) router.push(href as never);
                    }}
                    style={{
                      width: 250,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: t.border.default,
                      borderLeftWidth: 4,
                      borderLeftColor: t.status[a.tone].dot,
                      backgroundColor: t.bg.surface,
                      padding: 14,
                      gap: 4,
                    }}
                  >
                    <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                      <CircleAlert size={15} color={t.status[a.tone].fg} />
                      <Body style={{ fontWeight: "800", flex: 1 }} numberOfLines={1}>
                        {a.title}
                      </Body>
                    </View>
                    <BodySm tone="muted" numberOfLines={2}>
                      {a.body}
                    </BodySm>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* Active investments */}
          <Card padded={false} style={{ paddingVertical: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingBottom: 4 }}>
              <Body style={{ fontWeight: "800" }}>Active investments</Body>
              <Pressable accessibilityRole="button" accessibilityLabel="View all investments" onPress={() => router.push("/(tabs)/portfolio")} hitSlop={8}>
                <Caption tone="brand">View all</Caption>
              </Pressable>
            </View>
            {(investments.data ?? [])
              .filter((i) => i.status === "ACTIVE")
              .slice(0, 3)
              .map((i) => (
                <View key={i.id} style={{ paddingHorizontal: 14 }}>
                  <InvestmentRow investment={i} />
                </View>
              ))}
            {(investments.data ?? []).filter((i) => i.status === "ACTIVE").length === 0 ? (
              <BodySm tone="muted" style={{ paddingHorizontal: 14, paddingVertical: 8 }}>
                No active investments yet.
              </BodySm>
            ) : null}
          </Card>

          {/* Featured opportunities */}
          {featured.length > 0 ? (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Body style={{ fontWeight: "800" }}>Featured opportunities</Body>
                <Pressable accessibilityRole="button" accessibilityLabel="View all opportunities" onPress={() => router.push("/(tabs)/explore")} hitSlop={8} style={{ flexDirection: "row", alignItems: "center" }}>
                  <Caption tone="brand">View all</Caption>
                  <ChevronRight size={14} color={t.text.brand} />
                </Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {featured.map((o) => (
                  <OpportunityCard key={o.round.id} opportunity={o} width={280} />
                ))}
              </ScrollView>
            </View>
          ) : null}

          <BodySm tone="muted" center>
            Prototype — all properties and figures are fictional.
          </BodySm>
        </>
      )}
    </Screen>
  );
}
