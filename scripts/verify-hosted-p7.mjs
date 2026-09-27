/**
 * Phase 7B hosted verification — maturity engine on hosted Supabase, real JWTs.
 *
 *   node scripts/verify-hosted-p7.mjs phaseA   # purchases + settlement paths
 *   #  → operator step: backdate the printed investment's matures_at
 *   #    (flagged DO block via SQL editor / MCP — write guard requires it)
 *   node scripts/verify-hosted-p7.mjs phaseB   # mark → claim → settle lifecycle
 *
 * Env (repo-root .env): SUPABASE_URL or PUBLIC_SUPABASE_URL,
 * SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 *
 * State between phases is persisted to .verify-p7-state.json (gitignored data).
 * All money effects are real but small: each test investment is 1 Terraces
 * slot = ₦100,000 funded by audited admin_post_adjustment.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const url = (env.SUPABASE_URL ?? env.PUBLIC_SUPABASE_URL)?.replace(/\/$/, "");
const anon = env.SUPABASE_ANON_KEY ?? env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) {
  console.error("SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const phase = process.argv[2] ?? "phaseA";
const STATE_FILE = join(root, ".verify-p7-state.json");

const INVESTOR = { email: "ada.investor@rentbrown.dev", password: "Investor!Pass1" };
const ADMIN = { email: "tunde.admin@rentbrown.dev", password: "Admin!Pass1" };

let passed = 0;
let failed = 0;
const check = (name, cond, extra = "") => {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${extra}`); }
};
const errText = (e) => (e?.message ?? String(e));

const anonClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const investor = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const svc = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const svc2 = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

// Local-clock skew guard (same fix as verify-hosted-p8.mjs): when this
// machine's clock runs ahead of the auth server, issued sessions look
// already-expired to supabase-js → a /token refresh on EVERY getSession() →
// GoTrue rate-limits → failed refresh nulls the session → requests go out as
// anon. Measure the skew from the first sign-in (iat = expires_at −
// expires_in) and rebase stored expires_at into local time.
let CLOCK_SKEW_S = 0;
const signInHealthy = async (client, creds) => {
  const { data, error } = await client.auth.signInWithPassword(creds);
  const s = data?.session;
  if (CLOCK_SKEW_S === 0 && s?.expires_at && s?.expires_in) {
    CLOCK_SKEW_S = Date.now() / 1000 - (s.expires_at - s.expires_in);
    if (Math.abs(CLOCK_SKEW_S) > 120) {
      console.log(`  (local-vs-auth clock skew ≈ ${Math.round(CLOCK_SKEW_S)}s — session times rebased)`);
    }
  }
  if (s?.expires_at && s?.refresh_token && CLOCK_SKEW_S !== 0) {
    await client.auth._saveSession({ ...s, expires_at: s.expires_at + CLOCK_SKEW_S });
  }
  return { error };
};

const PRINCIPAL = 10_000_000;   // 1 Terraces slot = ₦100,000
const PROFIT = 1_650_000;       // 16.5% → ₦16,500
const MATURITY = 11_650_000;    // ₦116,500

const settle = (c, id) => c.rpc("settle_investment", { p_investment_id: id, p_request_id: "p7-hosted" });
const walletAvail = async (uid) =>
  (await svc.from("wallets").select("available_minor").eq("user_id", uid).eq("currency", "NGN").maybeSingle()).data?.available_minor ?? 0;
const invStatus = async (id) =>
  (await svc.from("investments").select("status").eq("id", id).single()).data?.status;
const matureJournalCount = async (id) =>
  (await svc.from("journal_entries").select("id", { count: "exact", head: true })
    .eq("idempotency_key", `inv:mature:${id}`)).count ?? 0;
const buy = async (roundId, key) => {
  const { data, error } = await investor.rpc("request_investment", {
    p_round_id: roundId, p_slots: 1, p_idempotency_key: key });
  if (error) throw new Error(`purchase failed: ${error.message}`);
  return data;
};

if (phase === "phaseA") {
  // ── anon / investor denials ────────────────────────────────────────────────
  console.log("\n== denials ==");
  for (const [name, fn] of [
    ["anon mark_due_investments", () => anonClient.rpc("mark_due_investments")],
    ["anon claim_due_investments", () => anonClient.rpc("claim_due_investments")],
    ["anon settle_investment", () => anonClient.rpc("settle_investment", { p_investment_id: "00000000-0000-0000-0000-000000000000" })],
    ["anon admin_retry_settlement", () => anonClient.rpc("admin_retry_settlement", { p_investment_id: "00000000-0000-0000-0000-000000000000", p_reason: "x" })],
  ]) {
    const { error } = await fn();
    check(`${name} denied`, !!error, errText(error));
  }
  await signInHealthy(investor, INVESTOR);
  await signInHealthy(admin, ADMIN);
  {
    const { error } = await investor.rpc("settle_investment", { p_investment_id: "00000000-0000-0000-0000-000000000000" });
    check("investor settle_investment denied", !!error, errText(error));
    const { error: e2 } = await investor.rpc("admin_retry_settlement", {
      p_investment_id: "00000000-0000-0000-0000-000000000000", p_reason: "x" });
    check("investor admin_retry_settlement denied", !!e2, errText(e2));
  }

  // ── config seeds visible ───────────────────────────────────────────────────
  const { data: cfg } = await svc.from("admin_config").select("key,value")
    .in("key", ["investment.maturity.enabled", "investment.maturity.batch_limit", "investment.maturity.stale_minutes"]);
  check("maturity config seeded", cfg?.length === 3
    && cfg.find((r) => r.key === "investment.maturity.batch_limit")?.value === 25
    && cfg.find((r) => r.key === "investment.maturity.enabled")?.value === true
    && cfg.find((r) => r.key === "investment.maturity.stale_minutes")?.value === 15,
    JSON.stringify(cfg));

  // ── fund wallet + purchase test investments ────────────────────────────────
  console.log("\n== setup: funding + purchases ==");
  const uid = (await investor.auth.getUser()).data.user.id;
  const opps = (await investor.rpc("list_opportunities")).data ?? [];
  const terraces = opps.find((o) => o.property.slug === "the-terraces-ikoyi");

  const NEED = 50_000_000;
  const avail = await walletAvail(uid);
  if (avail < NEED) {
    const { error } = await admin.rpc("admin_post_adjustment", {
      p_user_id: uid, p_currency: "NGN", p_bucket: "AVAILABLE",
      p_amount_minor: NEED - avail, p_direction: "CREDIT",
      p_reason: "Phase 7B hosted verification funding",
      p_idempotency_key: `p7-verify-fund-${uid.slice(0, 8)}-${Date.now()}` });
    check("wallet funded via audited adjustment", !error, errText(error));
  }

  const ts = Date.now();
  const inv1 = await buy(terraces.round.id, `p7-main-${ts}`);      // settle path
  const inv2 = await buy(terraces.round.id, `p7-stale-noj-${ts}`); // stale, no journal
  const inv3 = await buy(terraces.round.id, `p7-stale-j-${ts}`);   // stale + good journal
  const inv4 = await buy(terraces.round.id, `p7-stale-bad-${ts}`); // stale + bad journal
  const inv5 = await buy(terraces.round.id, `p7-detect-${ts}`);    // mark_due detection
  check("5 test investments ACTIVE",
    [inv1, inv2, inv3, inv4, inv5].every((i) => i.status === "ACTIVE"));

  // ── settle path (MATURITY_DUE → SETTLING → COMPLETED) ──────────────────────
  console.log("\n== settle: happy path ==");
  await svc.rpc("apply_investment_transition", {
    p_investment_id: inv1.id, p_to: "MATURITY_DUE", p_actor_kind: "SYSTEM" });
  check("transitioned to MATURITY_DUE", (await invStatus(inv1.id)) === "MATURITY_DUE");

  const w0 = await walletAvail(uid);
  const { data: s1, error: sErr } = await settle(svc, inv1.id);
  check("settle_investment succeeds", !sErr, errText(sErr));
  check("status COMPLETED", s1?.status === "COMPLETED" && !!s1?.completed_at);
  check("wallet +maturity ₦116,500", (await walletAvail(uid)) - w0 === MATURITY);

  const { data: legs } = await svc.from("journal_entries")
    .select("id").eq("idempotency_key", `inv:mature:${inv1.id}`).single();
  const { data: lines } = await svc.from("ledger_entries")
    .select("direction,amount_minor,ledger_accounts(key)")
    .eq("journal_id", legs.id).order("id");
  check("MATURITY_CREDIT legs exact",
    lines?.length === 3
    && lines[0].ledger_accounts.key === "system:investment_principal_payable:NGN"
    && lines[0].direction === "DEBIT" && lines[0].amount_minor === PRINCIPAL
    && lines[1].ledger_accounts.key === "system:investment_profit_payable:NGN"
    && lines[1].direction === "DEBIT" && lines[1].amount_minor === PROFIT
    && lines[2].ledger_accounts.key === `user:${uid}:available:NGN`
    && lines[2].direction === "CREDIT" && lines[2].amount_minor === MATURITY,
    JSON.stringify(lines));

  const { data: evs } = await svc.from("investment_events").select("event_type")
    .eq("investment_id", inv1.id).order("created_at");
  check("events MATURED→SETTLEMENT_STARTED→SETTLED",
    evs?.map((e) => e.event_type).join(",").endsWith("MATURED,SETTLEMENT_STARTED,SETTLED"),
    JSON.stringify(evs?.map((e) => e.event_type)));
  const { count: obCount } = await svc.from("outbound_events")
    .select("id", { count: "exact", head: true })
    .eq("aggregate_id", inv1.id).eq("event_type", "investment.settled");
  check("investment.settled outbox written", obCount === 1);

  // ── idempotency + concurrency ──────────────────────────────────────────────
  console.log("\n== idempotency + concurrency ==");
  const w1 = await walletAvail(uid);
  const { data: s2 } = await settle(svc, inv1.id);
  check("second settle no-op", s2?.status === "COMPLETED");
  check("no second credit", (await walletAvail(uid)) === w1);
  check("still one settlement journal", (await matureJournalCount(inv1.id)) === 1);

  // concurrent settles on the same already-matured row
  const invC = await buy(terraces.round.id, `p7-race-${ts}`);
  await svc.rpc("apply_investment_transition", {
    p_investment_id: invC.id, p_to: "MATURITY_DUE", p_actor_kind: "SYSTEM" });
  const [rA, rB] = await Promise.all([settle(svc, invC.id), settle(svc2, invC.id)]);
  check("concurrent settles both exit safely", !rA.error && !rB.error,
    `${errText(rA.error)} / ${errText(rB.error)}`);
  check("concurrent: exactly one journal", (await matureJournalCount(invC.id)) === 1);
  check("concurrent: COMPLETED", (await invStatus(invC.id)) === "COMPLETED");

  // ── stale SETTLING recovery ────────────────────────────────────────────────
  console.log("\n== stale SETTLING recovery ==");
  // make every SETTLING row instantly reclaimable for the test window
  await svc.from("admin_config").update({ value: 0 })
    .eq("key", "investment.maturity.stale_minutes");

  const toSettling = async (id) => {
    await svc.rpc("apply_investment_transition", {
      p_investment_id: id, p_to: "MATURITY_DUE", p_actor_kind: "SYSTEM" });
    await svc.rpc("apply_investment_transition", {
      p_investment_id: id, p_to: "SETTLING", p_actor_kind: "SYSTEM" });
  };

  // case 1: stale SETTLING, no journal → normal settle
  await toSettling(inv2.id);
  const { data: s2r } = await settle(svc, inv2.id);
  check("stale SETTLING (no journal) settles", s2r?.status === "COMPLETED");
  check("one journal posted", (await matureJournalCount(inv2.id)) === 1);

  // case 2: stale SETTLING + matching journal → repair, never re-post
  await toSettling(inv3.id);
  const w3 = await walletAvail(uid);
  const { error: pjErr } = await svc.rpc("post_journal", {
    p_journal_type: "MATURITY_CREDIT", p_currency: "NGN",
    p_lines: [
      { account_key: "system:investment_principal_payable", direction: "DEBIT", amount_minor: PRINCIPAL },
      { account_key: "system:investment_profit_payable", direction: "DEBIT", amount_minor: PROFIT },
      { account_key: `user:${uid}:available`, direction: "CREDIT", amount_minor: MATURITY },
    ],
    p_idempotency_key: `inv:mature:${inv3.id}`,
    p_entity_type: "investment", p_entity_id: inv3.id,
    p_actor_kind: "SYSTEM", p_initiated_by: uid,
    p_description: "hosted repair-path test" });
  check("pre-existing settlement journal posted", !pjErr, errText(pjErr));
  const { data: s3r } = await settle(svc, inv3.id);
  check("journal-aware repair → COMPLETED", s3r?.status === "COMPLETED");
  check("no second journal on repair", (await matureJournalCount(inv3.id)) === 1);
  check("wallet credited exactly once", (await walletAvail(uid)) - w3 === MATURITY);

  // case 3: stale SETTLING + mismatched journal → REVIEW + outbox
  await toSettling(inv4.id);
  await svc.rpc("post_journal", {
    p_journal_type: "MATURITY_CREDIT", p_currency: "NGN",
    p_lines: [
      { account_key: "system:investment_principal_payable", direction: "DEBIT", amount_minor: PRINCIPAL },
      { account_key: "system:investment_profit_payable", direction: "DEBIT", amount_minor: PROFIT - 1 },
      { account_key: `user:${uid}:available`, direction: "CREDIT", amount_minor: MATURITY - 1 },
    ],
    p_idempotency_key: `inv:mature:${inv4.id}`,
    p_entity_type: "investment", p_entity_id: inv4.id,
    p_actor_kind: "SYSTEM", p_initiated_by: uid,
    p_description: "hosted mismatch test" });
  const { data: s4r } = await settle(svc, inv4.id);
  check("mismatched journal → REVIEW_REQUIRED", s4r?.status === "REVIEW_REQUIRED");
  check("no re-post on mismatch", (await matureJournalCount(inv4.id)) === 1);
  const { count: srCount } = await svc.from("outbound_events")
    .select("id", { count: "exact", head: true })
    .eq("aggregate_id", inv4.id).eq("event_type", "investment.settlement_review");
  check("investment.settlement_review outbox written", srCount === 1);

  // ── admin retry path ───────────────────────────────────────────────────────
  console.log("\n== admin ops ==");
  await admin.rpc("admin_resolve_investment_review", {
    p_investment_id: inv4.id, p_to: "SETTLING", p_reason: "inspect settlement anomaly" });
  const { data: ret, error: retErr } = await admin.rpc("admin_retry_settlement", {
    p_investment_id: inv4.id, p_reason: "retry after review", p_request_id: "p7-admin" });
  check("admin_retry_settlement executes", !retErr, errText(retErr));
  check("mismatched journal re-escalates to REVIEW", ret?.status === "REVIEW_REQUIRED", ret?.status);
  const { count: audit } = await svc.from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("entity_id", inv4.id).eq("action", "SETTLEMENT_RETRY");
  check("retry audited", audit === 1);

  const { error: badSettle } = await settle(svc, inv5.id);
  check("settle rejects non-due investment", /ERR_INVESTMENT_NOT_SETTLABLE/.test(errText(badSettle)), errText(badSettle));

  // restore stale threshold
  await svc.from("admin_config").update({ value: 15 })
    .eq("key", "investment.maturity.stale_minutes");

  // persist ids for phase B
  writeFileSync(STATE_FILE, JSON.stringify({ uid, inv5: inv5.id }));
  console.log(`\n  inv5 for detection test: ${inv5.id}`);
  console.log("  Backdate it now (SQL/MCP DO block), e.g.:");
  console.log(`    do $$ begin perform set_config('app.investment_write','1',true);`);
  console.log(`    update public.investments set matures_at = now() - interval '2 hours' where id='${inv5.id}'; end $$;`);
  console.log("  then run: node scripts/verify-hosted-p7.mjs phaseB");
} else {
  // ── phase B: real mark_due_investments detection after backdate ────────────
  if (!existsSync(STATE_FILE)) { console.error("run phaseA first"); process.exit(1); }
  const { uid, inv5 } = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  await signInHealthy(investor, INVESTOR);
  await signInHealthy(admin, ADMIN);

  console.log("\n== detection: mark_due_investments ==");
  const w0 = await walletAvail(uid);
  const { data: marked, error: mErr } = await svc.rpc("mark_due_investments", { p_limit: 100, p_request_id: "p7-hosted-mark" });
  check("mark_due_investments succeeds", !mErr, errText(mErr));
  check("backdated investment marked", marked >= 1, `marked=${marked}`);
  check("status MATURITY_DUE", (await invStatus(inv5)) === "MATURITY_DUE");
  const { count: mo } = await svc.from("outbound_events")
    .select("id", { count: "exact", head: true })
    .eq("aggregate_id", inv5).eq("event_type", "investment.matured");
  check("investment.matured outbox written", mo === 1);

  const { data: claimed } = await svc.rpc("claim_due_investments", { p_limit: 25 });
  check("claim returns the due row", (claimed ?? []).includes(inv5), JSON.stringify(claimed));

  const { data: s5, error: s5e } = await settle(svc, inv5);
  check("settle completes", !s5e && s5?.status === "COMPLETED", errText(s5e));
  check("wallet +maturity", (await walletAvail(uid)) - w0 === MATURITY);

  // ── reconciliation ─────────────────────────────────────────────────────────
  console.log("\n== reconciliation ==");
  const { data: recon, error: rErr } = await admin.rpc("reconcile_investments");
  check("reconcile_investments runs", !rErr, errText(rErr));
  // Each phaseA run leaves one intentional REVIEW_REQUIRED mismatch fixture;
  // earlier runs' fixtures accumulate hosted. Assert every anomaly is the
  // intentional kind rather than an exact count.
  check("only intentional mismatch anomalies remain",
    recon?.length >= 1 && recon.every((x) => x.check_name === "maturity_amount_mismatch"),
    JSON.stringify(recon?.map((x) => x.check_name)));
  const { data: wrecon, error: wErr } = await admin.rpc("reconcile_wallets");
  check("reconcile_wallets clean", !wErr && wrecon.length === 0, JSON.stringify(wrecon?.slice(0, 3)));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
