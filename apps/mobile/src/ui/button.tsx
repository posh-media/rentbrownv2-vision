import * as React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { font, radius, t } from "../theme";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const heights: Record<ButtonSize, number> = { sm: 36, md: 48, lg: 52 };

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled,
  loading,
  icon,
  fullWidth,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const { bg, bgPressed, fg, border } = colors(variant, !!isDisabled);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          height: heights[size],
          paddingHorizontal: size === "sm" ? 14 : 20,
          backgroundColor: pressed ? bgPressed : bg,
          borderColor: border,
          borderWidth: variant === "outline" ? 1 : 0,
          alignSelf: fullWidth ? "stretch" : "auto",
          opacity: isDisabled && variant !== "outline" && variant !== "ghost" ? 1 : isDisabled ? 0.5 : 1,
        },
        fullWidth && { width: "100%" },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text
            numberOfLines={1}
            style={{
              fontFamily: font.bold,
              fontSize: size === "sm" ? 13 : 15,
              color: fg,
            }}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function colors(variant: ButtonVariant, disabled: boolean) {
  switch (variant) {
    case "secondary":
      return {
        bg: t.action.secondary,
        bgPressed: t.action.secondaryHover,
        fg: t.action.secondaryText,
        border: "transparent",
      };
    case "outline":
      return {
        bg: "transparent",
        bgPressed: t.bg.subtle,
        fg: t.text.primary,
        border: t.border.strong,
      };
    case "ghost":
      return {
        bg: "transparent",
        bgPressed: t.bg.subtle,
        fg: t.text.secondary,
        border: "transparent",
      };
    case "destructive":
      return {
        bg: disabled ? t.action.disabledBg : t.status.error.fg,
        bgPressed: t.status.error.fg,
        fg: disabled ? t.action.disabledText : t.text.inverse,
        border: "transparent",
      };
    default:
      return {
        bg: disabled ? t.action.disabledBg : t.action.primary,
        bgPressed: t.action.primaryHover,
        fg: disabled ? t.action.disabledText : t.action.primaryText,
        border: "transparent",
      };
  }
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 44,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
});
