// RentBrown — Bachs webhook intake (public endpoint; HMAC signature +
// server-side charge verification + idempotent credit).
//
// Signature (docs.bachs.io/guides/webhooks):
//   Preferred: X-Bachs-Signature-V2 = "t=<unix>,v1=<hex>" (one v1 per valid
//   secret — accept ANY match; ±300 s tolerance). Legacy: X-Bachs-Timestamp +
//   X-Bachs-Signature. Signed payload: `${timestamp}.${raw_body}` HMAC-SHA256.
// Always verify over the raw request body, before JSON parsing.
//
// collection.succeeded / refund.paid are the financial-truth events; the
// browser success redirect is never trusted.
import { createClient } from "jsr:@supabase/supabase-js@2";

const API_KEY = Deno.env.get("BACHS_API_KEY") ?? "";
const SECRET = Deno.env.get("BACHS_WEBHOOK_SECRET") ?? "";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hmacSha256(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

async function sha256(s: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

function log(rid: string, msg: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ fn: "payment-webhook-bachs", request_id: rid, msg, ...ctx }));
}

const timingSafeEq = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

// V2: "t=...,v1=...,v1=..." — accept any matching v1 (secret rotation).
// Legacy: X-Bachs-Timestamp + X-Bachs-Signature (single hex).
async function verifySignature(req: Request, raw: string): Promise<boolean> {
  if (!SECRET) return false;
  const v2 = req.headers.get("x-bachs-signature-v2");
  if (v2) {
    const parts = new Map<string, string[]>();
    for (const pair of v2.split(",")) {
      const [k, v] = pair.split("=", 2);
      if (!k || !v) continue;
      parts.set(k.trim(), [...(parts.get(k.trim()) ?? []), v.trim()]);
    }
    const ts = parts.get("t")?.[0];
    if (!ts) return false;
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
    const expected = await hmacSha256(SECRET, `${ts}.${raw}`);
    return (parts.get("v1") ?? []).some((sig) => timingSafeEq(expected, sig));
  }
  const ts = req.headers.get("x-bachs-timestamp");
  const sig = req.headers.get("x-bachs-signature");
  if (ts && sig) {
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
    return timingSafeEq(await hmacSha256(SECRET, `${ts}.${raw}`), sig.toLowerCase());
  }
  return false;
}

function bachsApi(path: string) {
  const base = API_KEY.startsWith("sk_live_")
    ? "https://api.bachs.io"
    : "https://sandbox-api.bachs.io";
  return fetch(`${base}${path}`, { headers: { authorization: `Bearer ${API_KEY}` } });
}

// Server-side charge verification — the webhook payload is a hint, the charge
// record is the truth (same posture as the KoraPay verifyCharge call).
async function fetchCharge(chargeId: string) {
  const res = await bachsApi(`/v1/payments/charges/${encodeURIComponent(chargeId)}`);
  if (!res.ok) throw new Error(`charge lookup http ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

async function fetchCheckout(checkoutId: string) {
  const res = await bachsApi(`/v1/checkout-sessions/${encodeURIComponent(checkoutId)}`);
  if (!res.ok) throw new Error(`checkout lookup http ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

// Decimal-string → minor units (Bachs money is a decimal string at currency
// precision; NGN/USD are 2dp). Returns null on unparseable input so callers
// route to REVIEW instead of trusting it.
const toMinor = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};

Deno.serve(async (req) => {
  const rid = crypto.randomUUID();
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!SECRET || !API_KEY) {
    log(rid, "secrets_missing");
    return new Response("provider not configured", { status: 500 });
  }

  const raw = await req.text();
  const signatureValid = await verifySignature(req, raw);

  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(raw);
  } catch {
    /* malformed — still recorded below */
  }
  const data = (body?.data ?? {}) as Record<string, unknown>;
  const eventType = String(body?.type ?? "unknown");
  const eventId = String(body?.id ?? "");
  let ourRef = String(data?.reference ?? "");
  const chargeId = String(data?.charge_id ?? "");
  const checkoutId = String(data?.checkout_id ?? "");

  // Durable intake + dedup on the provider event id (fallback: content hash).
  const { data: ev, error: evErr } = await sb.rpc("ingest_provider_event", {
    p_provider: "BACHS",
    p_event_type: eventType,
    p_provider_event_id: eventId || null,
    p_signature_valid: signatureValid,
    p_idempotency_key: eventId || (await sha256(raw)),
    p_payload_hash: await sha256(raw),
    p_payload: {
      type: eventType,
      reference: ourRef,
      charge_id: chargeId || null,
      checkout_id: checkoutId || null,
      amount: data?.amount ?? null,
      currency: data?.currency ?? null,
      status: data?.status ?? null,
      settlement_amount: data?.settlement_amount ?? null,
      settlement_currency: data?.settlement_currency ?? null,
      processing_fee: data?.processing_fee ?? null,
      refund_id: data?.refund_id ?? null,
    },
    p_request_id: rid,
  });
  if (evErr) {
    log(rid, "ingest_failed", { error: evErr.message });
    return new Response("intake error", { status: 500 });
  }

  if (!signatureValid) {
    log(rid, "signature_invalid", { type: eventType });
    return new Response("invalid signature", { status: 401 });
  }
  if (ev.status === "PROCESSED" || ev.status === "IGNORED") {
    return Response.json({ received: true, dedup: true });
  }

  const mark = (status: string, depositId: string | null = null, error: string | null = null) =>
    sb.rpc("mark_provider_event", {
      p_event_id: ev.id,
      p_status: status,
      p_deposit_id: depositId,
      p_error: error,
    });

  // Locate the deposit by our merchant reference; Bachs reference is the
  // deposits.reference we sent at checkout creation. Refund events carry the
  // REFUND reference instead — resolve the deposit through the charge.
  let dep: {
    id: string;
    status: string;
    currency: string;
    amount_minor: number;
    provider_reference: string | null;
  } | null = null;
  if (ourRef) {
    const { data } = await sb
      .from("deposits")
      .select("id,status,currency,amount_minor,provider_reference")
      .eq("reference", ourRef)
      .maybeSingle();
    dep = data;
  }
  if (!dep && chargeId) {
    const charge = await fetchCharge(chargeId).catch(() => null);
    const ref = String(charge?.reference ?? "");
    if (ref) {
      ourRef = ref;
      const { data } = await sb
        .from("deposits")
        .select("id,status,currency,amount_minor,provider_reference")
        .eq("reference", ref)
        .maybeSingle();
      dep = data;
    }
  }

  if (!dep && ourRef) {
    await mark("REVIEW", null, `unknown deposit reference ${ourRef}`);
    log(rid, "orphan_event", { reference: ourRef, type: eventType });
    return Response.json({ received: true });
  }
  if (!dep) {
    // Events without a merchant reference (test deliveries, non-checkout
    // events) are recorded but never drive financial state.
    await mark("IGNORED");
    return Response.json({ received: true });
  }

  const transit = async (to: string, note: string) =>
    sb.rpc("apply_deposit_transition", {
      p_deposit_id: dep.id,
      p_to: to,
      p_source: "PROVIDER",
      p_provider_event_id: ev.id,
      p_request_id: rid,
      p_note: note,
    });

  switch (eventType) {
    case "collection.succeeded":
    case "checkout.completed": {
      // Verify against the charge record before crediting.
      let charge: Record<string, unknown> | null = null;
      const session = chargeId
        ? null
        : ((await fetchCheckout(checkoutId).catch(() => null)) as {
            charge?: { payment_id?: string };
          } | null);
      const cid = chargeId || String(session?.charge?.payment_id ?? "");
      if (!cid && eventType === "checkout.completed") {
        // checkout.completed may precede the charge — collection.succeeded follows.
        await mark("IGNORED", dep.id);
        return Response.json({ received: true });
      }
      try {
        charge = cid ? await fetchCharge(cid) : null;
      } catch (e) {
        await mark("FAILED", dep.id, `verification unavailable: ${(e as Error).message}`);
        return new Response("verification unavailable", { status: 500 });
      }
      if (!charge) {
        await mark("REVIEW", dep.id, "collection.succeeded without charge reference");
        return Response.json({ received: true });
      }

      const cStatus = String(charge.status ?? "");
      const cCur = String(charge.currency ?? "");
      const cAmount = toMinor(charge.amount);
      const settleCur = String(charge.settlement_currency ?? "");

      if (
        cStatus === "refunded" ||
        cStatus === "auto_refunded" ||
        cStatus === "partially_refunded"
      ) {
        await sb.rpc("refund_deposit", {
          p_deposit_id: dep.id,
          p_reason: `bachs charge ${cStatus}`,
          p_provider_event_id: ev.id,
          p_request_id: rid,
        });
        await mark("PROCESSED", dep.id);
        return Response.json({ received: true });
      }
      if (cStatus !== "succeeded") {
        await mark("REVIEW", dep.id, `charge status=${cStatus}`);
        return Response.json({ received: true });
      }

      // Currency check: charge.currency is the priced currency for fiat
      // checkouts; for crypto-paid checkouts the customer pays a crypto asset
      // while settlement lands in USD — accept when EITHER the charge
      // currency or the settlement currency matches the deposit currency.
      // Amounts always compare on the gross charge amount (fees are ours).
      const currencyOk = cCur === dep.currency || settleCur === dep.currency;
      const { error: cfErr } = await sb.rpc("confirm_deposit", {
        p_deposit_id: dep.id,
        p_verified_amount_minor: cAmount,
        p_verified_currency: currencyOk ? dep.currency : cCur,
        p_provider_txn_id: cid,
        p_provider_status: `bachs:${cStatus}`,
        p_provider_event_id: ev.id,
        p_request_id: rid,
      });
      if (cfErr) {
        await mark("FAILED", dep.id, cfErr.message);
        return new Response("confirm failed", { status: 500 });
      }
      await mark("PROCESSED", dep.id);
      log(rid, "processed", { deposit_id: dep.id, reference: ourRef });
      return Response.json({ received: true });
    }

    case "collection.failed": {
      const { error } = await transit("FAILED", "bachs collection failed");
      await mark(error ? "FAILED" : "PROCESSED", dep.id, error?.message ?? null);
      return Response.json({ received: true });
    }

    case "collection.underpaid": {
      await transit("REVIEW_REQUIRED", "bachs underpayment");
      await sb.from("deposits").update({ review_reason: "UNDERPAID" }).eq("id", dep.id);
      await mark("PROCESSED", dep.id);
      return Response.json({ received: true });
    }

    case "checkout.expired": {
      if (dep.status === "INITIATED" || dep.status === "PENDING") {
        await transit("EXPIRED", "bachs checkout expired");
      }
      await mark("PROCESSED", dep.id);
      return Response.json({ received: true });
    }

    case "refund.paid": {
      const { error } = await sb.rpc("refund_deposit", {
        p_deposit_id: dep.id,
        p_reason: "bachs refund paid",
        p_provider_event_id: ev.id,
        p_request_id: rid,
      });
      // A refund on a not-yet-confirmed deposit can't reverse — flag for ops.
      await mark(error ? "REVIEW" : "PROCESSED", dep.id, error?.message ?? null);
      return Response.json({ received: true });
    }

    case "refund.created":
    case "refund.processing": {
      // Initiated but not final — no ledger movement yet.
      await mark("IGNORED", dep.id, "refund in flight");
      return Response.json({ received: true });
    }

    case "refund.failed": {
      await mark("REVIEW", dep.id, "bachs refund failed — ops follow-up");
      return Response.json({ received: true });
    }

    default: {
      // checkout.session.*, dispute.*, payouts etc. — recorded, no deposit action.
      await mark("IGNORED", dep.id);
      return Response.json({ received: true });
    }
  }
});
