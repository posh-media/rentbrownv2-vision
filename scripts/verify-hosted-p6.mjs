/**
 * Phase 6B hosted verification — real JWT claims against hosted Supabase.
 *
 *   node scripts/verify-hosted-p6.mjs
 *
 * Env (repo-root .env): SUPABASE_URL or PUBLIC_SUPABASE_URL,
 * SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Uses the seeded dev users (scripts/seed-users.mjs):
 *   ada.investor@rentbrown.dev  — investor (no admin role)
 *   tunde.admin@rentbrown.dev — FINANCE_ADMIN
 *
 * Money effects on the hosted project are real: the test buys 2 Bodija slots
 * (~₦20,000) funded via an audited admin_post_adjustment when needed. No
 * schema changes, no direct table writes from this script.
 */
import { readFileSync } from "node:fs";
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

const INVESTOR = { email: "ada.investor@rentbrown.dev", password: "Investor!Pass1" };
const ADMIN = { email: "tunde.admin@rentbrown.dev", password: "Admin!Pass1" };

let passed = 0;
let failed = 0;
const check = (name, cond, extra = "") => {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${extra}`); }
};
const errText = (e) => (e?.message ?? String(e));

const anonClient = createClient(url, anon, { auth: { persistSession: false } });
const investor = createClient(url, anon, { auth: { persistSession: false } });
const admin = createClient(url, anon, { auth: { persistSession: false } });
const svc = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

// ── 1. Anon is rejected everywhere ────────────────────────────────────────────
console.log("\n== anon denials ==");
{
  const { error } = await anonClient.rpc("list_opportunities");
  check("anon list_opportunities denied", !!error, errText(error));
  const { error: e2 } = await anonClient.rpc("request_investment", {
    p_round_id: "00000000-0000-0000-0000-000000000000", p_slots: 1, p_idempotency_key: "x",
  });
  check("anon request_investment denied", !!e2, errText(e2));
  const { error: e3 } = await anonClient.rpc("admin_list_investments");
  check("anon admin_list_investments denied", !!e3, errText(e3));
}

// ── 2. Investor sign-in + catalogue ───────────────────────────────────────────
console.log("\n== investor: catalogue + quote ==");
{
  const { error } = await investor.auth.signInWithPassword(INVESTOR);
  check("investor sign-in", !error, errText(error));
}
const oppsRes = await investor.rpc("list_opportunities");
check("list_opportunities succeeds", !oppsRes.error, errText(oppsRes.error));
const opps = oppsRes.data ?? [];
const seedSlugs = ["the-terraces-ikoyi", "palm-court-lekki", "wuse-square-residences", "harbour-view-suites", "bodija-gardens", "maitama-heights"];
for (const s of seedSlugs) check(`seeded opportunity: ${s}`, opps.some((o) => o.property.slug === s));

const bySlug = (s) => opps.find((o) => o.property.slug === s);
const bodija = bySlug("bodija-gardens");
const terraces = bySlug("the-terraces-ikoyi");
const wuse = bySlug("wuse-square-residences");
const maitama = bySlug("maitama-heights");

{
  const { data: q, error } = await investor.rpc("investment_quote", { p_round_id: bodija.round.id, p_slots: 2 });
  check("investment_quote succeeds", !error, errText(error));
  check("quote principal = 2 × ₦10,000", q?.principal_minor === 2_000_000, JSON.stringify(q?.principal_minor));
  check("quote profit floor(13% × 2m) = 260k kobo", q?.expected_profit_minor === 260_000, JSON.stringify(q?.expected_profit_minor));
  check("quote maturity = principal+profit", q?.maturity_value_minor === 2_260_000);
  check("quote wallet funding option present", q?.funding_options?.[0]?.source === "WALLET");
  check("quote marks external sources unavailable", q?.funding_options?.every((f) => f.source === "WALLET" || !f.available));
}

// ── 3. Investor write guards + role gates ─────────────────────────────────────
console.log("\n== investor: guards + role gates ==");
{
  const { error } = await investor.rpc("admin_list_investments");
  check("investor admin_list_investments → not authorized", !!error && /not authorized/i.test(errText(error)), errText(error));
  const { error: e2 } = await investor.from("investments").insert({ user_id: investor.user?.id });
  check("direct investments INSERT blocked", !!e2, errText(e2));
  const { error: e3 } = await investor.rpc("request_investment", {
    p_round_id: bodija.round.id, p_slots: 2, p_idempotency_key: `bank-${Date.now()}`, p_funding_source: "BANK_TRANSFER",
  });
  check("BANK_TRANSFER → ERR_FUNDING_SOURCE", /ERR_FUNDING_SOURCE/.test(errText(e3)), errText(e3));
  const { error: e4 } = await investor.rpc("request_investment", {
    p_round_id: wuse.round.id, p_slots: 5, p_idempotency_key: `soldout-${Date.now()}`,
  });
  check("SOLD_OUT round → ERR_ROUND_NOT_OPEN", /ERR_ROUND_NOT_OPEN/.test(errText(e4)), errText(e4));
  const { error: e5 } = await investor.rpc("request_investment", {
    p_round_id: maitama.round.id, p_slots: 1, p_idempotency_key: `sched-${Date.now()}`,
  });
  check("SCHEDULED round → ERR_ROUND_NOT_OPEN", /ERR_ROUND_NOT_OPEN/.test(errText(e5)), errText(e5));
}

// ── 4. Fund the wallet via the audited admin path (if needed) ─────────────────
console.log("\n== wallet funding (audited admin adjustment) ==");
const { data: me } = await investor.auth.getUser();
const uid = me.user.id;
let { data: wallet } = await investor.from("wallets").select("available_minor").eq("currency", "NGN").maybeSingle();
const NEED = 50_000_000; // ₦500,000 head-room for the purchase + failure tests
if ((wallet?.available_minor ?? 0) < NEED) {
  const { error } = await admin.auth.signInWithPassword(ADMIN);
  check("admin sign-in", !error, errText(error));
  const delta = NEED - (wallet?.available_minor ?? 0);
  const { error: adjErr } = await admin.rpc("admin_post_adjustment", {
    p_user_id: uid, p_currency: "NGN", p_bucket: "AVAILABLE", p_amount_minor: delta,
    p_direction: "CREDIT", p_reason: "Phase 6B hosted verification funding",
    p_idempotency_key: `p6-verify-fund-${uid.slice(0, 8)}`,
  });
  check("admin_post_adjustment funded wallet", !adjErr, errText(adjErr));
  ({ data: wallet } = await investor.from("wallets").select("available_minor").eq("currency", "NGN").maybeSingle());
}
const walletBefore = wallet?.available_minor ?? 0;
check("wallet funded for test", walletBefore >= 2_000_000, `available=${walletBefore}`);

// ── 5. Happy path — atomic wallet-funded purchase ─────────────────────────────
console.log("\n== purchase: happy path ==");
const { data: roundBefore } = await svc.from("investment_rounds").select("allocated_slots,status").eq("id", bodija.round.id).single();
const idem = `p6-hosted-${Date.now()}`;
const { data: inv, error: invErr } = await investor.rpc("request_investment", {
  p_round_id: bodija.round.id, p_slots: 2, p_idempotency_key: idem,
});
check("request_investment succeeds", !invErr, errText(invErr));
check("status ACTIVE", inv?.status === "ACTIVE", inv?.status);
check("snapshot principal 2,000,000", inv?.principal_minor === 2_000_000);
check("snapshot profit 260,000", inv?.expected_profit_minor === 260_000);
check("maturity_value 2,260,000", inv?.maturity_value_minor === 2_260_000);
check("funding_source WALLET", inv?.funding_source === "WALLET");
const termMs = inv ? new Date(inv.matures_at) - new Date(inv.activated_at) : 0;
check("matures_at = activated + 4380h", Math.abs(termMs - 4380 * 3_600_000) < 60_000, `${termMs}ms`);

const { data: roundAfter } = await svc.from("investment_rounds").select("allocated_slots,status").eq("id", bodija.round.id).single();
check("capacity allocated +2", roundAfter.allocated_slots === roundBefore.allocated_slots + 2, `${roundBefore.allocated_slots}→${roundAfter.allocated_slots}`);

const { data: walletAfter } = await investor.from("wallets").select("available_minor,reserved_minor").eq("currency", "NGN").maybeSingle();
check("wallet debited exactly principal", walletAfter.available_minor === walletBefore - 2_000_000 && walletAfter.reserved_minor === 0, JSON.stringify(walletAfter));

const { data: events } = await investor.from("investment_events").select("event_type").eq("investment_id", inv.id);
check("3 lifecycle events (CREATED/PAYMENT_CONFIRMED/ACTIVATED)",
  events?.length === 3 && ["CREATED", "PAYMENT_CONFIRMED", "ACTIVATED"].every((t) => events.some((e) => e.event_type === t)),
  JSON.stringify(events?.map((e) => e.event_type)));

const { data: journals } = await investor.from("journal_entries").select("journal_type").eq("entity_type", "investment").eq("entity_id", inv.id);
check("HOLD + INVESTMENT_DEBIT journals",
  journals?.length === 2 && journals.some((j) => j.journal_type === "HOLD") && journals.some((j) => j.journal_type === "INVESTMENT_DEBIT"),
  JSON.stringify(journals?.map((j) => j.journal_type)));

// ── 6. Idempotency ────────────────────────────────────────────────────────────
console.log("\n== idempotency ==");
{
  const { data: replay, error } = await investor.rpc("request_investment", {
    p_round_id: bodija.round.id, p_slots: 2, p_idempotency_key: idem,
  });
  check("replay same key+params returns same investment", !error && replay?.id === inv.id, errText(error));
  const { data: w2 } = await investor.from("wallets").select("available_minor").eq("currency", "NGN").maybeSingle();
  check("replay did not double-debit", w2.available_minor === walletAfter.available_minor);
  const { data: j2 } = await investor.from("journal_entries").select("id").eq("entity_type", "investment").eq("entity_id", inv.id);
  check("replay did not duplicate journals", j2.length === 2);

  const { error: conflict } = await investor.rpc("request_investment", {
    p_round_id: bodija.round.id, p_slots: 3, p_idempotency_key: idem,
  });
  check("same key + different params → ERR_IDEMPOTENCY_CONFLICT", /ERR_IDEMPOTENCY_CONFLICT/.test(errText(conflict)), errText(conflict));
}

// ── 7. Insufficient balance — no side effects ────────────────────────────────
console.log("\n== insufficient balance ==");
{
  const { data: r0 } = await svc.from("investment_rounds").select("allocated_slots").eq("id", terraces.round.id).single();
  const { error } = await investor.rpc("request_investment", {
    p_round_id: terraces.round.id, p_slots: 45, p_idempotency_key: `poor-${Date.now()}`,
  });
  check("ERR_INSUFFICIENT_BALANCE", /ERR_INSUFFICIENT_BALANCE/.test(errText(error)), errText(error));
  const { data: r1 } = await svc.from("investment_rounds").select("allocated_slots").eq("id", terraces.round.id).single();
  check("no capacity leaked on failure", r1.allocated_slots === r0.allocated_slots);
}

// ── 8. Per-user limit ─────────────────────────────────────────────────────────
{
  const { error } = await investor.rpc("request_investment", {
    p_round_id: bodija.round.id, p_slots: 400, p_idempotency_key: `limit-${Date.now()}`,
  });
  check("over max_slots_per_user → ERR_INVESTMENT_LIMIT_EXCEEDED", /ERR_INVESTMENT_LIMIT_EXCEEDED/.test(errText(error)), errText(error));
}

// ── 9. Admin surface + reconciliation ─────────────────────────────────────────
console.log("\n== admin ==");
{
  const { data: sess } = await admin.auth.getSession();
  if (!sess.session) await admin.auth.signInWithPassword(ADMIN);
  const { data: list, error } = await admin.rpc("admin_list_investments", { p_limit: 20 });
  check("admin_list_investments works for FINANCE_ADMIN", !error, errText(error));
  check("new investment visible to admin", list?.some((r) => r.id === inv.id));

  const { data: detail, error: dErr } = await admin.rpc("admin_investment_detail", { p_investment_id: inv.id });
  check("admin_investment_detail works", !dErr, errText(dErr));
  check("detail carries 3 events", detail?.events?.length === 3);
  check("detail carries HOLD + INVESTMENT_DEBIT journals",
    (detail?.journals ?? []).map((j) => j.journal_type).sort().join(",") === "HOLD,INVESTMENT_DEBIT",
    JSON.stringify(detail?.journals?.map((j) => j.journal_type)));

  const { data: recon, error: rErr } = await admin.rpc("reconcile_investments");
  check("reconcile_investments clean", !rErr && recon.length === 0, errText(rErr) + JSON.stringify(recon?.slice(0, 3)));

  const { data: wrecon, error: wErr } = await admin.rpc("reconcile_wallets");
  check("reconcile_wallets clean", !wErr && wrecon.length === 0, errText(wErr) + JSON.stringify(wrecon?.slice(0, 3)));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
