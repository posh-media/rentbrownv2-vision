import * as React from "react";
import { Text, type TextProps, type TextStyle } from "react-native";
import { CURRENCY_SYMBOL, splitMoney } from "@rentbrown/utils";
import type { CurrencyCode, MinorUnits } from "@rentbrown/types";

import { font, p, t, typography } from "../theme";

type Tone = "default" | "inverse" | "muted" | "success" | "error" | "brand";

const toneColor: Record<Tone, string> = {
  default: t.text.primary,
  inverse: t.text.inverse,
  muted: t.text.secondary,
  success: t.status.success.fg,
  error: t.status.error.fg,
  brand: t.text.brand,
};

interface BaseProps extends TextProps {
  tone?: Tone;
  center?: boolean;
}

function make(scale: (typeof typography.scale)[keyof typeof typography.scale], family: string) {
  return function T({ tone = "default", center, style, ...rest }: BaseProps) {
    const s = scale as { size: number; lineHeight: number; letterSpacing?: number; uppercase?: boolean; weight?: number };
    return (
      <Text
        {...rest}
        style={[
          {
            fontFamily: family,
            fontSize: s.size,
            lineHeight: s.lineHeight,
            letterSpacing: s.letterSpacing ?? 0,
            color: toneColor[tone],
            textAlign: center ? "center" : "left",
            textTransform: s.uppercase ? "uppercase" : "none",
          },
          style,
        ]}
      />
    );
  };
}

export const Display = make(typography.scale.display, font.display);
export const H1 = make(typography.scale.h1, font.extrabold);
export const H2 = make(typography.scale.h2, font.extrabold);
export const H3 = make(typography.scale.h3, font.bold);
export const Body = make(typography.scale.body, font.regular);
export const BodySm = make(typography.scale.bodySm, font.regular);
export const Caption = make(typography.scale.caption, font.semibold);
export const Eyebrow = make(typography.scale.eyebrow, font.extrabold);

export type MoneySize = "xl" | "lg" | "md" | "sm" | "xs";
export type MoneyTone = Tone;

const moneyScale: Record<MoneySize, { size: number; lineHeight: number; family: string }> = {
  xl: { size: typography.scale.figureXl.size, lineHeight: typography.scale.figureXl.lineHeight, family: font.extrabold },
  lg: { size: typography.scale.figureLg.size, lineHeight: typography.scale.figureLg.lineHeight, family: font.extrabold },
  md: { size: typography.scale.figureMd.size, lineHeight: typography.scale.figureMd.lineHeight, family: font.extrabold },
  sm: { size: typography.scale.figureSm.size, lineHeight: typography.scale.figureSm.lineHeight, family: font.bold },
  xs: { size: typography.scale.figureXs.size, lineHeight: typography.scale.figureXs.lineHeight, family: font.bold },
};

export interface MoneyFigureProps extends TextProps {
  minor: MinorUnits;
  currency?: CurrencyCode;
  size?: MoneySize;
  tone?: MoneyTone;
  signed?: boolean;
  center?: boolean;
}

/** Financial figure: tabular numerals, symbol rendered smaller. */
export function MoneyFigure({
  minor,
  currency = "NGN",
  size = "md",
  tone = "default",
  signed = false,
  center,
  style,
  ...rest
}: MoneyFigureProps) {
  const { symbol, whole, fraction } = splitMoney(Math.abs(minor), currency);
  const s = moneyScale[size];
  const color = toneColor[tone];
  const sign = minor < 0 ? "−" : signed ? "+" : "";
  return (
    <Text
      {...rest}
      style={[
        { fontFamily: s.family, fontSize: s.size, lineHeight: s.lineHeight, color, fontVariant: ["tabular-nums"], textAlign: center ? "center" : "left" } as TextStyle,
        style,
      ]}
    >
      {sign}
      <Text style={{ fontSize: Math.round(s.size * 0.7), color }}>{symbol}</Text>
      {whole}
      {fraction}
    </Text>
  );
}

/** Muted-currency convenience for ₦-major shorthand like "₦146,250". */
export function symbolOf(currency: CurrencyCode = "NGN") {
  return CURRENCY_SYMBOL[currency];
}

export const brandGold = p.gold[600];
