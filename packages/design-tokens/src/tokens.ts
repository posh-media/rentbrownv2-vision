/**
 * RentBrown design tokens — "Warm Institutional Fintech".
 *
 * Layer 1: primitives (raw values). Layer 2: semantic theme maps.
 * Apps and packages consume SEMANTIC tokens only. The five brand anchors from
 * the product brief are fixed: #5D4037, #8D6E63, #FFFDF8, #2D2624, #388E3C.
 *
 * Light theme ships. The dark map exists so a later theme is a remap, not a
 * redesign; it is NOT QA'd and is not exposed by default.
 */

export const primitives = {
  brand: {
    950: "#2B1C17",
    900: "#3E2A23",
    800: "#4A332B",
    700: "#5D4037", // PRIMARY — brief anchor
    600: "#70524A",
    500: "#8D6E63", // SECONDARY — brief anchor
    400: "#A98B7E",
    300: "#C4A99B",
    200: "#DCC8BD",
    100: "#EFE4DC",
    50: "#F7F1EA",
  },
  cream: {
    canvas: "#FFFDF8", // brief anchor
    surface: "#FFFFFF",
    subtle: "#F7F1EA",
    sunken: "#F1E9E0",
    border: "#E8DDD4",
    borderStrong: "#D5C6B9",
  },
  ink: {
    primary: "#2D2624", // brief anchor
    secondary: "#6B5D55",
    tertiary: "#9A8A7F",
    inverse: "#FFFDF8",
  },
  success: { 800: "#2E7D32", 700: "#388E3C", 100: "#E3F1E4", 50: "#F1F8F1" }, // 700 = brief anchor
  warning: { 700: "#B26A00", 600: "#D48A1E", 100: "#FBEEDB", 50: "#FDF6EC" },
  error: { 700: "#B3261E", 600: "#C9463E", 100: "#F9E3E1", 50: "#FCF1F0" },
  info: { 700: "#5D4037", 100: "#EFE4DC" }, // info uses brand, never blue — keeps warmth
  gold: { 600: "#C9A227", 100: "#F7EFD4" },
  dark: {
    canvas: "#1A1411",
    surface: "#241C18",
    subtle: "#2E241F",
    border: "#3E322C",
    textPrimary: "#F5EDE6",
    textSecondary: "#C4B3A7",
    textTertiary: "#8A7A6E",
  },
} as const;

/** Semantic light theme. Values are concrete so RN can consume them directly. */
export const light = {
  bg: {
    canvas: primitives.cream.canvas,
    surface: primitives.cream.surface,
    subtle: primitives.cream.subtle,
    sunken: primitives.cream.sunken,
    inverse: primitives.brand[700],
    inverseStrong: primitives.brand[900],
  },
  text: {
    primary: primitives.ink.primary,
    secondary: primitives.ink.secondary,
    tertiary: primitives.ink.tertiary,
    inverse: primitives.ink.inverse,
    brand: primitives.brand[700],
    brandSoft: primitives.brand[500],
  },
  border: {
    default: primitives.cream.border,
    strong: primitives.cream.borderStrong,
    brand: primitives.brand[300],
    inverse: "rgba(255,253,248,0.18)",
  },
  action: {
    primary: primitives.brand[700],
    primaryHover: primitives.brand[800],
    primaryActive: primitives.brand[900],
    primaryText: primitives.ink.inverse,
    secondary: primitives.brand[100],
    secondaryHover: primitives.brand[200],
    secondaryText: primitives.brand[700],
    focusRing: primitives.brand[500],
    disabledBg: primitives.cream.sunken,
    disabledText: primitives.ink.tertiary,
  },
  status: {
    success: { fg: primitives.success[800], bg: primitives.success[100], border: "#C8E3CA", dot: primitives.success[700] },
    warning: { fg: primitives.warning[700], bg: primitives.warning[100], border: "#F0D9B3", dot: primitives.warning[600] },
    error: { fg: primitives.error[700], bg: primitives.error[100], border: "#EFC4C0", dot: primitives.error[600] },
    info: { fg: primitives.brand[700], bg: primitives.brand[100], border: primitives.brand[200], dot: primitives.brand[500] },
    pending: { fg: primitives.brand[600], bg: primitives.brand[50], border: primitives.brand[200], dot: primitives.brand[400] },
    neutral: { fg: primitives.ink.secondary, bg: primitives.cream.subtle, border: primitives.cream.border, dot: primitives.ink.tertiary },
  },
  accent: { gold: primitives.gold[600], goldBg: primitives.gold[100] },
  /**
   * Glass surfaces — used selectively (sticky headers, bottom tab bars, sheets,
   * overlays on imagery, premium summary cards). Always pair with `blur.*`.
   */
  glass: {
    surface: "rgba(255,253,248,0.72)",
    surfaceStrong: "rgba(255,253,248,0.88)",
    surfaceSoft: "rgba(255,255,255,0.55)",
    border: "rgba(93,64,55,0.12)",
    borderStrong: "rgba(93,64,55,0.20)",
    dark: "rgba(45,38,36,0.55)",
    darkStrong: "rgba(45,38,36,0.72)",
    darkBorder: "rgba(255,253,248,0.18)",
  },
  chart: {
    series1: primitives.brand[700],
    series2: primitives.gold[600],
    series3: primitives.brand[300],
    grid: primitives.cream.border,
  },
} as const;

/** Dark map — defined for later remapping. Not shipped, not QA'd. */
export const dark = {
  ...light,
  bg: {
    canvas: primitives.dark.canvas,
    surface: primitives.dark.surface,
    subtle: primitives.dark.subtle,
    sunken: primitives.dark.canvas,
    inverse: primitives.brand[100],
    inverseStrong: primitives.cream.canvas,
  },
  text: {
    primary: primitives.dark.textPrimary,
    secondary: primitives.dark.textSecondary,
    tertiary: primitives.dark.textTertiary,
    inverse: primitives.ink.primary,
    brand: primitives.brand[300],
    brandSoft: primitives.brand[400],
  },
  border: {
    default: primitives.dark.border,
    strong: "#4E4038",
    brand: primitives.brand[500],
    inverse: "rgba(45,38,36,0.18)",
  },
  glass: {
    ...light.glass,
    surface: "rgba(36,28,24,0.72)",
    surfaceStrong: "rgba(36,28,24,0.88)",
    surfaceSoft: "rgba(46,36,31,0.55)",
    border: "rgba(255,253,248,0.10)",
    borderStrong: "rgba(255,253,248,0.18)",
  },
} as const;

export const typography = {
  fontFamily: {
    /** Product UI — web + mobile. */
    sans: "Plus Jakarta Sans",
    /** Marketing display only (site, landing hero). Never inside financial UI. */
    display: "DM Serif Display",
    mono: "ui-monospace",
  },
  /** Base scale (px). Web scales up at lg breakpoints; mobile uses as-is. */
  scale: {
    display: { size: 40, lineHeight: 46, weight: 400, family: "display" },
    h1: { size: 28, lineHeight: 34, weight: 800 },
    h2: { size: 22, lineHeight: 28, weight: 800 },
    h3: { size: 18, lineHeight: 24, weight: 700 },
    h4: { size: 16, lineHeight: 22, weight: 700 },
    body: { size: 15, lineHeight: 22, weight: 400 },
    bodySm: { size: 13, lineHeight: 19, weight: 400 },
    caption: { size: 12, lineHeight: 16, weight: 600 },
    eyebrow: { size: 11, lineHeight: 14, weight: 800, letterSpacing: 0.6, uppercase: true },
    /** Financial figures — always tabular numerals, letter-spacing 0. */
    figureXl: { size: 40, lineHeight: 44, weight: 800, tabular: true },
    figureLg: { size: 30, lineHeight: 36, weight: 800, tabular: true },
    figureMd: { size: 22, lineHeight: 28, weight: 800, tabular: true },
    figureSm: { size: 16, lineHeight: 22, weight: 700, tabular: true },
    figureXs: { size: 13, lineHeight: 18, weight: 700, tabular: true },
  },
} as const;

/** 4pt spacing scale (px). */
export const spacing = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
} as const;

/** Controlled corner radius (px). Cards md, sheets/featured lg, hero xl. */
export const radius = { xs: 6, sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

/** Warm-tinted, restrained shadows. Borders do most elevation work. */
export const shadow = {
  none: "none",
  xs: "0 1px 2px rgba(62,42,35,0.06)",
  sm: "0 2px 8px rgba(62,42,35,0.08)",
  md: "0 8px 24px rgba(62,42,35,0.10)",
  lg: "0 16px 48px rgba(62,42,35,0.16)",
  glass: "0 8px 32px rgba(62,42,35,0.10), inset 0 1px 0 rgba(255,255,255,0.45)",
} as const;

/** Backdrop blur radii (px) for glass surfaces. */
export const blur = { sm: 8, md: 16, lg: 24 } as const;

export const breakpoints = { sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1440 } as const;

/** Motion: 150–250ms ease-out; no celebratory animation on money events. */
export const motion = {
  duration: { fast: 150, base: 200, slow: 250 },
  easing: "cubic-bezier(0.2, 0, 0, 1)",
} as const;

/**
 * Locked status vocabulary. UI must map domain statuses onto these six tones
 * and never invent new colours for a status.
 */
export type StatusTone = keyof typeof light.status;

export const tokens = {
  primitives,
  themes: { light, dark },
  typography,
  spacing,
  radius,
  shadow,
  blur,
  breakpoints,
  motion,
} as const;

export type Tokens = typeof tokens;
export type Theme = typeof light;
export type ThemeName = keyof typeof tokens.themes;
