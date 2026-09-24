import * as React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { font, radius, t, type StatusToneName } from "../theme";

// ── StatusPill ──────────────────────────────────────────────────────────────
export function StatusPill({
  tone,
  label,
  size = "md",
  style,
}: {
  tone: StatusToneName;
  label: string;
  size?: "xs" | "md";
  style?: StyleProp<ViewStyle>;
}) {
  const s = t.status[tone];
  return (
    <View
      accessibilityRole="text"
      style={[
        styles.pill,
        size === "xs" && { paddingHorizontal: 7, paddingVertical: 2 },
        { backgroundColor: s.bg, borderColor: s.border },
        style,
      ]}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: s.dot }} />
      <Text
        style={{
          fontFamily: font.bold,
          fontSize: size === "xs" ? 10 : 11,
          color: s.fg,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// ── IconCircle ──────────────────────────────────────────────────────────────
export function IconCircle({
  children,
  size = 40,
  tone = "neutral",
  filled,
}: {
  children: React.ReactNode;
  size?: number;
  tone?: StatusToneName | "brand";
  filled?: boolean;
}) {
  const s = tone === "brand" ? { bg: t.action.secondary, border: t.action.secondary } : t.status[tone];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: filled ? t.bg.inverse : s.bg,
        borderWidth: filled ? 0 : 1,
        borderColor: s.border,
      }}
    >
      {children}
    </View>
  );
}

// ── Avatar ──────────────────────────────────────────────────────────────────
export function Avatar({ initials, size = 40 }: { initials: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: t.bg.inverse,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontFamily: font.bold, fontSize: size * 0.38, color: t.text.inverse }}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
