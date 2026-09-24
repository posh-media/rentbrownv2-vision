import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as React from "react";
import { Dimensions, FlatList, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatMoney } from "@rentbrown/utils";

import { useScenario } from "../../src/data/provider";
import { propertyImage } from "../../src/lib/images";
import { Button, Caption, Display, GlassSurface, MoneyFigure } from "../../src/ui";
import { t } from "../../src/theme";

const { width } = Dimensions.get("window");

const SLIDES = [
  {
    image: "ikoyi-residences" as const,
    title: "Property-backed opportunities, clearly structured",
    card: { label: "The Terraces, Ikoyi", principal: 10_000_000, profit: 1_650_000, maturity: 11_650_000 },
  },
  {
    image: "lekki-courts" as const,
    title: "Principal and expected profit — always separate",
    card: { label: "Lekki Courts", principal: 10_000_000, profit: 1_400_000, maturity: 11_400_000 },
  },
  {
    image: "wuse-square" as const,
    title: "Track every naira to maturity",
    card: { label: "Wuse Square", principal: 10_000_000, profit: 1_250_000, maturity: 11_250_000 },
  },
];

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setScenario } = useScenario();
  const [index, setIndex] = React.useState(0);

  return (
    <View style={styles.root}>
      <FlatList
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        keyExtractor={(s) => s.title}
        renderItem={({ item }) => (
          <View style={{ width }}>
            <Image source={propertyImage(item.image)} style={StyleSheet.absoluteFill} contentFit="cover" />
            <LinearGradient
              colors={["rgba(36,28,24,0.15)", "rgba(36,28,24,0.78)"]}
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.slide, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 180 }]}>
              <Display tone="inverse" style={{ fontSize: 34, lineHeight: 40 }}>
                {item.title}
              </Display>
              <GlassSurface tone="dark" intensity={60} style={{ padding: 16, gap: 10 }}>
                <Caption tone="inverse">{item.card.label}</Caption>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <View>
                    <Caption tone="inverse" style={{ opacity: 0.7 }}>Slot</Caption>
                    <MoneyFigure minor={item.card.principal} size="xs" tone="inverse" />
                  </View>
                  <View>
                    <Caption tone="inverse" style={{ opacity: 0.7 }}>Expected profit</Caption>
                    <MoneyFigure minor={item.card.profit} size="xs" tone="inverse" />
                  </View>
                  <View>
                    <Caption tone="inverse" style={{ opacity: 0.7 }}>At maturity</Caption>
                    <MoneyFigure minor={item.card.maturity} size="xs" tone="inverse" />
                  </View>
                </View>
              </GlassSurface>
            </View>
          </View>
        )}
      />
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && { width: 20, backgroundColor: t.action.primary }]} />
          ))}
        </View>
        <Button size="lg" fullWidth label="Create account" onPress={() => router.push("/(auth)/signup")} />
        <Button size="lg" fullWidth variant="outline" label="Sign in" onPress={() => router.push("/(auth)/login")} />
        <Button
          variant="ghost"
          label="Browse first"
          onPress={() => {
            setScenario("signed-out");
            router.replace("/(tabs)/explore");
          }}
        />
        <Caption tone="muted" center>
          Prototype — all properties and figures are fictional. {formatMoney(0)} never moves.
        </Caption>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg.canvas },
  slide: { flex: 1, justifyContent: "flex-end", gap: 16, paddingHorizontal: 20 },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    gap: 10,
  },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,253,248,0.7)" },
});
