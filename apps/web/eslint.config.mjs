import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import base from "@rentbrown/config/eslint";

const config = [...base, ...nextVitals, ...nextTs];

export default config;
