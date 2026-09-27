/**
 * Phase 8B hosted verification — KYC + manual withdrawals on hosted Supabase,
 * real JWTs, real private Storage, real edge function.
 *
 *   node scripts/verify-hosted-p8.mjs
 *
 * Env (repo-root .env): SUPABASE_URL or PUBLIC_SUPABASE_URL,
 * SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Test users are clearly labeled P8T-* and funded via audited admin
 * adjustments. During the run, withdrawal.min_mode is temporarily flipped to
 * FIXED so the first-withdrawal KYC exception (threshold ₦10,000) is
 * reachable below the dynamic minimum; it is restored to DYNAMIC at the end.
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

const RUN = Date.now();
const INVESTOR = { email: "ada.investor@rentbrown.dev", password: "Investor!Pass1" };
const ADMIN = { email: "tunde.admin@rentbrown.dev", password: "Admin!Pass1" };
// Fresh users per run — the first-withdrawal exception needs accounts with no
// prior withdrawals, so P8T identities are timestamped rather than reused.
const P8T2 = { email: `p8t-i2-${RUN}@rentbrown.dev`, password: "P8t!Pass2222" };
const P8T3 = { email: `p8t-i3-${RUN}@rentbrown.dev`, password: "P8t!Pass3333" };

let passed = 0;
let failed = 0;
const check = (name, cond, extra = "") => {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${extra}`); }
};
const errText = (e) => (e?.message ?? String(e));
const denied = async (name, fn, match = null) => {
  const { error } = await fn();
  check(`${name} denied`, !!error && (!match || match.test(errText(error))), errText(error));
};

// autoRefreshToken OFF: a refresh-token rotation race between parallel calls
// clears the session and silently downgrades subsequent requests to anon
// (surfacing as "permission denied for function"). Tokens outlive this run.
// Per-request auth tracing: logs the Authorization header + status of any
// failed request so a "permission denied" can be attributed to a missing JWT
// (client-side session loss) vs a genuine server denial.
const reqLog = [];
process.on("exit", () => {
  if (reqLog.length) {
    console.log("\nfailed-request auth trace:");
    for (const l of reqLog) console.log(`  ${l}`);
  }
});
// Transport-level JWT recovery: hosted access tokens are short-lived, and an
// expired token is refreshed lazily per request — a failed refresh makes that
// single request fall back to the anon key ("permission denied"/401) while the
// session recovers on the next call. Detect that shape, force a password
// re-sign-in (fresh token + refresh token), and retry the request once.
const clientRegistry = {};
const traceFetch = (name) => async (input, init) => {
  let res = await fetch(input, init);
  const isAuthRpc =
    res.status === 401 ||
    (res.status === 400 && (await res.clone().text()).includes("permission denied"));
  const entry = clientRegistry[name];
  if (isAuthRpc && entry?.creds) {
    // GoTrue rate-limits token endpoints; keep backing off until a fresh
    // session is established rather than letting the request go out as anon.
    // Single-flight per client so parallel requests don't double the calls.
    entry.reauthPromise ??= (async () => {
      try {
        await signInHealthy(entry.client, entry.creds);
      } finally {
        entry.reauthPromise = null;
      }
    })();
    await entry.reauthPromise;
    const { data: s } = await entry.client.auth.getSession();
    if (s?.session) {
      const h = new Headers(init?.headers ?? {});
      h.set("authorization", `Bearer ${s.session.access_token}`);
      res = await fetch(input, { ...init, headers: h });
    }
  }
  if (!res.ok) {
    const h = new Headers(init?.headers ?? {});
    const a = String(h.get("authorization") ?? "none");
    reqLog.push(`${name} ${res.status} ${typeof input === "string" ? input : input.url} auth=…${a.slice(-12)}`);
  }
  return res;
};
const noRefresh = (name) => ({
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: traceFetch(name) },
});
const anonClient = createClient(url, anon, noRefresh("anon"));
const investor = createClient(url, anon, noRefresh("investor"));
const inv2 = createClient(url, anon, noRefresh("inv2"));
const inv3 = createClient(url, anon, noRefresh("inv3"));
const admin = createClient(url, anon, noRefresh("admin"));
clientRegistry.investor = { client: investor, creds: INVESTOR };
clientRegistry.inv2 = { client: inv2, creds: P8T2 };
clientRegistry.inv3 = { client: inv3, creds: P8T3 };
clientRegistry.admin = { client: admin, creds: ADMIN };
const svc = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

const uidOf = async (c) => (await c.auth.getUser()).data.user.id;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Local-clock skew guard: when this machine's clock runs ahead of the auth
// server, every issued session looks already-expired to supabase-js
// (expires_at < local now) → a /token refresh on EVERY getSession() → GoTrue
// rate-limits → failed refresh nulls the session → the request silently goes
// out as anon ("permission denied"). Measure server-vs-local skew once from
// the first sign-in (iat = expires_at − expires_in) and rebase stored
// expires_at into local time. Server-side JWT validation is unaffected.
let CLOCK_SKEW_S = 0;
const signInHealthy = async (client, creds) => {
  for (let i = 0; i < 6; i++) {
    let data, error;
    try {
      ({ data, error } = await client.auth.signInWithPassword(creds));
    } catch (e) {
      error = e; // transient network failure — treated as retryable below
    }
    if (error) {
      if (i === 5 || (!/rate limit|fetch failed|network|timed? ?out/i.test(error.message ?? ""))) {
        throw new Error(`signin ${creds.email}: ${error.message}`);
      }
      await sleep(8000);
      continue;
    }
    const s = data.session;
    if (CLOCK_SKEW_S === 0 && s?.expires_at && s?.expires_in) {
      CLOCK_SKEW_S = Date.now() / 1000 - (s.expires_at - s.expires_in);
      if (Math.abs(CLOCK_SKEW_S) > 120) {
        console.log(`  (local-vs-auth clock skew ≈ ${Math.round(CLOCK_SKEW_S)}s — session times rebased)`);
      }
    }
    if (s?.expires_at && s?.refresh_token && CLOCK_SKEW_S !== 0) {
      await client.auth._saveSession({ ...s, expires_at: s.expires_at + CLOCK_SKEW_S });
    }
    const ttl = (s?.expires_at ?? 0) + CLOCK_SKEW_S - Date.now() / 1000;
    if (ttl > 600) return;
    await sleep(1500);
  }
  throw new Error(`signin ${creds.email}: could not establish a usable session`);
};
// A failed signInWithPassword REPLACES the session with null, so only
// re-authenticate when there is genuinely no session held.
const reauth = async (client, creds) => {
  const { data: s } = await client.auth.getSession();
  if (s?.session) return; // stored sessions are already time-rebased
  await signInHealthy(client, creds);
};
const wallet = async (uid) =>
  (await svc.from("wallets").select("available_minor,reserved_minor").eq("user_id", uid).eq("currency", "NGN").maybeSingle()).data ?? { available_minor: 0, reserved_minor: 0 };
const fund = async (uid, amount, key) => {
  const { error } = await admin.rpc("admin_post_adjustment", {
    p_user_id: uid, p_currency: "NGN", p_bucket: "AVAILABLE",
    p_amount_minor: amount, p_direction: "CREDIT",
    p_reason: `P8T hosted verification funding ${key}`,
    p_idempotency_key: `p8t-fund-${key}` });
  if (error) throw new Error(`funding failed: ${error.message}`);
};
const ensureUser = async ({ email, password }) => {
  const { data: list } = await svc.auth.admin.listUsers({ perPage: 1000 });
  const found = list?.users?.find((u) => u.email === email);
  if (found) return found.id;
  for (let i = 0; i < 5; i++) {
    const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
    if (!error) return data.user.id;
    if (!/rate limit/i.test(error.message ?? "")) throw new Error(`createUser ${email}: ${error.message}`);
    await sleep(6000 * (i + 1));
  }
  throw new Error(`createUser ${email}: rate limit persists`);
};
const requestWd = (c, amount, key, pin, dest = null) =>
  c.rpc("request_withdrawal", {
    p_amount_minor: amount,
    p_destination: dest ?? { bank_name: "GTBank", account_number: "0123456789", account_name: "P8T Test" },
    p_idempotency_key: key, p_pin: pin });
const efDocUrl = async (client, submissionId, kind) => {
  const { data: sess } = await client.auth.getSession();
  const res = await fetch(`${url}/functions/v1/kyc-document-url`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${sess?.session?.access_token ?? ""}` },
    body: JSON.stringify({ submission_id: submissionId, kind }),
  });
  return res;
};

// ══ 0. Setup ════════════════════════════════════════════════════════════════
await reauth(investor, INVESTOR);
await reauth(admin, ADMIN);
const uidA = await uidOf(investor);
const uid2 = await ensureUser(P8T2);
const uid3 = await ensureUser(P8T3);
await signInHealthy(inv2, P8T2);
await reauth(inv3, P8T3);
check("P8T fixtures ready", !!uidA && !!uid2 && !!uid3);

// ══ 1. Denials ══════════════════════════════════════════════════════════════
console.log("\n== denials ==");
await denied("anon kyc_get_own", () => anonClient.rpc("kyc_get_own"));
await denied("anon kyc_save_draft", () => anonClient.rpc("kyc_save_draft", { p_full_legal_name: "X" }));
await denied("anon quote_withdrawal", () => anonClient.rpc("quote_withdrawal", { p_amount_minor: 100 }));
await denied("anon request_withdrawal", () =>
  anonClient.rpc("request_withdrawal", { p_amount_minor: 100, p_destination: {}, p_idempotency_key: "x" }));
await denied("anon admin_list_kyc_cases", () => anonClient.rpc("admin_list_kyc_cases"));
await denied("investor admin_list_kyc_cases", () => inv2.rpc("admin_list_kyc_cases"));
await denied("investor admin_decide_kyc", () =>
  inv2.rpc("admin_decide_kyc", { p_submission_id: uidA, p_decision: "APPROVE" }));
await denied("investor admin_list_withdrawals", () => inv2.rpc("admin_list_withdrawals"));
await denied("investor decide_withdrawal", () =>
  inv2.rpc("decide_withdrawal", { p_withdrawal_id: uidA, p_decision: "APPROVE" }));
await denied("investor reconcile_withdrawals", () => inv2.rpc("reconcile_withdrawals"));

// ══ 2. Transaction PIN (ada) ════════════════════════════════════════════════
console.log("\n== transaction PIN ==");
{
  const { error } = await investor.rpc("set_transaction_pin", { p_pin: "12345" });
  check("5-digit pin rejected", !!error && /ERR_PIN/.test(errText(error)), errText(error));
  const { error: setErr } = await investor.rpc("set_transaction_pin", { p_pin: "242424" });
  check("pin set", !setErr, errText(setErr));
  const { data: ok } = await investor.rpc("verify_transaction_pin", { p_pin: "242424" });
  check("correct pin verifies", ok === true);
  for (let i = 0; i < 5; i++) {
    const { data } = await investor.rpc("verify_transaction_pin", { p_pin: "000000" });
    check(`bad pin attempt ${i + 1} counted (returns false)`, data === false);
  }
  const { error: lockErr } = await investor.rpc("verify_transaction_pin", { p_pin: "242424" });
  check("pin locked after max attempts", !!lockErr && /ERR_PIN_LOCKED/.test(errText(lockErr)), errText(lockErr));
  const { error: reSet } = await investor.rpc("set_transaction_pin", { p_pin: "242424" });
  check("re-setting pin clears lockout", !reSet, errText(reSet));
  const { data: ok2 } = await investor.rpc("verify_transaction_pin", { p_pin: "242424" });
  check("pin verifies after reset", ok2 === true);
  const { error: selErr } = await investor.from("user_pins").select("*");
  check("user_pins not client-readable", !!selErr, errText(selErr));
}

// ══ 3. KYC lifecycle (ada) ══════════════════════════════════════════════════
console.log("\n== KYC lifecycle ==");
let subA;
{
  const { data: s0 } = await investor.rpc("kyc_get_own");
  if (s0?.status === "VERIFIED") {
    // re-run: ada is already verified — assert the stable end-state instead
    check("kyc already VERIFIED (re-run)", s0?.submission?.status === "VERIFIED");
    subA = s0.submission;
    const { data: prof } = await svc.from("profiles").select("kyc_verified").eq("id", uidA).single();
    check("profile projection synced", prof?.kyc_verified === true);
  } else {
  check("fresh kyc status NOT_STARTED", s0?.status === "NOT_STARTED", JSON.stringify(s0));

  const { data: d, error: dErr } = await investor.rpc("kyc_save_draft", {
    p_full_legal_name: "Ada Okafor", p_gender: "FEMALE",
    p_bvn: "22222222222", p_poa_type: "UTILITY_BILL" });
  check("draft created", !dErr && d?.status === "DRAFT", errText(dErr));
  subA = d;

  // real private-storage uploads under <uid>/<submission>/…
  const blob = new Blob(["P8T test document bytes"], { type: "image/jpeg" });
  const up1 = await investor.storage.from("kyc-documents").upload(`${uidA}/${subA.id}/selfie.jpg`, blob);
  const up2 = await investor.storage.from("kyc-documents").upload(`${uidA}/${subA.id}/poa.pdf`,
    new Blob(["P8T poa"], { type: "application/pdf" }));
  check("owner uploads evidence to own draft path", !up1.error && !up2.error,
    `${errText(up1.error)} ${errText(up2.error)}`);

  const badUp = await inv2.storage.from("kyc-documents").upload(`${uidA}/${subA.id}/evil.jpg`, blob);
  check("foreign-prefix upload denied", !!badUp.error, errText(badUp.error));

  const { error: bvnErr } = await investor.rpc("kyc_save_draft", { p_bvn: "12345" });
  check("bad bvn rejected", !!bvnErr && /ERR_BVN/.test(errText(bvnErr)), errText(bvnErr));
  const { error: pathErr } = await investor.rpc("kyc_save_draft", {
    p_selfie_path: `${uid2}/x/selfie.jpg` });
  check("foreign storage path rejected", !!pathErr && /ERR_STORAGE/.test(errText(pathErr)), errText(pathErr));

  const { data: d2 } = await investor.rpc("kyc_save_draft", {
    p_selfie_path: `${uidA}/${subA.id}/selfie.jpg`,
    p_poa_path: `${uidA}/${subA.id}/poa.pdf` });
  check("evidence paths recorded", d2?.selfie_path?.includes(subA.id) === true);

  const { data: sub1, error: subErr } = await investor.rpc("kyc_submit", { p_submission_id: subA.id });
  check("submission SUBMITTED", !subErr && sub1?.status === "SUBMITTED", errText(subErr));

  const { error: editErr } = await investor.rpc("kyc_save_draft", { p_full_legal_name: "Hack" });
  check("submitted evidence locked", !!editErr && /ERR_KYC_STATE/.test(errText(editErr)), errText(editErr));

  const { data: queue } = await admin.rpc("admin_list_kyc_cases", { p_queue: "PENDING" });
  check("admin queue shows pending case", (queue ?? []).some((x) => x.id === subA.id));
  check("queue bvn masked", (queue ?? []).every((x) =>
    !x.document_number_masked || x.document_number_masked.startsWith("***")));

  const { data: detail } = await admin.rpc("admin_get_kyc_case", { p_submission_id: subA.id });
  check("reviewer sees full bvn", detail?.bvn === "22222222222", detail?.bvn);
  check("case has event trail", Array.isArray(detail?.events) && detail.events.length >= 2);

  const { data: colDeny } = await investor.from("kyc_submissions").select("bvn");
  check("bvn column restricted to clients", colDeny === null);

  const { data: ownRows } = await inv2.from("kyc_submissions").select("id");
  check("cross-user submission isolation", (ownRows ?? []).length === 0);

  const { error: selfApprove } = await investor.rpc("admin_decide_kyc",
    { p_submission_id: subA.id, p_decision: "APPROVE" });
  check("investor cannot self-approve", !!selfApprove);

  const { data: approved, error: aErr } = await admin.rpc("admin_decide_kyc", {
    p_submission_id: subA.id, p_decision: "APPROVE",
    p_reason: "documents verified", p_request_id: "p8t-kyc-a" });
  check("kyc VERIFIED via reviewer", !aErr && approved?.status === "VERIFIED", errText(aErr));

  const { data: prof } = await svc.from("profiles").select("kyc_verified,kyc_verified_at").eq("id", uidA).single();
  check("profile projection synced", prof?.kyc_verified === true && !!prof?.kyc_verified_at);

  const { data: evTrail } = await svc.from("kyc_events").select("to_status")
    .eq("submission_id", subA.id).order("id");
  check("event trail DRAFT→SUBMITTED→UNDER_REVIEW→VERIFIED",
    evTrail?.map((x) => x.to_status).join(",") === "DRAFT,SUBMITTED,UNDER_REVIEW,VERIFIED",
    JSON.stringify(evTrail?.map((x) => x.to_status)));

  const { count: auditC } = await svc.from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("entity_id", subA.id).eq("action", "kyc.approve");
  check("kyc approval audited", auditC === 1);
  }
}

// signed-URL edge function
{
  const res = await efDocUrl(investor, subA.id, "selfie");
  check("owner gets signed url", res.status === 200, `status=${res.status}`);
  const { url: signedUrl } = res.ok ? await res.json() : {};
  check("signed url is a storage token url", !!signedUrl && signedUrl.includes("/object/sign/kyc-documents/"));
  const doc = await fetch(signedUrl);
  check("signed url fetches document", doc.status === 200, `status=${doc.status}`);
  const res2 = await efDocUrl(inv2, subA.id, "selfie");
  check("non-owner non-reviewer denied", res2.status === 403, `status=${res2.status}`);
  const res3 = await efDocUrl(admin, subA.id, "poa");
  check("reviewer gets signed url", res3.status === 200, `status=${res3.status}`);
  const res4 = await efDocUrl(anonClient, subA.id, "selfie");
  check("anon denied", res4.status === 401, `status=${res4.status}`);
}

// ══ 4. KYC reject → resubmit (investor2) ════════════════════════════════════
console.log("\n== KYC reject + resubmit ==");
{
  const { data: d } = await inv2.rpc("kyc_save_draft", {
    p_full_legal_name: "P8T Two", p_gender: "OTHER", p_bvn: "33333333333", p_poa_type: "BANK_STATEMENT" });
  const blob = new Blob(["P8T two docs"], { type: "image/jpeg" });
  await inv2.storage.from("kyc-documents").upload(`${uid2}/${d.id}/selfie.jpg`, blob);
  await inv2.storage.from("kyc-documents").upload(`${uid2}/${d.id}/poa.pdf`, blob);
  await inv2.rpc("kyc_save_draft", {
    p_selfie_path: `${uid2}/${d.id}/selfie.jpg`, p_poa_path: `${uid2}/${d.id}/poa.pdf` });
  await inv2.rpc("kyc_submit", { p_submission_id: d.id });
  const { error: noReason } = await admin.rpc("admin_decide_kyc", {
    p_submission_id: d.id, p_decision: "REJECT" });
  check("reject requires reason", !!noReason, errText(noReason));
  const { data: rej } = await admin.rpc("admin_decide_kyc", {
    p_submission_id: d.id, p_decision: "REJECT", p_reason: "document unreadable" });
  check("kyc REJECTED with reason", rej?.status === "REJECTED" && rej?.rejection_reason === "document unreadable");
  const { data: d2 } = await inv2.rpc("kyc_save_draft", { p_poa_type: "UTILITY_BILL" });
  check("resubmission opens attempt 2", d2?.attempt_no === 2 && d2?.status === "DRAFT" && d2?.id !== d.id);
  const { data: old } = await svc.from("kyc_submissions").select("status").eq("id", d.id).single();
  check("old attempt SUPERSEDED", old?.status === "SUPERSEDED");
}

// ══ 5. First-withdrawal KYC exception (investor2) ═══════════════════════════
console.log("\n== first-withdrawal KYC exception ==");
await reauth(inv2, P8T2);
await reauth(admin, ADMIN);
// Dynamic min (cheapest plan slot maturity) exceeds the ₦10,000 exception
// threshold, so the exception window is exercised under FIXED mode, then restored.
await svc.from("admin_config").update({ value: "FIXED" }).eq("key", "withdrawal.min_mode");
{
  const { data: minR } = await investor.rpc("min_withdrawal_minor", { p_currency: "NGN" });
  check("fixed minimum engaged", Number(minR) === 500000, String(minR));

  const { error: pinErr } = await inv2.rpc("set_transaction_pin", { p_pin: "135792" });
  check("inv2 pin set", !pinErr, errText(pinErr));
  await fund(uid2, 5_000_000, `i2-${RUN}`);
  check("inv2 funded ₦50,000", true);

  const { data: q } = await inv2.rpc("quote_withdrawal", { p_amount_minor: 800_000 });
  check("quote flags first-withdrawal exemption",
    q?.first_withdrawal === true && q?.kyc_exempt === true && q?.eligible === true && q?.kyc_verified === false,
    JSON.stringify(q));

  const { error: at } = await requestWd(inv2, 1_000_000, "p8t-i2-at-threshold", "135792");
  check("amount == ₦10,000 threshold requires KYC", !!at && /ERR_KYC/.test(errText(at)), errText(at));

  const { data: w1, error: w1Err } = await requestWd(inv2, 800_000, "p8t-i2-first", "135792");
  check("first withdrawal below threshold needs no KYC", !w1Err && w1?.status === "REQUESTED", errText(w1Err));

  const { data: w1r, error: w1rErr } = await requestWd(inv2, 800_000, "p8t-i2-first", "135792");
  check("idempotent retry returns same withdrawal", !w1rErr && w1r?.id === w1?.id, errText(w1rErr));

  const { error: w2Err } = await requestWd(inv2, 800_000, "p8t-i2-second", "135792");
  check("second withdrawal requires KYC", !!w2Err && /ERR_KYC/.test(errText(w2Err)), errText(w2Err));

  // admin decline → hold released; declined withdrawal still consumes the exception
  const { data: wDec } = await admin.rpc("decide_withdrawal", {
    p_withdrawal_id: w1.id, p_decision: "REJECT", p_reason: "P8T decline test" });
  check("admin decline → REJECTED", wDec?.status === "REJECTED" && !!wDec?.release_journal_id);
  const w2wal = await wallet(uid2);
  check("hold released to available", w2wal.available_minor === 5_000_000 && w2wal.reserved_minor === 0,
    JSON.stringify(w2wal));

  const { error: w3Err } = await requestWd(inv2, 800_000, "p8t-i2-third", "135792");
  check("declined first withdrawal still consumes exception", !!w3Err && /ERR_KYC/.test(errText(w3Err)), errText(w3Err));

  const { count: evC } = await svc.from("outbound_events")
    .select("id", { count: "exact", head: true })
    .eq("aggregate_id", w1.id);
  check("requested + rejected outbox events", evC === 2, `count=${evC}`);
}
await svc.from("admin_config").update({ value: "DYNAMIC" }).eq("key", "withdrawal.min_mode");

// ══ 6. Concurrency — first-withdrawal race + double spend ═══════════════════
console.log("\n== concurrency ==");
await reauth(inv3, P8T3);
{
  const { error: pinErr } = await inv3.rpc("set_transaction_pin", { p_pin: "246810" });
  check("inv3 pin set", !pinErr, errText(pinErr));
  await fund(uid3, 5_000_000, `i3-${Date.now()}`);
  // temporarily under FIXED window already restored — use svc flip for the race
  await svc.from("admin_config").update({ value: "FIXED" }).eq("key", "withdrawal.min_mode");
  const [rA, rB] = await Promise.all([
    requestWd(inv3, 800_000, "p8t-i3-race-a", "246810"),
    requestWd(inv3, 800_000, "p8t-i3-race-b", "246810"),
  ]);
  const { count } = await svc.from("withdrawals")
    .select("id", { count: "exact", head: true }).eq("user_id", uid3);
  check("concurrent first withdrawals — exactly one persists", count === 1, `rows=${count}`);
  const loser = [rA, rB].find((x) => x.error);
  check("loser got ERR_KYC", !!loser && /ERR_KYC/.test(errText(loser.error)), errText(loser?.error));

  // leave inv3's winning withdrawal tidy: decline it (also proves release)
  const { data: w3row } = await svc.from("withdrawals").select("id").eq("user_id", uid3).maybeSingle();
  if (w3row) {
    await admin.rpc("decide_withdrawal", { p_withdrawal_id: w3row.id, p_decision: "REJECT", p_reason: "P8T race cleanup" });
  }
  await svc.from("admin_config").update({ value: "DYNAMIC" }).eq("key", "withdrawal.min_mode");

  // double-spend: ada (KYC-verified). Tidy any lingering REQUESTED rows from
  // earlier runs first, then race two asks each > half her available balance —
  // exactly one can be reserved, proving no double-spend.
  await reauth(admin, ADMIN);
  const { data: pend } = await svc.from("withdrawals").select("id")
    .eq("user_id", uidA).eq("status", "REQUESTED");
  for (const w of pend ?? []) {
    await admin.rpc("decide_withdrawal", { p_withdrawal_id: w.id, p_decision: "REJECT", p_reason: "P8T cleanup" });
  }
  const adaW = await wallet(uidA);
  const need = 10_000_000 - adaW.available_minor;
  if (need > 0) await fund(uidA, need, `ada-${RUN}`);
  await reauth(investor, INVESTOR);
  const adaAvail = (await wallet(uidA)).available_minor;
  const ask = adaAvail - 1_000_000;
  const [dA, dB] = await Promise.all([
    requestWd(investor, ask, `p8t-ada-race-a-${RUN}`, "242424"),
    requestWd(investor, ask, `p8t-ada-race-b-${RUN}`, "242424"),
  ]);
  const winners = [dA, dB].filter((x) => !x.error);
  check("concurrent spend — exactly one withdrawal", winners.length === 1,
    `${errText(dA.error)} / ${errText(dB.error)}`);
  var adaWd = winners[0].data;
  var adaAsk = ask;
}

// ══ 7. Withdrawal settle + outbox (ada) ═════════════════════════════════════
console.log("\n== withdrawal settle ==");
{
  await reauth(admin, ADMIN);
  const { data: minD } = await investor.rpc("min_withdrawal_minor", { p_currency: "NGN" });
  const { data: plans } = await svc.from("investment_plans")
    .select("slot_price_minor,roi_bps").eq("status", "PUBLISHED").eq("currency", "NGN");
  const dynExpected = Math.min(
    ...(plans ?? []).map((p) => Math.floor(p.slot_price_minor * (10000 + p.roi_bps) / 10000)));
  check("dynamic minimum = cheapest plan slot maturity",
    Number(minD) === dynExpected, `min=${minD} expected=${dynExpected}`);

  const { error: badPin } = await requestWd(investor, adaAsk, `p8t-ada-badpin-${RUN}`, "000000");
  check("wrong pin rejected", !!badPin && /ERR_PIN/.test(errText(badPin)), errText(badPin));

  const { error: big } = await requestWd(investor, 999_999_999, `p8t-ada-big-${RUN}`, "242424");
  check("insufficient balance rejected", !!big, errText(big));

  const w0 = await wallet(uidA);
  await admin.rpc("decide_withdrawal", { p_withdrawal_id: adaWd.id, p_decision: "APPROVE" });
  await admin.rpc("decide_withdrawal", { p_withdrawal_id: adaWd.id, p_decision: "PROCESSING" });
  const { data: paid, error: pErr } = await admin.rpc("decide_withdrawal", {
    p_withdrawal_id: adaWd.id, p_decision: "MARK_PAID", p_reason: "P8T paid via transfer", p_request_id: "p8t-pay" });
  check("withdrawal COMPLETED", !pErr && paid?.status === "COMPLETED" && !!paid?.payout_journal_id, errText(pErr));

  const { data: payJ } = await svc.from("journal_entries").select("journal_type")
    .eq("id", paid.payout_journal_id).single();
  check("EXTERNAL_PAYOUT journal linked", payJ?.journal_type === "EXTERNAL_PAYOUT");
  const wAfter = await wallet(uidA);
  check("reserved debited on payout", wAfter.reserved_minor === w0.reserved_minor - adaAsk
    && wAfter.available_minor === w0.available_minor, JSON.stringify({ w0, wAfter }));

  const { data: evs } = await svc.from("outbound_events").select("event_type")
    .eq("aggregate_id", adaWd.id);
  check("withdrawal.requested + withdrawal.completed outbox",
    evs?.some((x) => x.event_type === "withdrawal.requested")
    && evs?.some((x) => x.event_type === "withdrawal.completed"),
    JSON.stringify(evs));

  const { count: auditW } = await svc.from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("entity_id", adaWd.id).eq("action", "withdrawal.mark_paid");
  check("mark_paid audited", auditW === 1);

  const { data: det } = await admin.rpc("admin_get_withdrawal", { p_withdrawal_id: adaWd.id });
  check("admin detail has timeline+outbound",
    Array.isArray(det?.events) && Array.isArray(det?.outbound) && det?.outbound?.length >= 2);
  const { data: wq } = await admin.rpc("admin_list_withdrawals", { p_status: "COMPLETED" });
  check("admin queue lists completed withdrawal", (wq ?? []).some((x) => x.id === adaWd.id));
}

// ══ 8. Saved bank accounts ══════════════════════════════════════════════════
console.log("\n== bank accounts ==");
{
  await reauth(investor, INVESTOR);
  const { data: ba, error: baErr } = await investor.rpc("save_bank_account", {
    p_bank_name: "GTBank", p_bank_code: "058",
    p_account_number: "0123456789", p_account_name: "Ada Okafor", p_make_default: true });
  check("bank account saved", !baErr && ba?.is_default === true, errText(baErr));
  const { data: list } = await investor.from("user_bank_accounts").select("id,is_default");
  check("owner lists own bank accounts",
    (list ?? []).some((x) => x.id === ba.id && x.is_default === true));
  const { data: cross } = await inv2.from("user_bank_accounts").select("id")
    .eq("id", ba.id);
  check("cross-user bank isolation", (cross ?? []).length === 0);
  const { error: arch } = await inv2.rpc("archive_bank_account", { p_id: ba.id });
  check("cross-user archive denied", !!arch, errText(arch));
}

// ══ 9. Reconciliation ═══════════════════════════════════════════════════════
console.log("\n== reconciliation ==");
{
  const { data: wrec, error: wrErr } = await admin.rpc("reconcile_withdrawals");
  check("reconcile_withdrawals runs clean", !wrErr && (wrec ?? []).length === 0,
    `${errText(wrErr)} ${JSON.stringify(wrec?.map((x) => x.check_name))}`);
  const { data: krec, error: krErr } = await admin.rpc("reconcile_kyc");
  check("reconcile_kyc runs clean", !krErr && (krec ?? []).length === 0,
    `${errText(krErr)} ${JSON.stringify(krec?.map((x) => x.check_name))}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
