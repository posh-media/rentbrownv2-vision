// RentBrown — task claim verifier worker.
// Sweeps open SERVER_AUTO verification legs (TELEGRAM_MEMBERSHIP), calls the
// provider adapter, records the leg result via record_task_leg_result (which
// internally re-settles the claim). Also expires claims past their TTL.
//
// Invoke via scheduled trigger / manual POST with x-worker-key = WORKER_SECRET
// (or the service role key in the Authorization header).
//
// A leg whose adapter cannot run (no bot token, no chat_id configured, user
// identity not yet linked) is left PENDING — claims expire on claim_ttl via
// expire_stale_claims; a leg NEVER auto-passes on missing config.
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const WORKER_SECRET = Deno.env.get("WORKER_SECRET") ?? "";
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";

// Telegram Bot API getChatMember: member/administrator/creator = pass;
// left/kicked/not-found = fail; any transport/permission error = stay pending.
async function telegramMembership(
  chatId: string,
  telegramUserId: string,
): Promise<"VERIFIED" | "FAILED" | "UNAVAILABLE"> {
  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?` +
      new URLSearchParams({ chat_id: chatId, user_id: telegramUserId }),
    { signal: AbortSignal.timeout(10000) },
  );
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    const desc = String(body?.description ?? "");
    // "user not found" / "participant_id_invalid" → definitive non-member
    if (/user not found|participant_id_invalid/i.test(desc)) return "FAILED";
    return "UNAVAILABLE"; // bot not admin, bad chat_id, rate limit — retry later
  }
  const status = String(body.result?.status ?? "");
  if (status === "member" || status === "administrator" || status === "creator") return "VERIFIED";
  if (status === "left" || status === "kicked" || status === "restricted") {
    // restricted-but-is_member still counts as present
    const isMember = body.result?.is_member === true;
    return isMember ? "VERIFIED" : "FAILED";
  }
  return "UNAVAILABLE";
}

Deno.serve(async (req) => {
  const rid = crypto.randomUUID();
  const log = (msg: string, ctx: Record<string, unknown> = {}) =>
    console.log(JSON.stringify({ fn: "task-claim-verifier", request_id: rid, msg, ...ctx }));

  const key = req.headers.get("x-worker-key") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  const allowed = (WORKER_SECRET && key === WORKER_SECRET)
    || auth === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (!allowed) return new Response("unauthorized", { status: 401 });

  // janitor: expire claims past their TTL so users can retry
  const { data: expired, error: expErr } = await sb.rpc("expire_stale_claims");
  if (expErr) log("expire_failed", { error: expErr.message });
  else if (expired) log("claims_expired", { count: expired });

  const { data: legs, error } = await sb.rpc("task_legs_pending_verification", { p_limit: 50 });
  if (error) {
    log("feed_failed", { error: error.message });
    return new Response("feed error", { status: 500 });
  }

  let verified = 0, failed = 0, skipped = 0;
  for (const leg of legs ?? []) {
    const cfg = (leg.config ?? {}) as Record<string, unknown>;
    const chatId = typeof cfg.chat_id === "string" || typeof cfg.chat_id === "number"
      ? String(cfg.chat_id) : "";
    const tgUserId = typeof leg.telegram_user_id === "string" ? leg.telegram_user_id : "";

    if (leg.kind !== "TELEGRAM_MEMBERSHIP" || !BOT_TOKEN || !chatId || !tgUserId) {
      skipped++;
      continue;
    }

    let result: "VERIFIED" | "FAILED" | "UNAVAILABLE";
    try {
      result = await telegramMembership(chatId, tgUserId);
    } catch (e) {
      log("adapter_error", { leg_id: leg.leg_id, error: (e as Error).message });
      skipped++;
      continue;
    }
    if (result === "UNAVAILABLE") { skipped++; continue; }

    const { error: recErr } = await sb.rpc("record_task_leg_result", {
      p_claim_id: leg.claim_id,
      p_requirement_id: leg.requirement_id,
      p_status: result,
      p_detail: { source: "task-claim-verifier", chat_id: chatId },
      p_request_id: rid,
    });
    if (recErr) {
      log("record_failed", { leg_id: leg.leg_id, error: recErr.message });
      skipped++;
      continue;
    }
    result === "VERIFIED" ? verified++ : failed++;
    log("leg_resolved", { leg_id: leg.leg_id, claim_id: leg.claim_id, result });
  }

  return Response.json({ verified, failed, skipped, expired: expired ?? 0 });
});
