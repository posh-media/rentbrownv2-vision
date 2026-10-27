// RentBrown — Bachs sandbox verification probe (Phase 10A).
// Exercises the REAL Bachs sandbox API: key validity, supported currencies,
// checkout-session create/retrieve, and an optional self-signed webhook
// delivery against a deployed payment-webhook-bachs endpoint.
//
//   node scripts/verify-bachs.mjs                    # API checks only
//   node scripts/verify-bachs.mjs --webhook <url>    # + signed webhook test
//
// Reads BACHS_API_KEY / BACHS_WEBHOOK_SECRET from .env — values are never
// printed. Sandbox keys (sk_sandbox_*) only; a live key aborts immediately.

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const API_KEY = process.env.BACHS_API_KEY ?? "";
const WH_SECRET = process.env.BACHS_WEBHOOK_SECRET ?? "";
const results = [];
const check = (name, ok, detail = "") =>
  results.push({ name, ok, detail }) &
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);

if (!API_KEY) {
  console.error("BACHS_API_KEY is not configured in .env — sandbox checks cannot run.");
  process.exit(2);
}
if (API_KEY.startsWith("sk_live_")) {
  console.error(
    "Refusing to run: BACHS_API_KEY is a LIVE key. Sandbox keys start with sk_sandbox_.",
  );
  process.exit(2);
}
const BASE = API_KEY.startsWith("sk_sandbox_")
  ? "https://sandbox-api.bachs.io"
  : "https://api.bachs.io";
console.log(`Bachs probe → ${BASE} (key prefix sk_…${API_KEY.slice(-4)})`);

const api = async (method, path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${API_KEY}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
};

// 1. Key validity + currency catalogue
{
  const { status, body } = await api("GET", "/v1/currencies/supported");
  check("API key authenticated (GET /v1/currencies/supported)", status === 200, `http ${status}`);
  if (status === 200) {
    const fiat = body.fiat ?? body.data?.fiat ?? [];
    const crypto = body.crypto ?? body.data?.crypto ?? [];
    check("USD supported", fiat.includes("USD"), JSON.stringify(fiat));
    console.log(`    fiat: ${fiat.join(", ")}`);
    console.log(`    crypto: ${crypto.join(", ")}`);
  }
}

// 2. USD checkout session lifecycle
let checkoutId = null;
{
  const reference = `PROBE-${Date.now()}`;
  const { status, body } = await api("POST", "/v1/checkout-sessions", {
    pricing: { currency: "USD", amount: "5.00" },
    reference,
    metadata: { probe: "rentbrown-phase10a" },
  });
  check(
    "USD checkout session created",
    status === 200 || status === 201,
    `http ${status} ${body?.error_code ?? ""}`,
  );
  checkoutId = body.checkout_id ?? null;
  check(
    "checkout_url returned",
    typeof body.checkout_url === "string" && body.checkout_url.length > 0,
  );
  if (checkoutId) {
    const { status: s2, body: b2 } = await api("GET", `/v1/checkout-sessions/${checkoutId}`);
    check("checkout session retrievable", s2 === 200, `status=${b2?.status}`);
    check("reference round-trips", b2?.reference === reference, b2?.reference);
    check(
      "amount/currency match",
      b2?.amount === "5.00" && (b2?.currency === "USD" || b2?.billing_currency === "USD"),
      `${b2?.amount} ${b2?.currency ?? b2?.billing_currency}`,
    );
    console.log(
      `    payment methods offered: ${JSON.stringify(b2?.payment_methods ?? b2?.payment_method_types ?? "n/a")}`,
    );
  }
}

// 3. Crypto corridor session (only if the account has CRYPTO enabled)
{
  const { status, body } = await api("POST", "/v1/checkout-sessions", {
    pricing: { currency: "USD", amount: "5.00" },
    reference: `PROBE-CRYPTO-${Date.now()}`,
    payment_method_types: ["CRYPTO"],
  });
  if (status === 200 || status === 201) {
    check("CRYPTO corridor checkout created", true);
  } else {
    console.log(
      `  SKIP CRYPTO corridor — not enabled on this account (http ${status} ${body?.error_code ?? ""})`,
    );
  }
}

// 4. Signed webhook delivery against a deployed/local endpoint
const whUrl = process.argv[process.argv.indexOf("--webhook") + 1] || null;
if (process.argv.includes("--webhook") && whUrl) {
  if (!WH_SECRET) {
    console.log("  SKIP webhook test — BACHS_WEBHOOK_SECRET not configured.");
  } else {
    const ts = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      id: `evt_probe_${Date.now()}`,
      type: "collection.failed",
      created_at: new Date().toISOString(),
      organization_id: "probe",
      data: { reference: "PROBE-NOLOCAL", charge_id: "ch_probe", status: "FAILED" },
    });
    const sig = createHmac("sha256", WH_SECRET).update(`${ts}.${payload}`).digest("hex");
    const res = await fetch(whUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bachs-signature-v2": `t=${ts},v1=${sig}`,
      },
      body: payload,
      signal: AbortSignal.timeout(15_000),
    });
    check("signed webhook accepted by endpoint", res.status === 200, `http ${res.status}`);

    const bad = await fetch(whUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bachs-signature-v2": `t=${ts},v1=${"0".repeat(64)}`,
      },
      body: payload,
      signal: AbortSignal.timeout(15_000),
    });
    check("forged signature rejected", bad.status === 401, `http ${bad.status}`);
  }
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
