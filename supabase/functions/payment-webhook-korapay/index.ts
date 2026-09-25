// RentBrown — KoraPay webhook intake (public endpoint; signature + server-side
// verification + idempotent credit). KoraPay signs DIFFERENTLY from Paystack:
// x-korapay-signature = HMAC-SHA256(JSON.stringify(payload.data), KORAPAY_SECRET_KEY)
// — the DATA OBJECT ONLY, not the raw body.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SECRET = Deno.env.get("KORAPAY_SECRET_KEY") ?? "";
const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hmac(algo: string, secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: algo }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

async function sha256(s: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

function log(rid: string, msg: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ fn: "payment-webhook-korapay", request_id: rid, msg, ...ctx }));
}

async function verifyCharge(paymentReference: string) {
  const res = await fetch(
    `https://api.korapay.com/merchant/api/v1/charges/${encodeURIComponent(paymentReference)}`,
    { headers: { authorization: `Bearer ${SECRET}` } });
  if (!res.ok) throw new Error(`verify http ${res.status}`);
  const body = await res.json();
  if (!body.status) throw new Error(`verify rejected: ${body.message ?? "unknown"}`);
  return body.data; // {status, amount, amount_expected, currency, reference, payment_reference}
}

Deno.serve(async (req) => {
  const rid = crypto.randomUUID();
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!SECRET) {
    log(rid, "secret_missing");
    return new Response("provider not configured", { status: 500 });
  }

  const raw = await req.text();
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(raw); } catch { /* malformed */ }
  const data = (body?.data ?? {}) as Record<string, unknown>;

  // KoraPay: HMAC-SHA256 over the serialized `data` object ONLY.
  const dataJson = JSON.stringify(data);
  const given = (req.headers.get("x-korapay-signature") ?? "").toLowerCase();
  const calc = await hmac("SHA-256", SECRET, dataJson);
  const signatureValid = calc === given;

  const eventType = String(body?.event ?? "unknown");
  const ourRef = String(data?.payment_reference ?? data?.reference ?? "");
  const provRef = String(data?.reference ?? "");
  const status = String(data?.status ?? "");
  const txnStatus = String(data?.transaction_status ?? status);
  // KoraPay amounts are major units (naira) — convert to minor.
  const amountMinor = Math.round(Number(data?.amount ?? 0) * 100);

  const eventKey = await sha256(`${eventType}|${ourRef}|${provRef}|${amountMinor}|${txnStatus}`);

  const { data: ev, error: evErr } = await sb.rpc("ingest_provider_event", {
    p_provider: "KORAPAY",
    p_event_type: eventType,
    p_provider_event_id: provRef || null,
    p_signature_valid: signatureValid,
    p_idempotency_key: eventKey,
    p_payload_hash: await sha256(raw),
    p_payload: {
      event: eventType, payment_reference: ourRef, reference: provRef,
      amount: data?.amount ?? null, amount_expected: data?.amount_expected ?? null,
      currency: data?.currency ?? null, status, transaction_status: txnStatus,
      fee: data?.fee ?? null,
    },
    p_request_id: rid,
  });
  if (evErr) { log(rid, "ingest_failed", { error: evErr.message }); return new Response("intake error", { status: 500 }); }

  if (!signatureValid) {
    log(rid, "signature_invalid", { reference: ourRef });
    return new Response("invalid signature", { status: 401 });
  }
  if (ev.status === "PROCESSED") {
    return Response.json({ received: true, dedup: true });
  }

  const { data: dep } = await sb.from("deposits")
    .select("id,status").eq("reference", ourRef).maybeSingle();
  if (!dep) {
    await sb.rpc("mark_provider_event", {
      p_event_id: ev.id, p_status: "REVIEW",
      p_error: `unknown deposit reference ${ourRef}` });
    log(rid, "orphan_event", { reference: ourRef });
    return Response.json({ received: true });
  }

  if (eventType !== "charge.success") {
    await sb.rpc("mark_provider_event", {
      p_event_id: ev.id, p_status: "IGNORED", p_deposit_id: dep.id });
    return Response.json({ received: true });
  }

  let v;
  try {
    v = await verifyCharge(ourRef);
  } catch (e) {
    await sb.rpc("mark_provider_event", {
      p_event_id: ev.id, p_status: "FAILED", p_deposit_id: dep.id,
      p_error: `verification unavailable: ${(e as Error).message}` });
    return new Response("verification unavailable", { status: 500 });
  }

  const verifiedMinor = Math.round(Number(v.amount ?? 0) * 100);
  const vStatus = String(v.status ?? "");

  if (vStatus === "reversed" || vStatus === "refunded") {
    await sb.rpc("refund_deposit", {
      p_deposit_id: dep.id, p_reason: "korapay reversal",
      p_provider_event_id: ev.id, p_request_id: rid });
    await sb.rpc("mark_provider_event", {
      p_event_id: ev.id, p_status: "PROCESSED", p_deposit_id: dep.id });
    log(rid, "reversal_applied", { deposit_id: dep.id });
    return Response.json({ received: true });
  }

  if (vStatus !== "success") {
    await sb.rpc("mark_provider_event", {
      p_event_id: ev.id, p_status: "REVIEW", p_deposit_id: dep.id,
      p_error: `verification status=${vStatus} txn=${v.transaction_status ?? "-"}` });
    return Response.json({ received: true });
  }

  // underpaid/overpaid surface as amount mismatch inside confirm_deposit → REVIEW
  const { error: cfErr } = await sb.rpc("confirm_deposit", {
    p_deposit_id: dep.id,
    p_verified_amount_minor: verifiedMinor,
    p_verified_currency: String(v.currency ?? ""),
    p_provider_txn_id: String(v.reference ?? provRef),
    p_provider_status: `${vStatus}:${v.transaction_status ?? ""}`,
    p_provider_event_id: ev.id,
    p_request_id: rid,
  });
  if (cfErr) {
    await sb.rpc("mark_provider_event", {
      p_event_id: ev.id, p_status: "FAILED", p_deposit_id: dep.id,
      p_error: cfErr.message });
    return new Response("confirm failed", { status: 500 });
  }

  await sb.rpc("mark_provider_event", {
    p_event_id: ev.id, p_status: "PROCESSED", p_deposit_id: dep.id });
  log(rid, "processed", { deposit_id: dep.id, reference: ourRef });
  return Response.json({ received: true });
});
