import * as React from "react";
import { AccessibilityInfo, Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { radius, t } from "../theme";

export function Skeleton({
  width = "100%" as const,
  height = 14,
  radius: r = radius.sm,
  style,
}: {
  width?: number | `${number}%` | "auto";
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = React.useRef(new Animated.Value(0.45)).current;
  React.useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!mounted || reduced) return;
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        ]),
      );
      anim.start();
    });
    return () => {
      mounted = false;
      anim?.stop();
    };
  }, [opacity]);
  return (
    <Animated.View
      accessibilityElementsHidden
      style={[{ width, height, borderRadius: r, backgroundColor: t.bg.sunken, opacity }, style]}
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <View style={styles.card}>
      <Skeleton height={16} width="55%" />
      {Array.from({ length: lines - 1 }).map((_, i) => (
        <Skeleton key={i} height={12} width={i % 2 ? "85%" : "70%"} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: t.bg.surface,
    borderWidth: 1,
    borderColor: t.border.default,
    borderRadius: radius.lg,
    padding: 16,
    gap: 10,
  },
});
