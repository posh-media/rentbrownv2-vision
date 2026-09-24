import * as React from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { CURRENCY_SYMBOL, formatMoney } from "@rentbrown/utils";
import type { CurrencyCode } from "@rentbrown/types";
import { font, radius, t } from "../theme";
import { Caption } from "./text";

export interface FieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
}

export function Field({ label, error, hint, ...rest }: FieldProps) {
  return (
    <View style={{ gap: 6 }}>
      <Caption tone="muted">{label}</Caption>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.text.tertiary}
        {...rest}
        style={[styles.input, error && { borderColor: t.status.error.fg }, rest.style]}
      />
      {error ? (
        <Caption tone="error">{error}</Caption>
      ) : hint ? (
        <Caption tone="muted">{hint}</Caption>
      ) : null}
    </View>
  );
}

export { Field as Input };

// ── MoneyInput ──────────────────────────────────────────────────────────────
export interface MoneyInputProps {
  value: number; // minor units
  onChange: (minor: number) => void;
  currency?: CurrencyCode;
  hint?: string;
  error?: string;
  large?: boolean;
  accessibilityLabel?: string;
}

/** ₦-prefixed numeric input; stores integer minor units, displays grouped majors. */
export function MoneyInput({
  value,
  onChange,
  currency = "NGN",
  hint,
  error,
  large,
  accessibilityLabel = "Amount",
}: MoneyInputProps) {
  const display = value > 0 ? formatMoney(value, currency, { symbol: false, decimals: "never" }) : "";
  return (
    <View style={{ gap: 6 }}>
      <View style={[styles.moneyBox, error && { borderColor: t.status.error.fg }]}>
        <Text style={[styles.symbol, large && { fontSize: 26 }]}>{CURRENCY_SYMBOL[currency]}</Text>
        <TextInput
          accessibilityLabel={accessibilityLabel}
          keyboardType="number-pad"
          value={display}
          placeholder="0"
          placeholderTextColor={t.text.tertiary}
          onChangeText={(txt) => {
            const digits = txt.replace(/[^\d]/g, "").slice(0, 10);
            onChange(digits ? Number(digits) * 100 : 0);
          }}
          style={[styles.moneyInput, large && { fontSize: 34 }]}
        />
      </View>
      {error ? (
        <Caption tone="error">{error}</Caption>
      ) : hint ? (
        <Caption tone="muted">{hint}</Caption>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: t.bg.subtle,
    borderWidth: 1,
    borderColor: t.border.default,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    minHeight: 48,
    fontFamily: font.regular,
    fontSize: 15,
    color: t.text.primary,
  },
  moneyBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: t.bg.subtle,
    borderWidth: 1,
    borderColor: t.border.default,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    minHeight: 56,
  },
  symbol: { fontFamily: font.extrabold, fontSize: 20, color: t.text.secondary },
  moneyInput: {
    flex: 1,
    fontFamily: font.extrabold,
    fontSize: 24,
    color: t.text.primary,
    fontVariant: ["tabular-nums"],
    paddingVertical: 10,
  },
});
