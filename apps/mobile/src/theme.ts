import {
  theme as getTheme,
  blur,
  motion,
  radius,
  spacing,
  tokens,
  typography,
} from "@rentbrown/design-tokens";

export const t = getTheme("light");
export const p = tokens.primitives;
export { blur, motion, radius, spacing, typography };

export type StatusToneName = keyof typeof t.status;

/** Loaded font family names (@expo-google-fonts). RN has no fontWeight fallback
 * for custom fonts, so weight is expressed via family. */
export const font = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
  display: "DMSerifDisplay_400Regular",
} as const;

export function fontForWeight(weight: number): string {
  if (weight >= 800) return font.extrabold;
  if (weight >= 700) return font.bold;
  if (weight >= 600) return font.semibold;
  if (weight >= 500) return font.medium;
  return font.regular;
}
