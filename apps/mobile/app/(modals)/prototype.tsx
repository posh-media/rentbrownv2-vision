import { useRouter } from "expo-router";
import { X } from "lucide-react-native";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MOCK_SCENARIOS, type MockScenario } from "@rentbrown/mock-data";

import { useScenario } from "../../src/data/provider";
import { t } from "../../src/theme";
import { Body, BodySm, Button, Caption, Card, ListRow } from "../../src/ui";

const LATENCIES = [0, 450, 1500];

export default function Prototype() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scenario, latency, setScenario, setLatency, resetSource } = useScenario();

  return (
    <View style={{ flex: 1, backgroundColor: t.bg.canvas, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 16 }}>
        <Body style={{ flex: 1, fontWeight: "800" }}>Prototype settings</Body>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} hitSlop={8}>
          <X size={20} color={t.text.primary} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 30 }}>
        <Card padded={false} style={{ paddingVertical: 6 }}>
          <Caption tone="muted" style={{ paddingHorizontal: 14, paddingTop: 10 }}>
            Scenario
          </Caption>
          {MOCK_SCENARIOS.map((s) => (
            <ListRow
              key={s.id}
              title={s.label}
              caption={s.description}
              chevron={false}
              onPress={() => setScenario(s.id as MockScenario)}
              right={scenario === s.id ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.action.primary }} /> : undefined}
            />
          ))}
        </Card>
        <Card padded={false} style={{ paddingVertical: 6 }}>
          <Caption tone="muted" style={{ paddingHorizontal: 14, paddingTop: 10 }}>
            Latency
          </Caption>
          {LATENCIES.map((ms) => (
            <ListRow
              key={ms}
              title={ms === 0 ? "Instant" : `${ms} ms`}
              chevron={false}
              onPress={() => setLatency(ms)}
              right={latency === ms ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.action.primary }} /> : undefined}
            />
          ))}
        </Card>
        <Button variant="outline" label="Reset data source" onPress={resetSource} />
        <BodySm tone="muted" center>
          All data is fictional and lives only in memory.
        </BodySm>
      </ScrollView>
    </View>
  );
}
