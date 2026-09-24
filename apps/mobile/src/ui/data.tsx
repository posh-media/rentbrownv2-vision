import { Check, ChevronRight, Copy } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import * as React from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { radius, t } from "../theme";
import { Body, BodySm, Caption } from "./text";
import { useToast } from "./toast";

// ── Divider ─────────────────────────────────────────────────────────────────
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: 1, backgroundColor: t.border.default }, style]} />;
}

// ── DataRow ─────────────────────────────────────────────────────────────────
export function DataRow({
  label,
  value,
  strong,
  success,
  copyable,
  style,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
  success?: boolean;
  copyable?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { toast } = useToast();
  const copy = copyable
    ? async () => {
        await Clipboard.setStringAsync(copyable);
        toast("Copied");
      }
    : undefined;
  return (
    <View style={[styles.row, style]}>
      <BodySm tone="muted" style={{ flex: 1 }}>
        {label}
      </BodySm>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1, maxWidth: "62%" }}>
        {typeof value === "string" || typeof value === "number" ? (
          <Body
            tone={success ? "success" : "default"}
            style={strong ? { fontWeight: "800" } : undefined}
            numberOfLines={2}
          >
            {value}
          </Body>
        ) : (
          value
        )}
        {copy ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Copy ${label}`} onPress={() => void copy()} hitSlop={8}>
            <Copy size={13} color={t.text.tertiary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// ── ProgressBar ─────────────────────────────────────────────────────────────
export function ProgressBar({
  value,
  tone = "brand",
  inverse,
  style,
}: {
  /** 0–100 */
  value: number;
  tone?: "brand" | "success" | "warning";
  inverse?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const fill = tone === "success" ? t.status.success.dot : tone === "warning" ? t.status.warning.dot : t.action.primary;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }}
      style={[styles.track, { backgroundColor: inverse ? "rgba(255,253,248,0.25)" : t.bg.sunken }, style]}
    >
      <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: "100%", borderRadius: 4, backgroundColor: fill }} />
    </View>
  );
}

// ── ListRow ─────────────────────────────────────────────────────────────────
export function ListRow({
  icon,
  title,
  caption,
  right,
  chevron = true,
  onPress,
  style,
}: {
  icon?: React.ReactNode;
  title: string;
  caption?: string;
  right?: React.ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={title}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.listRow,
        pressed && { backgroundColor: t.bg.subtle },
        style,
      ]}
    >
      {icon}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Body style={{ fontFamily: undefined }} numberOfLines={1}>
          <BodySm style={{ fontWeight: "700" }}>{title}</BodySm>
        </Body>
        {caption ? (
          <Caption tone="muted" numberOfLines={2}>
            {caption}
          </Caption>
        ) : null}
      </View>
      {right}
      {onPress && chevron ? <ChevronRight size={16} color={t.text.tertiary} /> : null}
    </Pressable>
  );
}

// ── CheckDot (timeline/selection check) ─────────────────────────────────────
export function CheckDot({ size = 18, color = t.status.success.fg }: { size?: number; color?: string }) {
  return <Check size={size} color={color} strokeWidth={3} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 7,
  },
  track: { height: 6, borderRadius: 4, overflow: "hidden" },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: radius.sm,
  },
});
