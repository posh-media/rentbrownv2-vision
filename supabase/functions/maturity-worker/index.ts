// RentBrown — investment maturity worker.
// mark_due_investments (ACTIVE → MATURITY_DUE) → claim_due_investments
// (bounded batch, matures_at ASC, stale-SETTLING re-claim) → settle_investment
// per id in its own transaction. One failing investment never stops the batch.
//
// Invoke via scheduled trigger / manual POST with x-worker-key = WORKER_SECRET
// (or the service role key in the Authorization header). Safe to run
// concurrently — settle_investment claims by conditional status update and
// the MATURITY_CREDIT journal is keyed inv:mature:<investment_id>.
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const WORKER_SECRET = Deno.env.get("WORKER_SECRET") ?? "";
const TIME_BUDGET_MS = 45_000;

Deno.serve(async (req) => {
  const rid = crypto.randomUUID();
  const log = (msg: string, ctx: Record<string, unknown> = {}) =>
    console.log(JSON.stringify({ fn: "maturity-worker", request_id: rid, msg, ...ctx }));

  const key = req.headers.get("x-worker-key") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  const allowed = (WORKER_SECRET && key === WORKER_SECRET)
    || auth === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (!allowed) return new Response("unauthorized", { status: 401 });

  const { data: cfg } = await sb.from("admin_config")
    .select("key,value,is_active").in("key", [
      "investment.maturity.enabled",
      "investment.maturity.batch_limit",
    ]);
  const enabled = cfg?.find((r) => r.key === "investment.maturity.enabled");
  if (!(enabled?.is_active && enabled?.value === true)) {
    log("maturity_disabled");
    return Response.json({ enabled: false });
  }
  const batchRow = cfg?.find((r) => r.key === "investment.maturity.batch_limit");
  const batch = typeof batchRow?.value === "number" ? batchRow.value : 25;

  const started = Date.now();
  let marked = 0, settled = 0, failed = 0;

  while (Date.now() - started < TIME_BUDGET_MS) {
    const { data: m, error: mErr } = await sb.rpc("mark_due_investments", {
      p_limit: batch, p_request_id: rid });
    if (mErr) { log("mark_failed", { error: mErr.message }); break; }
    marked += m ?? 0;

    const { data: ids, error: cErr } = await sb.rpc("claim_due_investments", {
      p_limit: batch });
    if (cErr) { log("claim_failed", { error: cErr.message }); break; }
    if (!ids || ids.length === 0) break;

    for (const row of ids) {
      const id = typeof row === "string" ? row : row.id ?? row.claim_due_investments;
      try {
        const { error } = await sb.rpc("settle_investment", {
          p_investment_id: id, p_request_id: rid });
        if (error) { failed++; log("settle_error", { investment_id: id, error: error.message }); }
        else settled++;
      } catch (e) {
        failed++;
        log("settle_exception", { investment_id: id, error: (e as Error).message });
      }
      if (Date.now() - started >= TIME_BUDGET_MS) break;
    }
  }

  log("batch_done", { marked, settled, failed, elapsed_ms: Date.now() - started });
  return Response.json({ marked, settled, failed });
});
