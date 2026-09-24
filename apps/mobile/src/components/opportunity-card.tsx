import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ROUND_STATUS } from "@rentbrown/utils";
import { formatBps, formatDurationShort } from "@rentbrown/utils";
import type { Opportunity } from "@rentbrown/types";
import type { PropertyImageKey } from "@rentbrown/mock-data";

import { propertyImage } from "../lib/images";
import { radius, t } from "../theme";
import { Body, BodySm, Caption, Eyebrow, GlassSurface, MoneyFigure, ProgressBar } from "../ui";

export function OpportunityCard({ opportunity, width }: { opportunity: Opportunity; width?: number }) {
  const router = useRouter();
  const { property, plan, round, perSlot } = opportunity;
  const status = ROUND_STATUS[round.status];
  const pct = round.allocatedPct;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${property.name}, ${plan.name}`}
      onPress={() => router.push(`/(tabs)/explore/${property.slug}`)}
      style={[styles.card, width ? { width } : undefined]}
    >
      <View style={styles.imageWrap}>
        <Image source={propertyImage(property.images[0] as PropertyImageKey)} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={{ position: "absolute", top: 10, left: 10 }}>
          <GlassSurface tone="dark" intensity={60} radius={radius.pill} style={{ paddingHorizontal: 10, paddingVertical: 4 }}>
            <Caption tone="inverse" style={{ fontSize: 10 }}>
              {status.label}
            </Caption>
          </GlassSurface>
        </View>
        <View style={{ position: "absolute", bottom: 10, right: 10 }}>
          <GlassSurface tone="dark" intensity={60} radius={radius.pill} style={{ paddingHorizontal: 10, paddingVertical: 4 }}>
            <Caption tone="inverse" style={{ fontSize: 10 }}>
              {formatBps(plan.roiBps)} · {formatDurationShort(plan.duration)}
            </Caption>
          </GlassSurface>
        </View>
      </View>
      <View style={{ padding: 14, gap: 8 }}>
        <Eyebrow tone="brand">{plan.name}</Eyebrow>
        <Body numberOfLines={1} style={{ fontWeight: "800" }}>
          {property.name}
        </Body>
        <BodySm tone="muted" numberOfLines={1}>
          {property.location.label}
        </BodySm>
        <View style={{ flexDirection: "row", gap: 14 }}>
          <View>
            <Caption tone="muted">Slot price</Caption>
            <MoneyFigure minor={perSlot.principal} size="xs" />
          </View>
          <View>
            <Caption tone="muted">Expected return</Caption>
            <Body style={{ fontSize: 13, fontWeight: "700" }}>{formatBps(plan.roiBps)}</Body>
          </View>
          <View>
            <Caption tone="muted">Duration</Caption>
            <Body style={{ fontSize: 13, fontWeight: "700" }}>{formatDurationShort(plan.duration)}</Body>
          </View>
        </View>
        <ProgressBar value={pct} />
        <Caption tone="muted">
          {round.availableSlots} of {round.totalSlots} slots available
        </Caption>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: t.bg.surface,
    borderWidth: 1,
    borderColor: t.border.default,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  imageWrap: { aspectRatio: 16 / 10, backgroundColor: t.bg.sunken },
});
