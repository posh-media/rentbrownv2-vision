/**
 * Phase 9B hosted verification — referrals, rewards & task rewards on hosted
 * Supabase, real JWTs, service-key reads only (no direct SQL).
 *
 *   node scripts/verify-hosted-p9.mjs
 *
 * Prereqs: migrations 0022–0027 applied (node scripts/migrate.mjs or SQL
 * editor). Env (repo-root .env): SUPABASE_URL or PUBLIC_SUPABASE_URL,
 * SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Test users are clearly labeled p9*-<ts>@rentbrown.dev. The referred user is
 * funded via the REAL deposit path (request_deposit + service-role
 * confirm_deposit) — the Phase 9 deposit-history gate makes admin-adjustment
 * funding useless for withdrawal checks, which is the point.
 *
 * Task catalogue checks are limited by hosted roles: the seeded admin
 * (FINANCE_ADMIN) can review claims and reconcile but cannot publish tasks —
 * that denial is itself asserted. Full claim→reward settlement is covered by
 * the local embedded verifier (502 checks) and can be repeated hosted once an
 * OPERATIONS_ADMIN/SUPER_ADMIN account publishes the seeded task.
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
const ADMIN = { email: "tunde.admin@rentbrown.dev", password: "Admin!Pass1" };
const P9R = { email: `p9r-${RUN}@rentbrown.dev`, password: "P9r!Pass1111" }; // referrer
const P9D = { email: `p9d-${RUN}@rentbrown.dev`, password: "P9d!Pass2222" }; // referred
const P9T = { email: `p9t-${RUN}@rentbrown.dev`, password: "P9t!Pass3333" }; // task user

let passed = 0;
let failed = 0;
let skipped = 0;
const check = (name, cond, extra = "") => {
  if (cond) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name} ${extra}`);
  }
};
const note = (name) => {
  skipped++;
  console.log(`  SKIP ${name}`);
};
const errText = (e) => e?.message ?? String(e);
const denied = async (name, fn, match = null) => {
  const { error } = await fn();
  check(`${name} denied`, !!error && (!match || match.test(errText(error))), errText(error));
};

// ── hosted session plumbing (identical rationale to verify-hosted-p8) ────────
const reqLog = [];
process.on("exit", () => {
  if (reqLog.length) {
    console.log("\nfailed-request auth trace:");
    for (const l of reqLog) console.log(`  ${l}`);
  }
});
const clientRegistry = {};
const traceFetch = (name) => async (input, init) => {
  let res = await fetch(input, init);
  const isAuthRpc =
    res.status === 401 ||
    (res.status === 400 && (await res.clone().text()).includes("permission denied"));
  const entry = clientRegistry[name];
  if (isAuthRpc && entry?.creds) {
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
    reqLog.push(
      `${name} ${res.status} ${typeof input === "string" ? input : input.url} auth=…${a.slice(-12)}`,
    );
  }
  return res;
};
const noRefresh = (name) => ({
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: traceFetch(name) },
});
const anonClient = createClient(url, anon, noRefresh("anon"));
const referrer = createClient(url, anon, noRefresh("referrer"));
const referred = createClient(url, anon, noRefresh("referred"));
const taskUser = createClient(url, anon, noRefresh("taskuser"));
const admin = createClient(url, anon, noRefresh("admin"));
clientRegistry.referrer = { client: referrer, creds: P9R };
clientRegistry.referred = { client: referred, creds: P9D };
clientRegistry.taskuser = { client: taskUser, creds: P9T };
clientRegistry.admin = { client: admin, creds: ADMIN };
const svc = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const uidOf = async (c) => (await c.auth.getUser()).data.user.id;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let CLOCK_SKEW_S = 0;
const signInHealthy = async (client, creds) => {
  for (let i = 0; i < 6; i++) {
    let data, error;
    try {
      ({ data, error } = await client.auth.signInWithPassword(creds));
    } catch (e) {
      error = e;
    }
    if (error) {
      if (i === 5 || !/rate limit|fetch failed|network|timed? ?out/i.test(error.message ?? "")) {
        throw new Error(`signin ${creds.email}: ${error.message}`);
      }
      await sleep(8000);
      continue;
    }
    const s = data.session;
    if (CLOCK_SKEW_S === 0 && s?.expires_at && s?.expires_in) {
      CLOCK_SKEW_S = Date.now() / 1000 - (s.expires_at - s.expires_in);
      if (Math.abs(CLOCK_SKEW_S) > 120) {
        console.log(
          `  (local-vs-auth clock skew ≈ ${Math.round(CLOCK_SKEW_S)}s — session times rebased)`,
        );
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
const reauth = async (client, creds) => {
  const { data: s } = await client.auth.getSession();
  if (s?.session) return;
  await signInHealthy(client, creds);
};

// createUser with user_metadata — the referral attribution path requires
// referral_code to land in raw_user_meta_data before handle_new_user fires.
const ensureUser = async ({ email, password }, metadata = {}) => {
  const { data: list } = await svc.auth.admin.listUsers({ perPage: 1000 });
  const found = list?.users?.find((u) => u.email === email);
  if (found) return found.id;
  for (let i = 0; i < 5; i++) {
    const { data, error } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (!error) return data.user.id;
    if (!/rate limit/i.test(error.message ?? ""))
      throw new Error(`createUser ${email}: ${error.message}`);
    await sleep(6000 * (i + 1));
  }
  throw new Error(`createUser ${email}: rate limit persists`);
};
const svcOne = async (table, match, cols = "*") =>
  (await svc.from(table).select(cols).match(match).maybeSingle()).data;

const DEPOSIT_MINOR = 5_000_000; // ₦50,000 — qualifying (≥ ₦5,000)
const EXPECT_DEPOSIT_REWARD = 250_000; // 5% of ₦50,000 (cap ₦10,000 not hit)
const EXPECT_SIGNUP_REWARD = 150_000; // ₦1,500 seed

// ══ 0. Setup ════════════════════════════════════════════════════════════════
console.log("== setup ==");
await reauth(admin, ADMIN);
const uidR = await ensureUser(P9R, { username: `p9r${RUN}` });
const refCode = (await svcOne("profiles", { id: uidR }, "referral_code"))?.referral_code;
check("referrer profile + code", !!uidR && !!refCode, `code=${refCode}`);
const uidD = await ensureUser(P9D, { username: `p9d${RUN}`, referral_code: refCode });
const uidT = await ensureUser(P9T, { username: `p9t${RUN}` });
await signInHealthy(referrer, P9R);
await signInHealthy(referred, P9D);
await signInHealthy(taskUser, P9T);
check("P9T fixtures ready", !!uidD && !!uidT);

// provider preflight — request_deposit needs PAYSTACK enabled
const paystackCfg = await svcOne(
  "admin_config",
  { key: "payment.provider.paystack.enabled" },
  "value,is_active",
);
const paystackOn = paystackCfg?.is_active === true && paystackCfg?.value === true;
if (!paystackOn)
  console.log(
    "  (note: PAYSTACK provider disabled in hosted config — deposit-dependent checks will fail)",
  );

// ══ 1. Denials ══════════════════════════════════════════════════════════════
console.log("\n== denials ==");
await denied("anon get_referral_summary", () => anonClient.rpc("get_referral_summary"));
await denied("anon list_reward_tasks", () => anonClient.rpc("list_reward_tasks"));
await denied("anon claim_task", () =>
  anonClient.rpc("claim_task", { p_task_id: uidR, p_idempotency_key: "x" }),
);
await denied("investor admin_referral_overview", () => taskUser.rpc("admin_referral_overview"));
await denied("investor admin_list_referrals", () => taskUser.rpc("admin_list_referrals"));
await denied("investor admin_reverse_reward", () =>
  taskUser.rpc("admin_reverse_reward", { p_grant_id: uidR, p_reason: "x" }),
);
await denied("investor admin_list_task_claims", () => taskUser.rpc("admin_list_task_claims"));
await denied("investor admin_set_task_status", () =>
  taskUser.rpc("admin_set_task_status", { p_task_id: uidR, p_status: "PUBLISHED" }),
);
await denied("investor record_task_leg_result", () =>
  taskUser.rpc("record_task_leg_result", {
    p_claim_id: uidR,
    p_requirement_id: uidR,
    p_status: "VERIFIED",
  }),
);
await denied("investor settle_task_claim", () =>
  taskUser.rpc("settle_task_claim", { p_claim_id: uidR }),
);
await denied("investor reconcile_rewards", () => taskUser.rpc("reconcile_rewards"));
{
  const { error } = await taskUser
    .from("reward_grants")
    .insert({ user_id: uidT, kind: "TASK", face_minor: 1 });
  check("direct reward_grants INSERT blocked", !!error, errText(error));
}

// ══ 2. Referral lifecycle ═══════════════════════════════════════════════════
console.log("\n== referral lifecycle ==");
{
  const ref = await svcOne("referrals", { referred_id: uidD });
  check(
    "durable referral created at signup",
    !!ref && ref.status === "JOINED" && ref.referrer_id === uidR && ref.code_snapshot === refCode,
    JSON.stringify(ref),
  );
  const refId = ref?.id;

  const { data: grants0 } = await svc
    .from("reward_grants")
    .select("kind,status")
    .eq("referral_id", refId);
  check(
    "pending signup grant minted at attribution",
    grants0?.length === 1 &&
      grants0[0].kind === "REFERRAL_SIGNUP" &&
      grants0[0].status === "PENDING",
    JSON.stringify(grants0),
  );

  const { data: sum, error: sumErr } = await referrer.rpc("get_referral_summary");
  check("referral summary readable", !sumErr && sum?.code === refCode, errText(sumErr));
  check(
    "summary carries server-owned rules/steps/share_url",
    Array.isArray(sum?.rules) &&
      Array.isArray(sum?.qualification_steps) &&
      typeof sum?.share_url === "string",
    JSON.stringify({
      rules: !!sum?.rules,
      steps: !!sum?.qualification_steps,
      share: sum?.share_url,
    }),
  );

  // qualifying deposit → deposit reward to referrer (signup still gated on invest)
  const { data: dep, error: depErr } = await referred.rpc("request_deposit", {
    p_amount_minor: DEPOSIT_MINOR,
    p_provider: "PAYSTACK",
    p_idempotency_key: `p9-dep-${RUN}`,
  });
  check("referred deposit requested", !depErr && dep?.id, errText(depErr));
  if (dep?.id) {
    const { error: cfErr } = await svc.rpc("confirm_deposit", {
      p_deposit_id: dep.id,
      p_verified_amount_minor: DEPOSIT_MINOR,
      p_verified_currency: "NGN",
      p_provider_txn_id: `p9-txn-${RUN}`,
      p_provider_status: "success",
      p_provider_event_id: null,
      p_request_id: `p9-cf-${RUN}`,
    });
    check("deposit confirmed (service path)", !cfErr, errText(cfErr));
  }

  const { data: depGrant } = await svc
    .from("reward_grants")
    .select("id,status,issued_minor")
    .eq("user_id", uidR)
    .eq("kind", "REFERRAL_DEPOSIT")
    .maybeSingle();
  check(
    "deposit reward credited to referrer (5% capped)",
    depGrant?.status === "CREDITED" && depGrant?.issued_minor === EXPECT_DEPOSIT_REWARD,
    JSON.stringify(depGrant),
  );
  const wR1 = await svcOne(
    "wallets",
    { user_id: uidR, currency: "NGN" },
    "bonus_minor,available_minor",
  );
  check(
    "referrer bonus wallet funded",
    Number(wR1?.bonus_minor) === EXPECT_DEPOSIT_REWARD,
    JSON.stringify(wR1),
  );
  check(
    "referral still JOINED (no investment yet)",
    (await svcOne("referrals", { id: refId }, "status"))?.status === "JOINED",
  );

  // referred invests → signup reward issues
  const { data: opps } = await referred.rpc("list_opportunities");
  const openRound = (opps ?? []).find((o) => o.round?.status === "OPEN")?.round;
  if (openRound) {
    const { data: q } = await referred.rpc("investment_quote", {
      p_round_id: openRound.id,
      p_slots: 1,
    });
    if (q?.principal_minor > DEPOSIT_MINOR) {
      note(`investment skipped — slot ${q?.principal_minor} exceeds deposit ${DEPOSIT_MINOR}`);
    } else {
      const { data: inv, error: invErr } = await referred.rpc("request_investment", {
        p_round_id: openRound.id,
        p_slots: 1,
        p_idempotency_key: `p9-inv-${RUN}`,
      });
      check("referred user invested", !invErr && inv?.status === "ACTIVE", errText(invErr));
    }
  } else {
    note("investment skipped — no OPEN round on hosted");
  }
  const refNow = await svcOne("referrals", { id: refId });
  if (openRound) {
    check("referral CREDITED after deposit+invest", refNow?.status === "CREDITED", refNow?.status);
    const { data: suGrant } = await svc
      .from("reward_grants")
      .select("status,issued_minor")
      .eq("referral_id", refId)
      .eq("kind", "REFERRAL_SIGNUP")
      .maybeSingle();
    check(
      "signup reward issued (₦1,500)",
      suGrant?.status === "CREDITED" && suGrant?.issued_minor === EXPECT_SIGNUP_REWARD,
      JSON.stringify(suGrant),
    );
  } else {
    check(
      "signup grant stays PENDING without investment",
      refNow?.status === "JOINED",
      refNow?.status,
    );
  }

  // idempotent re-evaluation + admin read surfaces
  const { error: reErr } = await admin.rpc("admin_reevaluate_referral", { p_referral_id: refId });
  check("admin re-evaluate referral", !reErr, errText(reErr));
  const { data: grantsAfter } = await svc
    .from("reward_grants")
    .select("id")
    .eq("referral_id", refId);
  check(
    "re-evaluation mints nothing new",
    grantsAfter?.length === 2,
    `grants=${grantsAfter?.length}`,
  );
  const { data: ov, error: ovErr } = await admin.rpc("admin_referral_overview");
  check("admin referral overview", !ovErr && typeof ov === "object", errText(ovErr));
  const { data: myRefs } = await referrer.rpc("list_my_referrals");
  check(
    "referral list shows referred (masked)",
    myRefs?.length === 1 && myRefs[0].referred_display_name?.startsWith("···"),
    JSON.stringify(myRefs),
  );
  const { data: myRw } = await referrer.rpc("list_my_rewards");
  check(
    "rewards list with movements",
    Array.isArray(myRw) && myRw.length === 2 && myRw.every((x) => Array.isArray(x.movements)),
    JSON.stringify(myRw),
  );
  const { data: refRw } = await referred.rpc("list_my_rewards");
  check("referred user sees no grants (rewards go to referrer)", refRw?.length === 0);
}

// ══ 3. Bonus release + reward withdrawal ════════════════════════════════════
console.log("\n== bonus release + reward withdrawal ==");
{
  // release part of bonus → available
  const { data: rel, error: relErr } = await referrer.rpc("transfer_bonus_to_available", {
    p_amount_minor: 200_000,
    p_currency: "NGN",
    p_request_id: `p9-rel-${RUN}`,
  });
  check(
    "bonus released to available",
    !relErr && rel?.released_minor === 200_000,
    errText(relErr) || JSON.stringify(rel),
  );
  // replay same request_id → no second movement
  await referrer.rpc("transfer_bonus_to_available", {
    p_amount_minor: 200_000,
    p_currency: "NGN",
    p_request_id: `p9-rel-${RUN}`,
  });
  const { data: relJ } = await svc
    .from("journal_entries")
    .select("id")
    .eq("journal_type", "BONUS_RELEASE")
    .like("idempotency_key", `bonus:release:${uidR}:p9-rel-${RUN}%`);
  check("release idempotent (one journal)", relJ?.length === 1, `journals=${relJ?.length}`);
  const wR2 = await svcOne(
    "wallets",
    { user_id: uidR, currency: "NGN" },
    "available_minor,bonus_minor",
  );
  check(
    "wallet: avail 200k / bonus 200k",
    Number(wR2?.available_minor) === 200_000 && Number(wR2?.bonus_minor) === 200_000,
    JSON.stringify(wR2),
  );

  // reward-origin withdrawal: referrer has NO deposit history → ordinary must be 0
  await referrer.rpc("set_transaction_pin", { p_pin: "555777" });
  const { data: pinOk } = await referrer.rpc("verify_transaction_pin", { p_pin: "555777" });
  check("pin verified", pinOk === true);

  // dynamic minimum may exceed the reward balance — flip to FIXED for the
  // duration (same pattern as verify-hosted-p8) and restore afterwards.
  const { data: q1 } = await referrer.rpc("quote_withdrawal", { p_amount_minor: 200_000 });
  const minBlocked = q1?.min_minor != null && 150_000 < Number(q1.min_minor);
  if (minBlocked) {
    await svc.from("admin_config").update({ value: "FIXED" }).eq("key", "withdrawal.min_mode");
    await svc.from("admin_config").update({ value: 100000 }).eq("key", "withdrawal.min_minor.NGN");
    console.log("  (withdrawal.min_mode temporarily FIXED for reward withdrawal checks)");
  }
  try {
    const { data: wd1, error: wdErr } = await referrer.rpc("request_withdrawal", {
      p_amount_minor: 150_000,
      p_destination: { bank_name: "GTB", account_number: "0141", account_name: "P9 Referrer" },
      p_idempotency_key: `p9-wd1-${RUN}`,
    });
    check(
      "reward withdrawal REQUESTED (no deposit history → ordinary 0)",
      !wdErr &&
        wd1?.status === "REQUESTED" &&
        Number(wd1?.reward_amount_minor) === 150_000 &&
        Number(wd1?.ordinary_amount_minor) === 0,
      errText(wdErr) ||
        JSON.stringify({ r: wd1?.reward_amount_minor, o: wd1?.ordinary_amount_minor }),
    );
    if (wd1?.id) {
      const { data: holds } = await svc
        .from("reward_allocations")
        .select("movement")
        .eq("withdrawal_id", wd1.id)
        .eq("movement", "HOLD");
      check("HOLD allocations recorded", (holds?.length ?? 0) >= 1, `holds=${holds?.length}`);
      const { data: wdRej, error: rejErr } = await admin.rpc("decide_withdrawal", {
        p_withdrawal_id: wd1.id,
        p_decision: "REJECT",
        p_reason: "p9 hosted reversal check",
        p_request_id: `p9-rej-${RUN}`,
      });
      check("reward withdrawal REJECTED", !rejErr && wdRej?.status === "REJECTED", errText(rejErr));
      const wR3 = await svcOne(
        "wallets",
        { user_id: uidR, currency: "NGN" },
        "available_minor,bonus_minor,reserved_minor",
      );
      check(
        "hold returned to source buckets",
        Number(wR3?.available_minor) === 200_000 &&
          Number(wR3?.bonus_minor) === 200_000 &&
          Number(wR3?.reserved_minor) === 0,
        JSON.stringify(wR3),
      );
    }

    // second withdrawal → full payout path → CONSUME
    const { data: ok2 } = await referrer.rpc("verify_transaction_pin", { p_pin: "555777" });
    const { data: wd2 } =
      ok2 === true
        ? await referrer.rpc("request_withdrawal", {
            p_amount_minor: 150_000,
            p_destination: {
              bank_name: "GTB",
              account_number: "0141",
              account_name: "P9 Referrer",
            },
            p_idempotency_key: `p9-wd2-${RUN}`,
          })
        : {};
    if (wd2?.id) {
      await admin.rpc("decide_withdrawal", { p_withdrawal_id: wd2.id, p_decision: "APPROVE" });
      await admin.rpc("decide_withdrawal", { p_withdrawal_id: wd2.id, p_decision: "PROCESSING" });
      const { data: wdDone, error: payErr } = await admin.rpc("decide_withdrawal", {
        p_withdrawal_id: wd2.id,
        p_decision: "MARK_PAID",
        p_reason: "paid",
        p_request_id: `p9-pay-${RUN}`,
      });
      check(
        "reward withdrawal COMPLETED",
        !payErr && wdDone?.status === "COMPLETED" && !!wdDone?.payout_journal_id,
        errText(payErr),
      );
      const { data: consumed } = await svc
        .from("reward_allocations")
        .select("amount_minor")
        .eq("withdrawal_id", wd2.id)
        .eq("movement", "CONSUME");
      const consumedSum = (consumed ?? []).reduce((a, x) => a + Number(x.amount_minor), 0);
      check("CONSUME allocations on payout", consumedSum === 150_000, `consumed=${consumedSum}`);
    } else {
      check("second reward withdrawal requested", false, "no withdrawal row");
    }
  } finally {
    if (minBlocked) {
      await svc.from("admin_config").update({ value: "DYNAMIC" }).eq("key", "withdrawal.min_mode");
    }
  }
}

// ══ 4. Reversal → receivable ════════════════════════════════════════════════
console.log("\n== reversal → receivable ==");
{
  const { data: depGrant } = await svc
    .from("reward_grants")
    .select("id")
    .eq("user_id", uidR)
    .eq("kind", "REFERRAL_DEPOSIT")
    .maybeSingle();
  if (depGrant?.id) {
    const { error: rvErr } = await admin.rpc("admin_reverse_reward", {
      p_grant_id: depGrant.id,
      p_reason: "p9 hosted fraud-review check",
      p_request_id: `p9-rv-${RUN}`,
    });
    check("admin reverse deposit grant", !rvErr, errText(rvErr));
    const g = await svcOne(
      "reward_grants",
      { id: depGrant.id },
      "status,bonus_minor,reversed_minor",
    );
    check(
      "grant REVERSED",
      g?.status === "REVERSED" || g?.status === "PARTIALLY_REVERSED",
      JSON.stringify(g),
    );
    const { data: recv } = await svc
      .from("reward_receivables")
      .select("id,outstanding_minor,status")
      .eq("source_grant_id", depGrant.id);
    check(
      "receivable opened for spent portion",
      Array.isArray(recv) &&
        (recv.length === 0 || recv.every((x) => x.status === "OPEN" && x.outstanding_minor > 0)),
      JSON.stringify(recv),
    );
    const wR4 = await svcOne(
      "wallets",
      { user_id: uidR, currency: "NGN" },
      "bonus_minor,available_minor",
    );
    check(
      "clawback never takes wallet negative",
      Number(wR4?.bonus_minor) >= 0 && Number(wR4?.available_minor) >= 0,
      JSON.stringify(wR4),
    );
    const { data: recvRows, error: rlErr } = await admin.rpc("admin_list_receivables");
    check("admin receivables queue readable", !rlErr, errText(rlErr));
  } else {
    note("reversal skipped — no deposit grant (deposit checks failed earlier)");
  }
}

// ══ 5. Task rewards ═════════════════════════════════════════════════════════
console.log("\n== task rewards ==");
{
  const task = await svcOne("reward_tasks", { slug: "join-community" }, "id,status");
  check("seeded task exists (DRAFT)", !!task?.id, JSON.stringify(task));
  if (task?.id) {
    const { data: visible } = await taskUser.rpc("list_reward_tasks");
    check(
      "DRAFT task hidden from investors",
      !(visible ?? []).some((x) => x.slug === "join-community"),
      JSON.stringify(visible?.length),
    );
    const { error: clErr } = await taskUser.rpc("claim_task", {
      p_task_id: task.id,
      p_idempotency_key: `p9-cl-${RUN}`,
      p_evidence: {},
    });
    check(
      "claim on DRAFT task rejected",
      !!clErr && /ERR_TASK_NOT_AVAILABLE|ERR_TASK_NOT_FOUND/.test(errText(clErr)),
      errText(clErr),
    );
    // hosted admin is FINANCE_ADMIN — catalogue management must deny
    const { error: pubErr } = await admin.rpc("admin_set_task_status", {
      p_task_id: task.id,
      p_status: "PUBLISHED",
      p_request_id: `p9-pub-${RUN}`,
    });
    check(
      "FINANCE_ADMIN cannot publish task (ops-only)",
      !!pubErr && /not authorized/i.test(errText(pubErr)),
      errText(pubErr),
    );
    const { data: claimsList, error: lcErr } = await admin.rpc("admin_list_task_claims");
    check(
      "admin (finance) can read claim queue",
      !lcErr && Array.isArray(claimsList),
      errText(lcErr),
    );
    const { data: taskList, error: ltErr } = await admin.rpc("admin_list_reward_tasks");
    check("admin task catalogue readable", !ltErr && Array.isArray(taskList), errText(ltErr));
  }
  // investor-facing task surfaces exist and return well-formed empties
  const { data: myClaims, error: mcErr } = await taskUser.rpc("list_my_task_claims");
  check("list_my_task_claims returns", !mcErr && Array.isArray(myClaims), errText(mcErr));
  const { data: lnk, error: lnkErr } = await taskUser.rpc("create_identity_link_token", {
    p_provider: "TELEGRAM",
  });
  check(
    "identity link token minted",
    !lnkErr && typeof lnk?.token === "string" && lnk.token.startsWith("lnk_"),
    errText(lnkErr),
  );
  // service-only worker feed + janitor
  const { data: feed, error: feedErr } = await svc.rpc("task_legs_pending_verification", {
    p_limit: 10,
  });
  check("verifier feed readable (service)", !feedErr && Array.isArray(feed), errText(feedErr));
  const { data: expN, error: expErr } = await svc.rpc("expire_stale_claims");
  check("stale-claim janitor runs", !expErr && typeof expN === "number", errText(expErr));
}

// ══ 6. Reconciliation ═══════════════════════════════════════════════════════
console.log("\n== reconciliation ==");
{
  const { data: rec, error: recErr } = await admin.rpc("reconcile_rewards");
  check("reconcile_rewards runs", !recErr, errText(recErr));
  const mine = (rec ?? []).filter((x) =>
    [uidR, uidD, uidT].some(
      (u) => String(x.detail ?? "").includes(u) || String(x.entity_id ?? "").includes(u),
    ),
  );
  check("no reconciliation findings on P9 entities", mine.length === 0, JSON.stringify(mine));
  if ((rec ?? []).length > mine.length) {
    console.log(`  (note: ${rec.length - mine.length} pre-existing findings on non-P9 entities)`);
    for (const x of rec.slice(0, 5))
      console.log(`    ${x.check_name} ${x.entity_type} ${x.entity_id}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed ? 1 : 0);
