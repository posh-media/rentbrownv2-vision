import * as Haptics from "expo-haptics";
import { Delete, ScanFace } from "lucide-react-native";
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { font, t } from "../theme";

export interface PinPadProps {
  value: string;
  onChange: (pin: string) => void;
  length?: number;
  onComplete?: (pin: string) => void;
  error?: string;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "bio", "0", "del"];

/** Six-dot PIN entry with custom keypad; haptic per key. */
export function PinPad({ value, onChange, length = 6, onComplete, error }: PinPadProps) {
  const press = (key: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (key === "del") {
      onChange(value.slice(0, -1));
      return;
    }
    if (key === "bio" || value.length >= length) return;
    const next = value + key;
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  return (
    <View style={{ gap: 20 }}>
      <View style={styles.dots} accessibilityLabel={`PIN, ${value.length} of ${length} digits`}>
        {Array.from({ length }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < value.length && { backgroundColor: error ? t.status.error.fg : t.action.primary, borderColor: "transparent" },
            ]}
          />
        ))}
      </View>
      <View style={styles.grid}>
        {KEYS.map((k) => (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityLabel={k === "del" ? "Delete" : k === "bio" ? "Biometrics" : `Digit ${k}`}
            onPress={() => press(k)}
            disabled={k === "bio"}
            style={({ pressed }) => [styles.key, pressed && { backgroundColor: t.bg.subtle }, k === "bio" && { opacity: 0.4 }]}
          >
            {k === "del" ? (
              <Delete size={22} color={t.text.primary} />
            ) : k === "bio" ? (
              <ScanFace size={22} color={t.text.primary} />
            ) : (
              <Text style={styles.keyText}>{k}</Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: "row", justifyContent: "center", gap: 14 },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: t.border.strong,
    backgroundColor: "transparent",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  key: {
    width: "30%",
    aspectRatio: 2.1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    margin: "1.5%",
  },
  keyText: { fontFamily: font.bold, fontSize: 24, color: t.text.primary },
});
