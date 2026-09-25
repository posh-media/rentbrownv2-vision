// RentBrown — Paystack webhook intake (public endpoint; security = signature
// verification + server-side transaction verification + idempotent credit).
// Signature: x-paystack-signature = HMAC-SHA512(raw_body, PAYSTACK_SECRET_KEY).
import { createClient } from "jsr:@supabase/supabase-js@2";

const SECRET = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
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
  console.log(JSON.stringify({ fn: "payment-webhook-paystack", request_id: rid, msg, ...ctx }));
}

async function verifyTransaction(reference: string) {
  const res = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { authorization: `Bearer ${SECRET}` } });
  if (!res.ok) throw new Error(`verify http ${res.status}`);
  const body = await res.json();
  if (!body.status) throw new Error(`verify rejected: ${body.message ?? "unknown"}`);
  return body.data; // {status, amount(kobo→minor already), currency, reference, id}
}

Deno.serve(async (req) => {
  const rid = crypto.randomUUID();
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!SECRET) {
    log(rid, "secret_missing");
    return new Response("provider not configured", { status: 500 });
  }

  // RAW BODY FIRST — signature is computed over the untouched body.
  const raw = await req.text();
  const given = (req.headers.get("x-paystack-signature") ?? "").toLowerCase();
  const calc = await hmac("SHA-512", SECRET, raw);
  const signatureValid = calc === given;

  let body: Record<string, unknown> = {};
  try { body = JSON.parse(raw); } catch { /* malformed */ }

  const data = (body?.data ?? {}) as Record<string, unknown>;
  const eventType = String(body?.event ?? "unknown");
  const reference = String(data?.reference ?? "");
  const amount = Number(data?.amount ?? 0);
  const status = String(data?.status ?? "");
  const txnId = data?.id != null ? String(data.id) : "";

  // Paystack has no stable event id → deterministic dedup key.
  const eventKey = await sha256(`${eventType}|${reference}|${amount}|${status}|${txnId}`);

  const { data: ev, error: evErr } = await sb.rpc("ingest_provider_event", {
    p_provider: "PAYSTACK",
    p_event_type: eventType,
    p_provider_event_id: txnId || null,
    p_signature_valid: signatureValid,
    p_idempotency_key: eventKey,
    p_payload_hash: await sha256(raw),
    p_payload: {
      event: eventType, reference, amount, status,
      id: txnId, paid_at: data?.paid_at ?? null, channel: data?.channel ?? null,
    },
    p_request_id: rid,
  });
  if (evErr) { log(rid, "ingest_failed", { error: evErr.message }); return new Response("intake error", { status: 500 }); }

  if (!signatureValid) {
    log(rid, "signature_invalid", { reference });
    return new Response("invalid signature", { status: 401 });
  }
  if (ev.status === "PROCESSED") {
    return Response.json({ received: true, dedup: true });
  }

  // correlate to our deposit by merchant reference
  const { data: dep } = await sb.from("deposits")
    .select("id,status").eq("reference", reference).maybeSingle();
  if (!dep) {
    await sb.rpc("mark_provider_event", {
      p_event_id: ev.id, p_status: "REVIEW",
      p_error: `unknown deposit reference ${reference}` });
    log(rid, "orphan_event", { reference });
    return Response.json({ received: true });
  }

  if (eventType !== "charge.success") {
    // non-success events (charge.failed etc.) are audit-only → IGNORED
    await sb.rpc("mark_provider_event", {
      p_event_id: ev.id, p_status: "IGNORED", p_deposit_id: dep.id });
    return Response.json({ received: true });
  }

  // authoritative server-side verification — never trust the payload alone
  let v;
  try {
    v = await verifyTransaction(reference);
  } catch (e) {
    await sb.rpc("mark_provider_event", {
      p_event_id: ev.id, p_status: "FAILED", p_deposit_id: dep.id,
      p_error: `verification unavailable: ${(e as Error).message}` });
    // 500 → provider retries; dedup keeps it single-effect
    return new Response("verification unavailable", { status: 500 });
  }

  if (String(v.status) === "reversed") {
    await sb.rpc("refund_deposit", {
      p_deposit_id: dep.id, p_reason: "paystack reversal",
      p_provider_event_id: ev.id, p_request_id: rid });
    await sb.rpc("mark_provider_event", {
      p_event_id: ev.id, p_status: "PROCESSED", p_deposit_id: dep.id });
    log(rid, "reversal_applied", { deposit_id: dep.id });
    return Response.json({ received: true });
  }

  if (String(v.status) !== "success" || String(v.reference) !== reference) {
    await sb.rpc("mark_provider_event", {
      p_event_id: ev.id, p_status: "REVIEW", p_deposit_id: dep.id,
      p_error: `verification mismatch: status=${v.status}` });
    return Response.json({ received: true });
  }

  const { error: cfErr } = await sb.rpc("confirm_deposit", {
    p_deposit_id: dep.id,
    p_verified_amount_minor: Number(v.amount),
    p_verified_currency: String(v.currency),
    p_provider_txn_id: String(v.id ?? ""),
    p_provider_status: String(v.status),
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
  log(rid, "processed", { deposit_id: dep.id, reference });
  return Response.json({ received: true });
});
