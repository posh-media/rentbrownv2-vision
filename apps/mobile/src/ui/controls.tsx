import { Check } from "lucide-react-native";
import * as React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch as RNSwitch,
  Text,
  View,
} from "react-native";

import { font, radius, t } from "../theme";
import { Body, Caption } from "./text";

// ── SegmentedControl (horizontal scroll chips) ──────────────────────────────
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seg}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={[styles.chip, active && { backgroundColor: t.bg.inverse, borderColor: t.bg.inverse }]}
          >
            <Text style={[styles.chipText, active && { color: t.text.inverse }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ── Stepper ─────────────────────────────────────────────────────────────────
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <View style={styles.stepper} accessibilityLabel={`Step ${current} of ${steps.length}`}>
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <React.Fragment key={label}>
            <View style={styles.step}>
              <View
                style={[
                  styles.stepDot,
                  done && { backgroundColor: t.status.success.fg, borderColor: t.status.success.fg },
                  active && { backgroundColor: t.action.primary, borderColor: t.action.primary },
                ]}
              >
                {done ? (
                  <Check size={12} color={t.text.inverse} strokeWidth={3} />
                ) : (
                  <Text style={[styles.stepNum, active && { color: t.text.inverse }]}>{n}</Text>
                )}
              </View>
              {active ? <Caption style={{ marginLeft: 6 }}>{label}</Caption> : null}
            </View>
            {n < steps.length ? <View style={styles.stepLine} /> : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ── Timeline (vertical) ─────────────────────────────────────────────────────
export interface TimelineItem {
  label: string;
  at?: string | null;
  state: "done" | "current" | "upcoming";
  note?: string;
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <View>
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <View key={`${item.label}-${i}`} style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ alignItems: "center", width: 20 }}>
              <View
                style={[
                  styles.tlDot,
                  item.state === "done" && { backgroundColor: t.action.primary, borderColor: t.action.primary },
                  item.state === "current" && { borderColor: t.action.primary, borderWidth: 2 },
                ]}
              />
              {!last ? <View style={[styles.tlLine, item.state === "done" && { backgroundColor: t.action.primary }]} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : 20 }}>
              <Body
                style={item.state === "upcoming" ? { color: t.text.tertiary } : undefined}
              >
                {item.label}
              </Body>
              {item.at ? <Caption tone="muted">{item.at}</Caption> : <Caption tone="muted">—</Caption>}
              {item.note ? <Caption tone="muted">{item.note}</Caption> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Switch ──────────────────────────────────────────────────────────────────
export function Switch({
  value,
  onValueChange,
  disabled,
  label,
}: {
  value: boolean;
  onValueChange?: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <RNSwitch
      accessibilityLabel={label}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: t.bg.sunken, true: t.action.primary }}
      thumbColor="#FFFDF8"
      ios_backgroundColor={t.bg.sunken}
    />
  );
}

// ── Checkbox ────────────────────────────────────────────────────────────────
export function Checkbox({
  checked,
  onChange,
  label,
  accessibilityLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => onChange(!checked)}
      style={styles.checkboxRow}
    >
      <View style={[styles.checkbox, checked && { backgroundColor: t.action.primary, borderColor: t.action.primary }]}>
        {checked ? <Check size={13} color={t.text.inverse} strokeWidth={3} /> : null}
      </View>
      {typeof label === "string" ? (
        <Body style={{ flex: 1 }}>{label}</Body>
      ) : (
        <View style={{ flex: 1 }}>{label}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  seg: { gap: 8, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 14,
    minHeight: 36,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: t.border.default,
    backgroundColor: t.bg.surface,
  },
  chipText: { fontFamily: font.bold, fontSize: 13, color: t.text.secondary },
  stepper: { flexDirection: "row", alignItems: "center" },
  step: { flexDirection: "row", alignItems: "center" },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: t.border.strong,
    backgroundColor: t.bg.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNum: { fontFamily: font.bold, fontSize: 12, color: t.text.secondary },
  stepLine: { flex: 1, height: 1, backgroundColor: t.border.strong, marginHorizontal: 8 },
  tlDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: t.border.strong,
    backgroundColor: t.bg.surface,
    marginTop: 4,
  },
  tlLine: { flex: 1, width: 1.5, backgroundColor: t.border.strong, marginVertical: 2 },
  checkboxRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: t.border.strong,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
});
