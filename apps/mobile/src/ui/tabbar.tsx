import * as Haptics from "expo-haptics";
import type { Tabs } from "expo-router";
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { font, radius, t } from "../theme";
import { GlassSurface } from "./surfaces";

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>>[0];

const TAB_ROUTES = new Set(["home/index", "explore/index", "portfolio/index", "wallet/index", "account/index"]);

/** Floating glass tab bar — 12px side inset, sits above home indicator. */
export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const routes = state.routes
    .map((route, index) => ({ route, index }))
    .filter(({ route }) => TAB_ROUTES.has(route.name));
  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 8 }]} pointerEvents="box-none">
      <GlassSurface intensity={80} radius={radius.xl} style={styles.bar}>
        {routes.map(({ route, index }) => {
          const options = descriptors[route.key]?.options ?? {};
          const focused = state.index === index;
          const icon = options.tabBarIcon?.({
            focused,
            color: focused ? t.text.brand : t.text.tertiary,
            size: 22,
          });
          const label = (options.title as string) ?? route.name;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={`${label} tab`}
              onPress={() => {
                void Haptics.selectionAsync();
                const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={styles.tab}
            >
              <View style={[styles.pill, focused && { backgroundColor: t.action.secondary }]}>
                {icon}
              </View>
              <Text style={[styles.label, focused && { color: t.text.brand }]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 12, right: 12 },
  bar: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  tab: { flex: 1, alignItems: "center", gap: 3, minHeight: 52, justifyContent: "center" },
  pill: {
    width: 44,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontFamily: font.bold, fontSize: 10, color: t.text.tertiary },
});
