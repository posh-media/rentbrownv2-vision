import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { INVESTMENT_STATUS, formatDaysRemaining } from "@rentbrown/utils";
import type { Investment } from "@rentbrown/types";
import type { PropertyImageKey } from "@rentbrown/mock-data";

import { propertyImage } from "../lib/images";
import { radius, t } from "../theme";
import { Body, Caption, MoneyFigure, ProgressBar, StatusPill } from "../ui";

/** Full portfolio card (image 72px, name+pill, plan · slots, progress, principal/maturity). */
export function InvestmentCard({ investment }: { investment: Investment }) {
  const router = useRouter();
  const status = INVESTMENT_STATUS[investment.status];
  const pending = investment.status === "PAYMENT_PENDING";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={investment.propertyName}
      onPress={() => router.push(`/(tabs)/portfolio/${investment.id}`)}
      style={styles.card}
    >
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Image
          source={propertyImage(investment.propertyImage as PropertyImageKey)}
          style={{ width: 72, height: 72, borderRadius: radius.md, backgroundColor: t.bg.sunken }}
          contentFit="cover"
        />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Body numberOfLines={1} style={{ flex: 1, fontWeight: "800" }}>
              {investment.propertyName}
            </Body>
            <StatusPill tone={status.tone} label={status.label} size="xs" />
          </View>
          <Caption tone="muted">
            {investment.planName} · {investment.slots} slot{investment.slots === 1 ? "" : "s"}
          </Caption>
          {!pending ? (
            <>
              <ProgressBar value={investment.termProgressPct} />
              <Caption tone="muted">
                {Math.round(investment.termProgressPct)}% of term · {formatDaysRemaining(investment.daysRemaining)}
              </Caption>
            </>
          ) : (
            <Caption tone="muted">Awaiting bank transfer</Caption>
          )}
        </View>
      </View>
      <View style={styles.figures}>
        <View>
          <Caption tone="muted">Principal</Caption>
          <MoneyFigure minor={investment.principal} size="xs" />
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Caption tone="muted">
            {investment.status === "COMPLETED" ? "Settled value" : pending ? "Maturity value if confirmed" : "Maturity value"}
          </Caption>
          <MoneyFigure minor={investment.maturityValue} size="xs" tone={investment.status === "COMPLETED" ? "success" : "default"} />
        </View>
      </View>
    </Pressable>
  );
}

/** Compact row used on Home (44px image). */
export function InvestmentRow({ investment }: { investment: Investment }) {
  const router = useRouter();
  const status = INVESTMENT_STATUS[investment.status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={investment.propertyName}
      onPress={() => router.push(`/(tabs)/portfolio/${investment.id}`)}
      style={styles.row}
    >
      <Image
        source={propertyImage(investment.propertyImage as PropertyImageKey)}
        style={{ width: 44, height: 44, borderRadius: radius.sm, backgroundColor: t.bg.sunken }}
        contentFit="cover"
      />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Body numberOfLines={1} style={{ flex: 1, fontWeight: "700" }}>
            {investment.propertyName}
          </Body>
          <StatusPill tone={status.tone} label={status.label} size="xs" />
        </View>
        <ProgressBar value={investment.termProgressPct} style={{ height: 4 }} />
      </View>
      <MoneyFigure minor={investment.maturityValue} size="xs" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: t.bg.surface,
    borderWidth: 1,
    borderColor: t.border.default,
    borderRadius: radius.lg,
    padding: 14,
    gap: 12,
  },
  figures: { flexDirection: "row", justifyContent: "space-between" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
});
