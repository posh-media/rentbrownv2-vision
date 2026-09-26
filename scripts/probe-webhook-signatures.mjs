// Phase 5B operator verification — signed webhook probes.
// Reads provider secrets from .env.secrets (never printed), signs a synthetic
// payload, POSTs to the deployed webhooks. Reference is deliberately unknown
// so nothing can be credited.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.secrets", "utf8").split(/\r?\n/)
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const base = "https://aqkynjuypijmlqnpcmza.supabase.co/functions/v1";
const ref = process.argv[2] ?? `DEP-PROBEBOGUS-${Date.now()}`;

// Paystack: HMAC-SHA512 over raw body, header x-paystack-signature
const psBody = JSON.stringify({ event: "charge.success", data: { reference: ref, amount: 0, currency: "NGN" } });
const psSig = createHmac("sha512", env.PAYSTACK_SECRET_KEY).update(psBody).digest("hex");
const psRes = await fetch(`${base}/payment-webhook-paystack`, {
  method: "POST", headers: { "content-type": "application/json", "x-paystack-signature": psSig }, body: psBody,
});
console.log("paystack signed:", psRes.status, await psRes.text());

// KoraPay: HMAC-SHA256 over JSON.stringify(data) only, header x-korapay-signature
const kpData = { reference: ref, payment_reference: ref, amount: 0, currency: "NGN", status: "success" };
const kpBody = JSON.stringify({ event: "charge.success", data: kpData });
const kpSig = createHmac("sha256", env.KORAPAY_SECRET_KEY).update(JSON.stringify(kpData)).digest("hex");
const kpRes = await fetch(`${base}/payment-webhook-korapay`, {
  method: "POST", headers: { "content-type": "application/json", "x-korapay-signature": kpSig }, body: kpBody,
});
console.log("korapay signed:", kpRes.status, await kpRes.text());
console.log("probe reference:", ref);
