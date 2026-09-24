import { blur, dark, light, radius, shadow, spacing, tokens } from "./tokens";
import type { ThemeName } from "./tokens";

export * from "./tokens";

/** Semantic theme map for a given theme name. */
export function theme(name: ThemeName = "light") {
  return tokens.themes[name];
}

const kebab = (key: string) =>
  key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

function flatten(obj: Record<string, unknown>, prefix: string, out: Record<string, string>) {
  for (const [key, value] of Object.entries(obj)) {
    const name = prefix ? `${prefix}-${kebab(key)}` : kebab(key);
    if (value !== null && typeof value === "object") {
      flatten(value as Record<string, unknown>, name, out);
    } else {
      out[`--rb-${name}`] = String(value);
    }
  }
}

/**
 * Flatten a semantic theme map to CSS custom properties of the form
 * `--rb-<group>-<key>[-<sub>]`, plus `--rb-radius-*`, `--rb-shadow-*`,
 * `--rb-blur-*` and `--rb-space-*`.
 */
export function toCssVars(themeMap: typeof light | typeof dark = light): Record<string, string> {
  const out: Record<string, string> = {};
  flatten(themeMap, "", out);
  for (const [key, value] of Object.entries(radius)) {
    out[`--rb-radius-${kebab(key)}`] = `${value}px`;
  }
  for (const [key, value] of Object.entries(shadow)) {
    out[`--rb-shadow-${kebab(key)}`] = value;
  }
  for (const [key, value] of Object.entries(blur)) {
    out[`--rb-blur-${kebab(key)}`] = `${value}px`;
  }
  for (const [key, value] of Object.entries(spacing)) {
    out[`--rb-space-${kebab(key)}`] = `${value}px`;
  }
  return out;
}

/** Render a CSS block like `:root { --rb-... }` for the given theme. */
export function cssVarBlock(selector = ":root", themeName: ThemeName = "light"): string {
  const vars = toCssVars(theme(themeName));
  const body = Object.entries(vars)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");
  return `${selector} {\n${body}\n}`;
}
