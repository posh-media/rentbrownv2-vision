import { useRouter } from "expo-router";
import {
  Bell,
  Building2,
  CircleAlert,
  Gift,
  Megaphone,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react-native";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MOCK_NOW } from "@rentbrown/mock-data";
import { formatListDate, humanizeStatus } from "@rentbrown/utils";
import type { Notification, NotificationLink } from "@rentbrown/types";

import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "../../src/data/hooks";
import { t } from "../../src/theme";
import {
  Body,
  BodySm,
  Caption,
  EmptyState,
  IconCircle,
  SegmentedControl,
  SkeletonCard,
} from "../../src/ui";

const ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  INVESTMENTS: Building2,
  MONEY: Wallet,
  KYC: ShieldCheck,
  REFERRALS: Gift,
  SECURITY: CircleAlert,
  ANNOUNCEMENTS: Megaphone,
};

const CATS = ["ALL", "INVESTMENTS", "MONEY", "KYC", "REFERRALS", "SECURITY", "ANNOUNCEMENTS"] as const;

function linkHref(link?: NotificationLink): string | null {
  if (!link) return null;
  switch (link.kind) {
    case "investment": return `/(tabs)/portfolio/${link.id}`;
    case "withdrawal": return `/(tabs)/wallet/withdrawals/${link.id}`;
    case "wallet": return "/(tabs)/wallet";
    case "opportunity": return `/(tabs)/explore/${link.slug}`;
    case "referrals": return "/(tabs)/account/referrals";
    case "kyc": return "/(tabs)/account/kyc";
    case "security": return "/(tabs)/account/security";
  }
}

function groupOf(n: Notification): string {
  const day = new Date(n.createdAt).toDateString();
  const today = new Date(MOCK_NOW).toDateString();
  const yesterday = new Date(new Date(MOCK_NOW).getTime() - 864e5).toDateString();
  return day === today ? "Today" : day === yesterday ? "Yesterday" : "Earlier";
}

export default function Notifications() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const notifications = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const [cat, setCat] = React.useState<(typeof CATS)[number]>("ALL");

  const list = (notifications.data ?? []).filter((n) => cat === "ALL" || n.category === cat);
  const groups = ["Today", "Yesterday", "Earlier"].map((g) => ({
    title: g,
    items: list.filter((n) => groupOf(n) === g),
  }));

  return (
    <View style={{ flex: 1, backgroundColor: t.bg.canvas, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 16 }}>
        <Body style={{ flex: 1, fontWeight: "800" }}>Notifications</Body>
        <Pressable accessibilityRole="button" accessibilityLabel="Mark all as read" onPress={() => markAll.mutate()} hitSlop={8}>
          <Caption tone="brand">Mark all read</Caption>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} hitSlop={8} style={{ marginLeft: 14 }}>
          <X size={20} color={t.text.primary} />
        </Pressable>
      </View>
      <View style={{ paddingHorizontal: 16 }}>
        <SegmentedControl options={CATS.map((c) => ({ value: c, label: c === "ALL" ? "All" : humanizeStatus(c) }))} value={cat} onChange={setCat} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: insets.bottom + 30 }}>
        {notifications.isLoading ? (
          <SkeletonCard lines={4} />
        ) : list.length === 0 ? (
          <EmptyState icon={<Bell size={28} color={t.text.tertiary} />} title="You're all caught up" />
        ) : (
          groups.map(
            (g) =>
              g.items.length > 0 && (
                <View key={g.title} style={{ gap: 2 }}>
                  <Caption tone="muted" style={{ paddingVertical: 6 }}>
                    {g.title}
                  </Caption>
                  {g.items.map((n) => {
                    const Icon = ICONS[n.category] ?? Bell;
                    return (
                      <Pressable
                        key={n.id}
                        accessibilityRole="button"
                        accessibilityLabel={n.title}
                        onPress={() => {
                          if (!n.read) markRead.mutate(n.id);
                          const href = linkHref(n.link);
                          if (href) {
                            router.back();
                            setTimeout(() => router.push(href as never), 60);
                          }
                        }}
                        style={({ pressed }) => ({
                          flexDirection: "row",
                          gap: 12,
                          padding: 12,
                          borderRadius: 14,
                          backgroundColor: n.read ? "transparent" : t.bg.surface,
                          borderWidth: n.read ? 0 : 1,
                          borderColor: t.border.default,
                          opacity: pressed ? 0.8 : 1,
                        })}
                      >
                        {!n.read ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.action.primary, marginTop: 8 }} /> : <View style={{ width: 8 }} />}
                        <IconCircle size={36} tone={n.read ? "neutral" : "brand"}>
                          <Icon size={16} color={n.read ? t.text.tertiary : t.text.brand} />
                        </IconCircle>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Body numberOfLines={1} style={{ fontWeight: n.read ? "600" : "800" }}>
                            {n.title}
                          </Body>
                          <BodySm tone="muted" numberOfLines={2}>
                            {n.body}
                          </BodySm>
                          <Caption tone="muted">{formatListDate(n.createdAt, MOCK_NOW)}</Caption>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ),
          )
        )}
      </ScrollView>
    </View>
  );
}
