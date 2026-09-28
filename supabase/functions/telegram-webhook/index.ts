// RentBrown — Telegram webhook intake (public endpoint; security = Telegram
// secret-token header verification, never guessable URLs alone).
//
// Handles two update shapes:
//   1. message "/start <token>"   → consume_identity_link: binds the Telegram
//      user id to the RentBrown account that minted the link token.
//   2. chat_member / my_chat_member → passive re-verification: when a linked
//      user becomes a member of a configured community chat, open
//      TELEGRAM_MEMBERSHIP legs are resolved immediately (the scheduled
//      task-claim-verifier also sweeps them as a backstop).
//
// Telegram registers this endpoint with setWebhook(..., secret_token=...);
// every delivery then carries X-Telegram-Bot-Api-Secret-Token which we compare
// against TELEGRAM_WEBHOOK_SECRET. The bot token (TELEGRAM_BOT_TOKEN) lives in
// Edge env only — never in the DB or audit log.
import { createClient } from "jsr:@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";
const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function log(rid: string, msg: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ fn: "telegram-webhook", request_id: rid, msg, ...ctx }));
}

async function sendMessage(rid: string, chatId: number | string, text: string) {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    log(rid, "sendMessage_failed", { error: (e as Error).message });
  }
}

Deno.serve(async (req) => {
  const rid = crypto.randomUUID();
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!WEBHOOK_SECRET || !BOT_TOKEN) {
    log(rid, "provider_not_configured");
    return new Response("provider not configured", { status: 500 });
  }

  // Constant-time-enough check: secret token header must match exactly.
  const given = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (given !== WEBHOOK_SECRET) {
    log(rid, "secret_token_invalid");
    return new Response("unauthorized", { status: 401 });
  }

  let update: Record<string, unknown> = {};
  try { update = await req.json(); } catch { /* malformed */ }

  // ── /start <link token> — identity binding ──────────────────────────────
  const message = (update.message ?? update.edited_message) as
    | Record<string, unknown>
    | undefined;
  const text = typeof message?.text === "string" ? message.text : "";
  const from = (message?.from ?? {}) as Record<string, unknown>;
  const chat = (message?.chat ?? {}) as Record<string, unknown>;
  const startMatch = text.match(/^\/start(?:@\w+)?\s+(lnk_\S+)/);

  if (startMatch && from?.id != null) {
    const token = startMatch[1];
    const { error } = await sb.rpc("consume_identity_link", {
      p_token: token,
      p_provider: "TELEGRAM",
      p_provider_user_id: String(from.id),
      p_provider_username: typeof from.username === "string" ? from.username : null,
      p_request_id: rid,
    });
    if (error) {
      log(rid, "link_failed", { error: error.message });
      await sendMessage(rid, Number(chat.id), "This RentBrown link is invalid or expired — request a fresh one in the app.");
    } else {
      log(rid, "identity_linked", { telegram_user_id: String(from.id) });
      await sendMessage(rid, 
        Number(chat.id),
        "Telegram linked to your RentBrown account. Return to the app to finish the task.",
      );
    }
    return Response.json({ ok: true });
  }

  // ── chat_member updates — passive leg re-verification ───────────────────
  const memberUpdate = (update.chat_member ?? update.my_chat_member) as
    | Record<string, unknown>
    | undefined;
  if (memberUpdate) {
    const updChat = (memberUpdate.chat ?? {}) as Record<string, unknown>;
    const newMember = (memberUpdate.new_chat_member ?? {}) as Record<string, unknown>;
    const newUser = (newMember.user ?? {}) as Record<string, unknown>;
    const newStatus = String(newMember.status ?? "");
    const chatId = updChat.id != null ? String(updChat.id) : "";
    const tgUserId = newUser.id != null ? String(newUser.id) : "";
    const joined = newStatus === "member" || newStatus === "administrator" || newStatus === "creator";

    if (chatId && tgUserId) {
      // Find the RentBrown user bound to this Telegram id.
      const { data: ident } = await sb.from("user_identities")
        .select("user_id")
        .eq("provider", "TELEGRAM")
        .eq("provider_user_id", tgUserId)
        .maybeSingle();
      if (ident?.user_id) {
        // Resolve open TELEGRAM_MEMBERSHIP legs for this user whose
        // requirement config names this chat.
        const { data: legs } = await sb.rpc("task_legs_pending_verification", { p_limit: 50 });
        const mine = (legs ?? []).filter(
          (l: Record<string, unknown>) =>
            l.user_id === ident.user_id &&
            String(l.telegram_user_id ?? "") === tgUserId &&
            String((l.config as Record<string, unknown>)?.chat_id ?? "") === chatId,
        );
        for (const leg of mine) {
          const { error } = await sb.rpc("record_task_leg_result", {
            p_claim_id: leg.claim_id,
            p_requirement_id: leg.requirement_id,
            p_status: joined ? "VERIFIED" : "FAILED",
            p_detail: { source: "chat_member_update", chat_id: chatId, member_status: newStatus },
            p_request_id: rid,
          });
          log(rid, error ? "leg_result_failed" : "leg_resolved",
            { claim_id: leg.claim_id, joined, error: error?.message });
        }
      }
    }
    return Response.json({ ok: true });
  }

  return Response.json({ ok: true });
});
