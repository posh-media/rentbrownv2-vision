import base from "@rentbrown/config/eslint";

const config = [
  ...base,
  {
    files: ["metro.config.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        __dirname: "readonly",
        module: "writable",
        require: "readonly",
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default config;
