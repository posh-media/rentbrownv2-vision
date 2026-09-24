import js from "@eslint/js";
import tseslint from "typescript-eslint";

export const ignores = [
  "**/node_modules/**",
  "**/dist/**",
  "**/.next/**",
  "**/.expo/**",
  "**/build/**",
  "**/.turbo/**",
];

/** Shared flat-config base for all RentBrown packages and apps. */
export default [
  { ignores },
  js.configs.recommended,
  ...tseslint.configs.recommended,
];
