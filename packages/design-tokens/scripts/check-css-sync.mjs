// Fails if any colour value in the `light` theme is missing from theme.css.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { light } from "../src/tokens.ts";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "../src/theme.css"), "utf8")
  .toLowerCase()
  .replace(/\s+/g, "");

const missing = [];
const walk = (obj, path) => {
  for (const [key, value] of Object.entries(obj)) {
    const p = path ? `${path}.${key}` : key;
    if (value !== null && typeof value === "object") walk(value, p);
    else if (typeof value === "string" && !css.includes(value.toLowerCase().replace(/\s+/g, "")))
      missing.push(`${p} = ${value}`);
  }
};
walk(light, "");

if (missing.length) {
  console.error("theme.css is missing these `light` token values:");
  for (const m of missing) console.error(`  ${m}`);
  process.exit(1);
}
console.log("theme.css is in sync with tokens.ts light theme.");
