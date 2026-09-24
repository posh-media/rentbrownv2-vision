import { LinearGradient } from "expo-linear-gradient";
import { Info } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";
import type { WalletSummary } from "@rentbrown/types";

import { radius, t } from "../theme";
import { Body, BodySm, BottomSheet, Eyebrow, GlassSurface, MoneyFigure } from "../ui";

const EXPLAINERS: Record<string, string> = {
  RESERVED: "Committed to an in-flight request, e.g. a withdrawal under review.",
  BONUS: "Qualified referral rewards. Invest or transfer to available.",
  PENDING: "Incoming funds awaiting bank confirmation.",
};

export function WalletBalanceCard({ wallet }: { wallet: WalletSummary }) {
  const [explain, setExplain] = React.useState<string | null>(null);
  const rows: Array<{ key: "RESERVED" | "BONUS" | "PENDING"; label: string }> = [
    { key: "RESERVED", label: "Reserved" },
    { key: "BONUS", label: "Bonus" },
    { key: "PENDING", label: "Pending" },
  ];
  return (
    <LinearGradient
      colors={[t.bg.surface, "#F6EBE2"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: radius.xl, borderWidth: 1, borderColor: t.border.default, padding: 18, gap: 14 }}
    >
      <Eyebrow tone="muted">Available balance</Eyebrow>
      <MoneyFigure minor={wallet.balances.AVAILABLE} currency={wallet.currency} size="xl" />
      <BodySm tone="muted">Ready to invest or withdraw</BodySm>
      <GlassSurface intensity={40} radius={radius.lg} style={{ padding: 14, gap: 8 }}>
        {rows.map((r) => (
          <View key={r.key} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <BodySm tone="muted">{r.label}</BodySm>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`About ${r.label.toLowerCase()} balance`}
                hitSlop={8}
                onPress={() => setExplain(r.key)}
              >
                <Info size={13} color={t.text.tertiary} />
              </Pressable>
            </View>
            <MoneyFigure minor={wallet.balances[r.key]} currency={wallet.currency} size="sm" />
          </View>
        ))}
        <View style={{ height: 1, backgroundColor: t.border.default }} />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Body style={{ fontWeight: "800" }}>Total in wallet</Body>
          <MoneyFigure minor={wallet.total} currency={wallet.currency} size="sm" />
        </View>
      </GlassSurface>
      <BottomSheet open={!!explain} onClose={() => setExplain(null)}>
        {explain ? (
          <View style={{ gap: 8 }}>
            <Body style={{ fontWeight: "800" }}>{explain.charAt(0) + explain.slice(1).toLowerCase()} balance</Body>
            <BodySm tone="muted">{EXPLAINERS[explain]}</BodySm>
          </View>
        ) : null}
      </BottomSheet>
    </LinearGradient>
  );
}
