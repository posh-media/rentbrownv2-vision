// RentBrown — outbound webhook delivery worker + deposit janitor.
// Claims due outbound_events, POSTs the V1 payload to withdrawal.webhook.url,
// records success/failure with bounded backoff via finish_outbound_attempt.
// Delivery failure NEVER alters financial state.
//
// Invoke via scheduled trigger / manual POST with x-worker-key = WORKER_SECRET
// (or the service role key in the Authorization header).
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const WORKER_SECRET = Deno.env.get("WORKER_SECRET") ?? "";

Deno.serve(async (req) => {
  const rid = crypto.randomUUID();
  const log = (msg: string, ctx: Record<string, unknown> = {}) =>
    console.log(JSON.stringify({ fn: "outbox-worker", request_id: rid, msg, ...ctx }));

  const key = req.headers.get("x-worker-key") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  const allowed = (WORKER_SECRET && key === WORKER_SECRET)
    || auth === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (!allowed) return new Response("unauthorized", { status: 401 });

  // janitor: expire stale pending deposits (no-op when expiry is unconfigured)
  const { data: expired } = await sb.rpc("expire_due_deposits");
  if (expired) log("deposits_expired", { count: expired });

  const { data: enabledRow } = await sb.from("admin_config")
    .select("value,is_active").eq("key", "withdrawal.webhook.enabled").maybeSingle();
  const enabled = enabledRow?.is_active && enabledRow?.value === true;
  const { data: urlRow } = await sb.from("admin_config")
    .select("value").eq("key", "withdrawal.webhook.url").maybeSingle();
  const url = typeof urlRow?.value === "string" ? urlRow.value : null;

  if (!enabled || !url) {
    log("webhook_disabled_or_unconfigured");
    return Response.json({ delivered: 0, expired });
  }

  const { data: batch, error } = await sb.rpc("claim_outbound_batch", { p_limit: 20 });
  if (error) { log("claim_failed", { error: error.message }); return new Response("claim error", { status: 500 }); }

  let delivered = 0, failed = 0;
  for (const ev of batch ?? []) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-rentbrown-spec": "rentbrown.outbound.v1" },
        body: JSON.stringify(ev.payload),
        signal: AbortSignal.timeout(15000),
      });
      await sb.rpc("finish_outbound_attempt", {
        p_event_id: ev.id, p_success: res.ok,
        p_response_code: res.status, p_error: res.ok ? null : `http ${res.status}` });
      res.ok ? delivered++ : failed++;
      log(res.ok ? "delivered" : "delivery_failed", { event_id: ev.id, code: res.status });
    } catch (e) {
      await sb.rpc("finish_outbound_attempt", {
        p_event_id: ev.id, p_success: false, p_error: (e as Error).message });
      failed++;
      log("delivery_error", { event_id: ev.id, error: (e as Error).message });
    }
  }
  return Response.json({ delivered, failed, expired });
});
