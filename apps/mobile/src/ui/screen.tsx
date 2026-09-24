import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import * as React from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { t } from "../theme";
import { Caption, Eyebrow, H1 } from "./text";

export interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  header?: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Extra bottom padding (e.g. above custom tab bar). */
  bottomPad?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

export function Screen({
  children,
  scroll = true,
  padded = true,
  header,
  refreshing,
  onRefresh,
  bottomPad = 0,
  style,
  contentStyle,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const body = (
    <View style={[{ paddingHorizontal: padded ? 16 : 0, paddingBottom: bottomPad + 16, gap: 16 }, contentStyle]}>
      {children}
    </View>
  );
  return (
    <View style={[styles.root, { paddingTop: insets.top }, style]}>
      {header}
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.text.brand} /> : undefined
          }
          contentContainerStyle={{ paddingBottom: bottomPad + 24 }}
        >
          {body}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{body}</View>
      )}
    </View>
  );
}

/** In-flow header for detail/stack screens (back chevron + title + actions). */
export function HeaderBar({
  title,
  eyebrow,
  back,
  onBack,
  right,
  large,
}: {
  title?: string;
  eyebrow?: string;
  back?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
  large?: boolean;
}) {
  const router = useRouter();
  const goBack = onBack ?? (() => router.back());
  if (large) {
    return (
      <View style={styles.large}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            {eyebrow ? <Eyebrow tone="muted">{eyebrow}</Eyebrow> : null}
            <H1 style={{ marginTop: 4 }}>{title}</H1>
          </View>
          {right}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.bar}>
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={goBack}
          hitSlop={8}
          style={styles.backBtn}
        >
          <ChevronLeft size={20} color={t.text.primary} />
        </Pressable>
      ) : (
        <View style={{ width: 36 }} />
      )}
      {title ? (
        <Caption numberOfLines={1} style={{ flex: 1, textAlign: "center", fontSize: 14 }}>
          {title}
        </Caption>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      <View style={{ minWidth: 36, alignItems: "flex-end" }}>{right}</View>
    </View>
  );
}

/** Round icon button used for bell/avatar/back-on-image. */
export function RoundIconButton({
  children,
  onPress,
  label,
  badge,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  label: string;
  badge?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.roundBtn, pressed && { opacity: 0.7 }]}
    >
      {children}
      {badge ? <View style={styles.badge} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg.canvas },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  large: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: t.border.default,
    backgroundColor: t.bg.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: t.border.default,
    backgroundColor: t.bg.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: t.status.error.fg,
    borderWidth: 1.5,
    borderColor: t.bg.surface,
  },
});
