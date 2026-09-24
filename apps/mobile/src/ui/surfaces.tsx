import { BlurView } from "expo-blur";
import * as React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { blur, radius, t, type StatusToneName } from "../theme";
import { Body, BodySm, Caption, H3 } from "./text";
import { Button } from "./button";

// ── Card ────────────────────────────────────────────────────────────────────
export function Card({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return <View style={[styles.card, padded && { padding: 16 }, style]}>{children}</View>;
}

// ── StatCard ────────────────────────────────────────────────────────────────
export function StatCard({
  label,
  children,
  note,
  emphasis,
  style,
}: {
  label: string;
  children: React.ReactNode;
  note?: string;
  emphasis?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.stat, emphasis && { backgroundColor: t.bg.inverse }, style]}>
      <Caption tone={emphasis ? "inverse" : "muted"}>{label}</Caption>
      <View style={{ marginTop: 6 }}>{children}</View>
      {note ? (
        <BodySm tone={emphasis ? "inverse" : "muted"} style={{ marginTop: 4, opacity: emphasis ? 0.8 : 1 }}>
          {note}
        </BodySm>
      ) : null}
    </View>
  );
}

// ── GlassSurface ────────────────────────────────────────────────────────────
export function GlassSurface({
  children,
  tone = "light",
  intensity = 60,
  style,
  radius: r = radius.lg,
}: {
  children?: React.ReactNode;
  tone?: "light" | "dark";
  intensity?: 40 | 60 | 80 | number;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}) {
  const overlay = tone === "dark" ? t.glass.dark : t.glass.surface;
  const border = tone === "dark" ? t.glass.darkBorder : t.glass.border;
  return (
    <View style={[{ borderRadius: r, overflow: "hidden", borderWidth: 1, borderColor: border }, style]}>
      <BlurView intensity={intensity} tint={tone === "dark" ? "dark" : "light"} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: overlay }]} />
      {children}
    </View>
  );
}

// ── StatePanel ──────────────────────────────────────────────────────────────
export function StatePanel({
  tone = "neutral",
  icon,
  title,
  body,
  actionLabel,
  onAction,
  style,
}: {
  tone?: StatusToneName;
  icon?: React.ReactNode;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const s = t.status[tone];
  return (
    <View
      accessibilityRole="summary"
      style={[styles.panel, { backgroundColor: s.bg, borderColor: s.border }, style]}
    >
      <View style={{ flexDirection: "row", gap: 10 }}>
        {icon}
        <View style={{ flex: 1, gap: 4 }}>
          <Body style={{ fontFamily: undefined }}>{title}</Body>
          {body ? <BodySm tone="muted">{body}</BodySm> : null}
          {actionLabel ? (
            <View style={{ marginTop: 8, alignSelf: "flex-start" }}>
              <Button size="sm" variant="outline" label={actionLabel} onPress={onAction} />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ── EmptyState ──────────────────────────────────────────────────────────────
export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      {icon}
      <H3 center>{title}</H3>
      {body ? (
        <BodySm tone="muted" center>
          {body}
        </BodySm>
      ) : null}
      {actionLabel ? <Button variant="outline" label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: t.bg.surface,
    borderWidth: 1,
    borderColor: t.border.default,
    borderRadius: radius.lg,
  },
  stat: {
    backgroundColor: t.bg.surface,
    borderWidth: 1,
    borderColor: t.border.default,
    borderRadius: radius.lg,
    padding: 16,
  },
  panel: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
  },
  empty: { alignItems: "center", gap: 10, paddingVertical: 40, paddingHorizontal: 24 },
});

export { blur };
