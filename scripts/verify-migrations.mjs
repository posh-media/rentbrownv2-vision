/**
 * Validates supabase/migrations/*.sql against an embedded PostgreSQL with a
 * stubbed `auth` schema (auth.users, auth.uid(), auth.jwt()). Runs the real
 * migration files plus behavioral assertions: trigger provisioning, username
 * normalization/collisions/reserved names, referral codes, attribution, and
 * RLS semantics (own-row read, restricted column updates, admin visibility).
 *
 * Usage: node scripts/verify-migrations.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const epg = new EmbeddedPostgres({
  databaseDir: join(root, "node_modules/.cache/epg-verify"),
  user: "postgres",
  password: "postgres",
  port: 55432,
  persistent: false,
});
await epg.initialise();
await epg.start();
console.log("embedded postgres up");

const boot = new pg.Client({
  host: "127.0.0.1",
  port: 55432,
  user: "postgres",
  password: "postgres",
  database: "postgres",
});
await boot.connect();
// Supabase DBs are UTF8; the embedded default on Windows is WIN1252.
await boot.query(`create database verify with encoding 'UTF8' locale 'C' template template0`);
await boot.end();

const admin = new pg.Client({
  host: "127.0.0.1",
  port: 55432,
  user: "postgres",
  password: "postgres",
  database: "verify",
});
await admin.connect();

// ── auth schema stub (mirrors what Supabase provides) ────────────────────────
await admin.query(`
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    email_confirmed_at timestamptz,
    raw_user_meta_data jsonb default '{}'::jsonb,
    created_at timestamptz default now()
  );
  create role authenticated nologin;
  create role anon nologin;
  create role service_role nologin;
  grant usage on schema public to authenticated, anon, service_role;
  create or replace function auth.uid() returns uuid language sql stable as
    $$ select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub','')::uuid $$;
  alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
  alter default privileges in schema public grant usage on sequences to authenticated;
`);

// ── apply migrations ─────────────────────────────────────────────────────────
const files = readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  try {
    await admin.query(readFileSync(join(root, "supabase/migrations", f), "utf8"));
    console.log("apply", f, "OK");
  } catch (e) {
    console.error("apply", f, "FAIL:", e.message);
    process.exit(1);
  }
}

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, extra); }
};

// ── trigger: signup provisions profile ──────────────────────────────────────
const uid1 = "11111111-1111-1111-1111-111111111111";
await admin.query(
  `insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`,
  [uid1, "ada@example.com", JSON.stringify({ username: "Ada_Ocha!", display_name: "Ada Okafor", phone: "+234801" })],
);
let r = await admin.query("select * from public.profiles where id=$1", [uid1]);
check("profile auto-created on signup", r.rows.length === 1);
check("username normalized", r.rows[0]?.username === "ada_ocha", r.rows[0]?.username);
check("referral code generated", /^RB-[A-Z2-9]{8}$/.test(r.rows[0]?.referral_code ?? ""), r.rows[0]?.referral_code);
check("display name stored", r.rows[0]?.display_name === "Ada Okafor");
check("default status ACTIVE", r.rows[0]?.account_status === "ACTIVE");

// ── collision → suffixed username ────────────────────────────────────────────
const uid2 = "22222222-2222-2222-2222-222222222222";
await admin.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`,
  [uid2, "ada2@example.com", JSON.stringify({ username: "ada_ocha" })]);
r = await admin.query("select username from public.profiles where id=$1", [uid2]);
check("collision gets suffix", r.rows[0]?.username === "ada_ocha1", r.rows[0]?.username);

// ── reserved name → suffixed, never the reserved literal ─────────────────────
const uid3 = "33333333-3333-3333-3333-333333333333";
await admin.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`,
  [uid3, "x@example.com", JSON.stringify({ username: "admin" })]);
r = await admin.query("select username from public.profiles where id=$1", [uid3]);
check("reserved name avoided", r.rows[0]?.username !== "admin", r.rows[0]?.username);

// ── referral attribution ─────────────────────────────────────────────────────
const code1 = (await admin.query("select referral_code from public.profiles where id=$1", [uid1])).rows[0].referral_code;
const uid4 = "44444444-4444-4444-4444-444444444444";
await admin.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`,
  [uid4, "ref@example.com", JSON.stringify({ username: "newbie", referral_code: code1 })]);
r = await admin.query("select referred_by from public.profiles where id=$1", [uid4]);
check("referral attributed", r.rows[0]?.referred_by === uid1);

// ── RLS: authenticated reads own row only ────────────────────────────────────
const asUser = async (uid, sql, params = []) => {
  await admin.query("begin");
  try {
    await admin.query("set local role authenticated");
    await admin.query(`set local request.jwt.claims = '{"sub":"${uid}"}'`);
    return await admin.query(sql, params);
  } finally {
    // Always rollback — a denied statement aborts the tx; leaving it open
    // would poison every subsequent check on this connection.
    await admin.query("rollback");
  }
};

r = await asUser(uid1, "select id from public.profiles");
check("own row visible only", r.rows.length === 1 && r.rows[0].id === uid1, `saw ${r.rows.length}`);

// username update allowed — assert inside the tx, then roll back so the
// fixture usernames stay stable for the checks below.
await admin.query("begin");
await admin.query("set local role authenticated");
await admin.query(`set local request.jwt.claims = '{"sub":"${uid1}"}'`);
await admin.query("update public.profiles set username='ada_renamed' where id=$1", [uid1]);
r = await admin.query("select username from public.profiles where id=$1", [uid1]);
await admin.query("rollback");
check("owner can update username", r.rows[0].username === "ada_renamed");

// account_status update must be denied (column not granted)
let denied = false;
try {
  await asUser(uid1, "update public.profiles set account_status='ACTIVE' where id=$1", [uid1]);
} catch { denied = true; }
check("owner CANNOT update account_status", denied);

// admin_roles: own grant only
await admin.query("insert into public.admin_roles (user_id, role) values ($1,'FINANCE_ADMIN')", [uid1]);
r = await asUser(uid1, "select * from public.admin_roles");
check("own admin grant visible", r.rows.length === 1);
r = await asUser(uid2, "select * from public.admin_roles");
check("others' grants hidden", r.rows.length === 0);

// is_admin()
r = await admin.query("select public.is_admin($1::uuid) a, public.is_admin($2::uuid) b", [uid1, uid2]);
check("is_admin() correct", r.rows[0].a === true && r.rows[0].b === false);

// admins see all profiles
await admin.query("begin");
await admin.query("set local role authenticated");
await admin.query(`set local request.jwt.claims = '{"sub":"${uid1}"}'`);
r = await admin.query("select count(*)::int c from public.profiles");
await admin.query("rollback");
check("admin sees all profiles", r.rows[0].c === 4, `saw ${r.rows[0].c}`);

// client insert denied
denied = false;
try { await asUser(uid2, "insert into public.profiles (id,username,display_name,referral_code) values (gen_random_uuid(),'x','x','x')"); }
catch { denied = true; }
check("client insert into profiles denied", denied);

// ════════════════════════════════════════════════════════════════════════════
// PHASE 3B — domain schema, RLS, verification fields, admin_config
// ════════════════════════════════════════════════════════════════════════════

const asRole = async (role, sql, params = [], uid = null) => {
  await admin.query("begin");
  try {
    await admin.query(`set local role ${role}`);
    if (uid) await admin.query(`set local request.jwt.claims = '{"sub":"${uid}"}'`);
    return await admin.query(sql, params);
  } finally {
    await admin.query("rollback");
  }
};
const asAnon = (sql, params = []) => asRole("anon", sql, params);
const expectFail = async (name, fn) => {
  let failed = false;
  try { await fn(); } catch { failed = true; }
  check(name, failed);
};

// ── structure: tables, enums, column types ───────────────────────────────────
r = await admin.query(`
  select count(*)::int c from information_schema.tables
  where table_schema='public' and table_name in
  ('properties','property_documents','property_updates','investment_plans',
   'investment_rounds','investments','investment_events','admin_config',
   'admin_config_history','audit_log')`);
check("all 10 Phase 3 tables exist", r.rows[0].c === 10, `found ${r.rows[0].c}`);

r = await admin.query(`
  select count(*)::int c from pg_type t join pg_namespace n on n.oid=t.typnamespace
  where n.nspname='public' and t.typname in
  ('currency_code','property_publication_status','property_document_type',
   'property_document_status','investment_plan_status','investment_round_status',
   'investment_status','investment_event_type','funding_source',
   'config_value_type','audit_result')`);
check("all 11 Phase 3 enums exist", r.rows[0].c === 11, `found ${r.rows[0].c}`);

r = await admin.query(`
  select column_name, data_type from information_schema.columns
  where table_schema='public' and
  ((table_name='investment_plans' and column_name in ('slot_price_minor','roi_bps','duration_hours'))
   or (table_name='investments' and column_name in ('slot_price_minor','principal_minor','roi_bps','duration_hours','expected_profit_minor','maturity_value_minor')))`);
const types = Object.fromEntries(r.rows.map((c) => [c.column_name, c.data_type]));
check("money columns are bigint", ["slot_price_minor","principal_minor","expected_profit_minor","maturity_value_minor"].every((c) => types[c] === "bigint"));
check("roi_bps is integer", types.roi_bps === "integer");
check("duration_hours is integer", types.duration_hours === "integer");

// ── fixtures (postgres role = service-level writes) ──────────────────────────
const propPub = "aaaaaaa1-0000-0000-0000-000000000001";
const propDraft = "aaaaaaa2-0000-0000-0000-000000000002";
await admin.query(`insert into public.properties (id, slug, name, property_type, summary, description, location_label, address, publication_status)
  values ($1,'verdant-court','Verdant Court','Serviced apartments','s','d','Ikoyi, Lagos','12 Internal St','PUBLISHED'),
         ($2,'draft-villa','Draft Villa','Serviced apartments','s','d','Ikoyi, Lagos','99 Hidden Rd','DRAFT')`, [propPub, propDraft]);

const planPub = "bbbbbbb1-0000-0000-0000-000000000001";
const planDraft = "bbbbbbb2-0000-0000-0000-000000000002";
await admin.query(`insert into public.investment_plans (id, property_id, name, currency, slot_price_minor, roi_bps, duration_hours, min_slots, status)
  values ($1,$2,'Income note','NGN',10000000,1650,8760,1,'PUBLISHED'),
         ($3,$2,'Draft plan','NGN',5000000,1400,4320,2,'DRAFT')`, [planPub, propPub, planDraft]);

// Phase 6B write guards require app.investment_write for investments /
// investment_events / investment_rounds writes. investWrite runs statements
// inside a flagged transaction so fixtures and CHECK tests exercise the real
// constraints rather than tripping the guard.
const investWrite = async (sql, params = [], commit = true) => {
  await admin.query("begin");
  await admin.query("select set_config('app.investment_write','1',true)");
  try {
    const res = await admin.query(sql, params);
    if (commit) await admin.query("commit"); else await admin.query("rollback");
    return res;
  } catch (e) {
    await admin.query("rollback");
    throw e;
  }
};

const roundId = "ccccccc1-0000-0000-0000-000000000001";
await investWrite(`insert into public.investment_rounds (id, plan_id, round_number, status, total_slots, slot_price_minor, currency, opens_at, closes_at)
  values ($1,$2,1,'OPEN',100,10000000,'NGN',now(),now()+interval '30 days')`, [roundId, planPub]);

const invId = "ddddddd1-0000-0000-0000-000000000001";
await investWrite(`insert into public.investments (id, reference, user_id, round_id, plan_id, property_id, funding_source, slots, slot_price_minor, currency, principal_minor, roi_bps, duration_hours, expected_profit_minor, maturity_value_minor, status, activated_at, matures_at, idempotency_key)
  values ($1,'RB-INV-T1',$2,$3,$4,$5,'WALLET',2,10000000,'NGN',20000000,1650,8760,3300000,23300000,'PAYMENT_PENDING',null,null,'inv:create:${uid2}:fixture-t1')`,
  [invId, uid2, roundId, planPub, propPub]);
await investWrite(`insert into public.investment_events (investment_id, event_type, actor_kind) values ($1,'ACTIVATED','SYSTEM')`, [invId]);

// ── capacity / integrity constraints ─────────────────────────────────────────
// investWrite keeps these exercising the CHECKs (not the Phase 6 write guard).
await expectFail("over-allocation rejected", () =>
  investWrite("update public.investment_rounds set allocated_slots=101 where id=$1", [roundId], false));
await expectFail("reserved+allocated overflow rejected", () =>
  investWrite("update public.investment_rounds set reserved_slots=99, allocated_slots=2 where id=$1", [roundId], false));
await expectFail("negative capacity rejected", () =>
  investWrite("update public.investment_rounds set reserved_slots=-1 where id=$1", [roundId], false));
await expectFail("total_slots=0 rejected", () =>
  investWrite("insert into public.investment_rounds (plan_id,round_number,total_slots,slot_price_minor,currency,opens_at,closes_at) values ($1,9,0,1,'NGN',now(),now()+interval '1 day')", [planPub], false));
await expectFail("invalid round dates rejected", () =>
  investWrite("insert into public.investment_rounds (plan_id,round_number,total_slots,slot_price_minor,currency,opens_at,closes_at) values ($1,9,10,1,'NGN',now()+interval '2 days',now())", [planPub], false));
await expectFail("duplicate (plan_id,round_number) rejected", () =>
  investWrite("insert into public.investment_rounds (plan_id,round_number,total_slots,slot_price_minor,currency,opens_at,closes_at) values ($1,1,10,1,'NGN',now(),now()+interval '1 day')", [planPub], false));

await expectFail("principal mismatch rejected", () =>
  investWrite(`insert into public.investments (reference,user_id,round_id,plan_id,property_id,funding_source,slots,slot_price_minor,currency,principal_minor,roi_bps,duration_hours,expected_profit_minor,maturity_value_minor)
    values ('RB-INV-BAD',$1,$2,$3,$4,'WALLET',2,10000000,'NGN',19999999,1650,8760,3300000,23299999)`, [uid2, roundId, planPub, propPub], false));
await expectFail("maturity_value mismatch rejected", () =>
  investWrite(`insert into public.investments (reference,user_id,round_id,plan_id,property_id,funding_source,slots,slot_price_minor,currency,principal_minor,roi_bps,duration_hours,expected_profit_minor,maturity_value_minor)
    values ('RB-INV-BAD2',$1,$2,$3,$4,'WALLET',2,10000000,'NGN',20000000,1650,8760,3300000,24000000)`, [uid2, roundId, planPub, propPub], false));
await expectFail("duration_hours=0 rejected (plan)", () =>
  admin.query("insert into public.investment_plans (property_id,name,currency,slot_price_minor,roi_bps,duration_hours) values ($1,'x','NGN',1,0,0)", [propPub]));
await expectFail("negative slot_price rejected", () =>
  admin.query("insert into public.investment_plans (property_id,name,currency,slot_price_minor,roi_bps,duration_hours) values ($1,'y','NGN',-5,0,24)", [propPub]));
await expectFail("max_slots < min_slots rejected", () =>
  admin.query("insert into public.investment_plans (property_id,name,currency,slot_price_minor,roi_bps,duration_hours,min_slots,max_slots_per_user) values ($1,'z','NGN',1,0,24,5,3)", [propPub]));

await expectFail("VERIFIED doc without reviewer rejected", () =>
  admin.query("insert into public.property_documents (property_id,document_type,title,status) values ($1,'TITLE','t','VERIFIED')", [propPub]));
await admin.query(`insert into public.property_documents (property_id,document_type,title,status,reviewed_by,reviewed_at)
  values ($1,'TITLE','Verified title','VERIFIED',$2,now())`, [propPub, uid3]);
await admin.query(`insert into public.property_documents (property_id,document_type,title,status)
  values ($1,'VALUATION','Uploaded valuation','UPLOADED')`, [propPub]);
r = await admin.query("select status from public.property_documents where title='Verified title'");
check("VERIFIED doc with reviewer accepted", r.rows[0]?.status === "VERIFIED");

// ── profile verification fields ──────────────────────────────────────────────
r = await admin.query("select bool_and(email_verified=false and kyc_verified=false) d from public.profiles");
check("verification flags default false", r.rows[0].d === true);

// sync trigger: confirm email on auth.users → profiles.email_verified
await admin.query("update auth.users set email_confirmed_at=now() where id=$1", [uid2]);
r = await admin.query("select email_verified, email_verified_at is not null has_at from public.profiles where id=$1", [uid2]);
check("email confirmation syncs to profile", r.rows[0].email_verified === true && r.rows[0].has_at === true);

await expectFail("client cannot update email_verified", () =>
  asUser(uid2, "update public.profiles set email_verified=false where id=$1", [uid2]));
await expectFail("client cannot update kyc_verified", () =>
  asUser(uid2, "update public.profiles set kyc_verified=true where id=$1", [uid2]));

// ── public catalogue RLS ─────────────────────────────────────────────────────
// seed_tag filters: the Phase 6B catalogue seed adds legitimately-published
// fixture rows; these assertions scope to non-seed data.
r = await asAnon("select id from public.properties where seed_tag is null");
check("anon sees only published properties", r.rows.length === 1 && r.rows[0].id === propPub, `saw ${r.rows.length}`);
await expectFail("anon cannot read address column", () =>
  asAnon("select address from public.properties"));

r = await asAnon("select id from public.investment_plans where seed_tag is null");
check("anon sees only published plans", r.rows.length === 1 && r.rows[0].id === planPub);
r = await asAnon("select id from public.investment_rounds where seed_tag is null");
check("anon sees rounds of published plans", r.rows.length === 1 && r.rows[0].id === roundId);

r = await asAnon(`select d.status from public.property_documents d
  join public.properties p on p.id = d.property_id where p.seed_tag is null`);
check("anon sees reviewed evidence only", r.rows.length === 1 && r.rows[0].status === "VERIFIED", `saw ${r.rows.length}`);
await expectFail("anon cannot read storage_path", () =>
  asAnon("select storage_path from public.property_documents"));

// ── investor boundaries ──────────────────────────────────────────────────────
r = await asUser(uid2, "select id from public.investments");
check("investor sees own investments", r.rows.length === 1 && r.rows[0].id === invId);
r = await asUser(uid3, "select id from public.investments");
check("other investor sees none", r.rows.length === 0);
r = await asUser(uid2, "select event_type from public.investment_events");
check("investor sees own investment events", r.rows.length === 1 && r.rows[0].event_type === "ACTIVATED");

await expectFail("investor cannot insert investments", () =>
  asUser(uid2, `insert into public.investments (reference,user_id,round_id,plan_id,property_id,funding_source,slots,slot_price_minor,currency,principal_minor,roi_bps,duration_hours,expected_profit_minor,maturity_value_minor)
    values ('RB-INV-HACK',$1,$2,$3,$4,'WALLET',1,10000000,'NGN',10000000,1650,8760,1650000,11650000)`, [uid2, roundId, planPub, propPub]));
await expectFail("investor cannot update own investment", () =>
  asUser(uid2, "update public.investments set roi_bps=5000 where id=$1", [invId]));
await expectFail("investor cannot alter round capacity", () =>
  asUser(uid2, "update public.investment_rounds set allocated_slots=5 where id=$1", [roundId]));
await expectFail("investor cannot publish property", () =>
  asUser(uid2, "update public.properties set publication_status='PUBLISHED' where id=$1", [propDraft]));
await expectFail("investor cannot write investment events", () =>
  asUser(uid2, "insert into public.investment_events (investment_id,event_type,actor_kind) values ($1,'MATURED','INVESTOR')", [invId]));

r = await asUser(uid2, "select key from public.admin_config");
check("investor cannot read admin_config", r.rows.length === 0);
r = await asUser(uid2, "select id from public.audit_log");
check("investor cannot read audit_log", r.rows.length === 0);
await expectFail("investor cannot write audit_log", () =>
  asUser(uid2, "insert into public.audit_log (action,entity_type) values ('x','y')"));

// ── admin boundaries ─────────────────────────────────────────────────────────
await admin.query("insert into public.admin_roles (user_id, role) values ($1,'SUPER_ADMIN')", [uid3]);
await admin.query("insert into public.admin_roles (user_id, role) values ($1,'OPERATIONS_ADMIN')", [uid4]);

r = await asUser(uid3, "select count(*)::int c from public.properties where seed_tag is null");
check("super admin sees all properties", r.rows[0].c === 2, `saw ${r.rows[0].c}`);
r = await asUser(uid4, "select count(*)::int c from public.investments");
check("ops admin sees all investments", r.rows[0].c === 1);
r = await asUser(uid1, "select count(*)::int c from public.audit_log");
check("finance admin reads audit_log", r.rows[0].c >= 0);
r = await asUser(uid2, "select public.has_admin_role(array['SUPER_ADMIN']::public.admin_role[]) h");
check("has_admin_role false for investor", r.rows[0].h === false);
r = await asUser(uid3, "select public.has_admin_role(array['SUPER_ADMIN']::public.admin_role[]) h");
check("has_admin_role true for super admin", r.rows[0].h === true);

// admin definer functions return internal columns for authorized roles only
r = await asUser(uid4, "select address from public.admin_get_property($1)", [propPub]);
check("ops admin reads internal address via RPC", r.rows[0].address === "12 Internal St");
r = await asUser(uid2, "select address from public.admin_get_property($1)", [propPub]);
check("investor gets nothing from admin RPC", r.rows.length === 0);

// ── admin_config: seeds, validation, history, audit ──────────────────────────
r = await admin.query("select count(*)::int c from public.admin_config");
check("admin_config seeded (10 phase-3 + 16 payment keys)", r.rows[0].c === 26, `found ${r.rows[0].c}`);
r = await admin.query("select value from public.admin_config where key='referral.signup_reward_minor'");
check("signup reward seeded = 150000", r.rows[0].value === 150000, r.rows[0].value);
r = await admin.query("select value from public.admin_config where key='platform.supported_currencies'");
check("supported currencies seeded", JSON.stringify(r.rows[0].value) === '["NGN","USD"]');

// successful update: SUPER_ADMIN via RPC → value + history + audit, atomically
await admin.query("begin");
await admin.query("set local role authenticated");
await admin.query(`set local request.jwt.claims = '{"sub":"${uid3}"}'`);
r = await admin.query("select public.set_admin_config('withdrawal.min_minor.NGN','600000'::jsonb,'raise min','req-verify-1') s");
check("SUPER_ADMIN config update returns row", !!r.rows[0].s);
r = await admin.query("select value from public.admin_config where key='withdrawal.min_minor.NGN'");
check("config value updated", r.rows[0].value === 600000, r.rows[0].value);
r = await admin.query("select old_value, new_value, changed_by, reason from public.admin_config_history where key='withdrawal.min_minor.NGN' order by id desc limit 1");
check("history row written", r.rows.length === 1 && r.rows[0].old_value === 500000 && r.rows[0].new_value === 600000 && r.rows[0].changed_by === uid3);
r = await admin.query("select result, actor_id, metadata from public.audit_log where entity_type='admin_config' and entity_id='withdrawal.min_minor.NGN' order by created_at desc limit 1");
check("audit row written", r.rows.length === 1 && r.rows[0].result === "SUCCESS" && r.rows[0].actor_id === uid3);
await admin.query("rollback");

// denied: OPERATIONS_ADMIN (not SUPER_ADMIN) → raises; an aborting
// transaction cannot persist a DENIED audit row, so instead prove atomicity:
// value untouched and no history row.
await expectFail("non-super-admin config update denied", () =>
  asUser(uid4, "select public.set_admin_config('withdrawal.min_minor.NGN','1'::jsonb,null,null)"));
r = await admin.query("select value from public.admin_config where key='withdrawal.min_minor.NGN'");
check("denied attempt left value untouched", r.rows[0].value === 500000, r.rows[0].value);
r = await admin.query("select count(*)::int c from public.admin_config_history where key='withdrawal.min_minor.NGN' and new_value='1'");
check("denied attempt wrote no history", r.rows[0].c === 0);

// validation rejections
await expectFail("MONEY_MINOR rejects negative", () =>
  asUser(uid3, "select public.set_admin_config('withdrawal.min_minor.NGN','-5'::jsonb,null,null)"));
await expectFail("MONEY_MINOR rejects decimal", () =>
  asUser(uid3, "select public.set_admin_config('withdrawal.min_minor.NGN','1.5'::jsonb,null,null)"));
await expectFail("BPS rejects >10000", () =>
  asUser(uid3, "select public.set_admin_config('withdrawal.fee_bps','10001'::jsonb,null,null)"));
await expectFail("BPS rejects string", () =>
  asUser(uid3, `select public.set_admin_config('withdrawal.fee_bps','"abc"'::jsonb,null,null)`));
await expectFail("STRING_LIST rejects non-array", () =>
  asUser(uid3, "select public.set_admin_config('platform.supported_currencies','\"NGN\"'::jsonb,null,null)"));
await expectFail("STRING_LIST rejects non-strings", () =>
  asUser(uid3, "select public.set_admin_config('platform.supported_currencies','[1,2]'::jsonb,null,null)"));
await expectFail("unknown key rejected", () =>
  asUser(uid3, "select public.set_admin_config('nope.key','1'::jsonb,null,null)"));
await expectFail("anon cannot call set_admin_config", () =>
  asAnon("select public.set_admin_config('withdrawal.min_minor.NGN','1'::jsonb,null,null)"));

// append-only: audit_log + investment_events reject client writes
await expectFail("audit_log client update denied", () =>
  asUser(uid3, "update public.audit_log set action='x'"));
await expectFail("audit_log client delete denied", () =>
  asUser(uid3, "delete from public.audit_log"));
await expectFail("investment_events client update denied", () =>
  asUser(uid3, "update public.investment_events set event_type='FAILED'"));
await expectFail("investment_events client delete denied", () =>
  asUser(uid3, "delete from public.investment_events"));

// ════════════════════════════════════════════════════════════════════════════
// PHASE 4B — double-entry ledger + wallet
// ════════════════════════════════════════════════════════════════════════════

// ── structure ────────────────────────────────────────────────────────────────
r = await admin.query(`
  select count(*)::int c from information_schema.tables
  where table_schema='public' and table_name in
  ('ledger_accounts','journal_entries','ledger_entries','wallets')`);
check("all 4 Phase 4 tables exist", r.rows[0].c === 4, `found ${r.rows[0].c}`);

r = await admin.query(`
  select count(*)::int c from pg_type t join pg_namespace n on n.oid=t.typnamespace
  where n.nspname='public' and t.typname in
  ('ledger_account_kind','wallet_bucket','entry_direction','system_account_kind','journal_type')`);
check("all 5 Phase 4 enums exist", r.rows[0].c === 5, `found ${r.rows[0].c}`);

r = await admin.query(`select count(*)::int c from public.ledger_accounts where kind='SYSTEM'`);
check("14 system accounts seeded (7 kinds x NGN/USD)", r.rows[0].c === 14, `found ${r.rows[0].c}`);

// post_journal is service-only — authenticated must not reach it
await expectFail("authenticated cannot call post_journal", () =>
  asUser(uid2, `select public.post_journal('FUNDING_CREDIT','NGN','[]'::jsonb,null,'k')`));

// ── funding: balanced post, lazy provisioning, wallet effect ─────────────────
const postJ = (type, cur, lines, key, extra = "") =>
  admin.query(
    `select * from public.post_journal('${type}'::public.journal_type,'${cur}'::public.currency_code,'${lines}'::jsonb,null,'${key}',null,null,'SYSTEM',null,null,'test', '{}' ::jsonb${extra})`,
  ).then((x) => x.rows[0]);

const funding = await postJ(
  "FUNDING_CREDIT", "NGN",
  `[{"account_key":"system:deposits_clearing","direction":"DEBIT","amount_minor":100000},
    {"account_key":"user:${uid4}:available","direction":"CREDIT","amount_minor":100000}]`,
  "dep:test-1",
);
check("funding journal posted", !!funding?.id);

r = await admin.query("select * from public.wallets where user_id=$1 and currency='NGN'", [uid4]);
check("wallet lazily provisioned", r.rows.length === 1);
check("available credited 100000", r.rows[0].available_minor === "100000", r.rows[0].available_minor);

r = await admin.query("select count(*)::int c from public.ledger_entries where journal_id=$1", [funding.id]);
check("journal has 2 lines", r.rows[0].c === 2);
r = await admin.query(`select e.balance_after_minor from public.ledger_entries e
  join public.ledger_accounts a on a.id=e.account_id
  where e.journal_id=$1 and a.kind='USER'`, [funding.id]);
check("balance_after snapshot = 100000", r.rows[0].balance_after_minor === "100000", r.rows[0].balance_after_minor);

// ── idempotent replay ─────────────────────────────────────────────────────────
const replay = await postJ(
  "FUNDING_CREDIT", "NGN",
  `[{"account_key":"system:deposits_clearing","direction":"DEBIT","amount_minor":100000},
    {"account_key":"user:${uid4}:available","direction":"CREDIT","amount_minor":100000}]`,
  "dep:test-1",
);
check("replay returns same journal", replay?.id === funding.id);
r = await admin.query("select available_minor from public.wallets where user_id=$1 and currency='NGN'", [uid4]);
check("replay had no second financial effect", r.rows[0].available_minor === "100000");
r = await admin.query("select count(*)::int c from public.journal_entries");
check("still exactly one journal", r.rows[0].c === 1);

// ── hard invariants ────────────────────────────────────────────────────────────
await expectFail("unbalanced journal rejected", () =>
  postJ("FUNDING_CREDIT", "NGN",
    `[{"account_key":"system:deposits_clearing","direction":"DEBIT","amount_minor":1000},
      {"account_key":"user:${uid4}:available","direction":"CREDIT","amount_minor":999}]`,
    "dep:bad-1"));
await expectFail("single-line journal rejected", () =>
  postJ("FUNDING_CREDIT", "NGN",
    `[{"account_key":"system:deposits_clearing","direction":"DEBIT","amount_minor":1000}]`,
    "dep:bad-2"));
await expectFail("balanced but wrong shape rejected (FUNDING_CREDIT → RESERVED)", () =>
  postJ("FUNDING_CREDIT", "NGN",
    `[{"account_key":"system:deposits_clearing","direction":"DEBIT","amount_minor":1000},
      {"account_key":"user:${uid4}:reserved","direction":"CREDIT","amount_minor":1000}]`,
    "dep:bad-3"));
await expectFail("balanced user-only journal rejected as FUNDING_CREDIT", () =>
  postJ("FUNDING_CREDIT", "NGN",
    `[{"account_key":"user:${uid4}:available","direction":"DEBIT","amount_minor":1000},
      {"account_key":"user:${uid4}:reserved","direction":"CREDIT","amount_minor":1000}]`,
    "dep:bad-4"));
await expectFail("non-positive amount rejected", () =>
  postJ("FUNDING_CREDIT", "NGN",
    `[{"account_key":"system:deposits_clearing","direction":"DEBIT","amount_minor":0},
      {"account_key":"user:${uid4}:available","direction":"CREDIT","amount_minor":0}]`,
    "dep:bad-5"));
await expectFail("unknown system account rejected", () =>
  postJ("FUNDING_CREDIT", "NGN",
    `[{"account_key":"system:nonsense","direction":"DEBIT","amount_minor":1000},
      {"account_key":"user:${uid4}:available","direction":"CREDIT","amount_minor":1000}]`,
    "dep:bad-6"));

// ── lazy provisioning rolls back with a failed posting ────────────────────────
const uid5 = "55555555-5555-5555-5555-555555555555";
await admin.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,'fresh@example.com','{"username":"fresh"}')`, [uid5]);
await expectFail("HOLD exceeding zero balance fails", () =>
  postJ("HOLD", "NGN",
    `[{"account_key":"user:${uid5}:available","direction":"DEBIT","amount_minor":5000},
      {"account_key":"user:${uid5}:reserved","direction":"CREDIT","amount_minor":5000}]`,
    "hold:fresh-1"));
r = await admin.query("select count(*)::int c from public.wallets where user_id=$1", [uid5]);
check("failed posting left no wallet row", r.rows[0].c === 0);
r = await admin.query("select count(*)::int c from public.ledger_accounts where owner_user_id=$1", [uid5]);
check("failed posting left no accounts", r.rows[0].c === 0);
r = await admin.query("select count(*)::int c from public.journal_entries where idempotency_key='hold:fresh-1'");
check("failed posting left no journal", r.rows[0].c === 0);

// ── hold / release flows ──────────────────────────────────────────────────────
const hold = await postJ(
  "HOLD", "NGN",
  `[{"account_key":"user:${uid4}:available","direction":"DEBIT","amount_minor":40000},
    {"account_key":"user:${uid4}:reserved","direction":"CREDIT","amount_minor":40000}]`,
  "hold:test-1",
);
check("hold posted", !!hold?.id);
r = await admin.query("select available_minor, reserved_minor from public.wallets where user_id=$1 and currency='NGN'", [uid4]);
check("hold moved 40000 available→reserved", r.rows[0].available_minor === "60000" && r.rows[0].reserved_minor === "40000",
  `${r.rows[0].available_minor}/${r.rows[0].reserved_minor}`);

await postJ(
  "HOLD_RELEASE", "NGN",
  `[{"account_key":"user:${uid4}:reserved","direction":"DEBIT","amount_minor":40000},
    {"account_key":"user:${uid4}:available","direction":"CREDIT","amount_minor":40000}]`,
  "rel:test-1",
);
r = await admin.query("select available_minor, reserved_minor from public.wallets where user_id=$1 and currency='NGN'", [uid4]);
check("release restored balances", r.rows[0].available_minor === "100000" && r.rows[0].reserved_minor === "0");

await expectFail("HOLD beyond available rejected (insufficient funds)", () =>
  postJ("HOLD", "NGN",
    `[{"account_key":"user:${uid4}:available","direction":"DEBIT","amount_minor":999999},
      {"account_key":"user:${uid4}:reserved","direction":"CREDIT","amount_minor":999999}]`,
    "hold:too-big"));

// ── currency isolation ────────────────────────────────────────────────────────
await postJ(
  "FUNDING_CREDIT", "USD",
  `[{"account_key":"system:deposits_clearing","direction":"DEBIT","amount_minor":5000},
    {"account_key":"user:${uid4}:available","direction":"CREDIT","amount_minor":5000}]`,
  "dep:usd-1",
);
r = await admin.query("select available_minor from public.wallets where user_id=$1 and currency='USD'", [uid4]);
check("USD wallet provisioned separately", r.rows[0].available_minor === "5000");
r = await admin.query("select available_minor from public.wallets where user_id=$1 and currency='NGN'", [uid4]);
check("NGN balance untouched by USD posting", r.rows[0].available_minor === "100000");

// hard cross-currency rejection via deferred trigger (bypasses post_journal)
const usdAcct = (await admin.query("select id from public.ledger_accounts where key='system:deposits_clearing:USD'")).rows[0].id;
const ngnAcct = (await admin.query("select id from public.ledger_accounts where key='system:deposits_clearing:NGN'")).rows[0].id;
await expectFail("cross-currency journal rejected at commit", async () => {
  await admin.query("begin");
  await admin.query(`insert into public.journal_entries (reference,idempotency_key,journal_type,currency,description)
    values ('JRN-XCUR','xcur-1','FUNDING_CREDIT','NGN','x')`);
  await admin.query(`insert into public.ledger_entries (journal_id,account_id,direction,amount_minor)
    select id,$1,'DEBIT',100 from public.journal_entries where idempotency_key='xcur-1'`, [usdAcct]);
  await admin.query(`insert into public.ledger_entries (journal_id,account_id,direction,amount_minor)
    select id,$1,'CREDIT',100 from public.journal_entries where idempotency_key='xcur-1'`, [ngnAcct]);
  await admin.query("commit");
});
await admin.query("rollback").catch(() => {});
r = await admin.query("select count(*)::int c from public.journal_entries where idempotency_key='xcur-1'");
check("cross-currency journal rolled back", r.rows[0].c === 0);

// unbalanced direct insert also rejected at commit
await expectFail("unbalanced direct insert rejected at commit", async () => {
  await admin.query("begin");
  await admin.query(`insert into public.journal_entries (reference,idempotency_key,journal_type,currency,description)
    values ('JRN-UNBAL','unbal-1','FUNDING_CREDIT','NGN','x')`);
  await admin.query(`insert into public.ledger_entries (journal_id,account_id,direction,amount_minor)
    select id,$1,'DEBIT',100 from public.journal_entries where idempotency_key='unbal-1'`, [ngnAcct]);
  await admin.query("commit");
});
await admin.query("rollback").catch(() => {});

// ── immutability (even for superuser) ─────────────────────────────────────────
await expectFail("journal_entries update blocked", () =>
  admin.query("update public.journal_entries set description='x' where id=$1", [funding.id]));
await expectFail("journal_entries delete blocked", () =>
  admin.query("delete from public.journal_entries where id=$1", [funding.id]));
await expectFail("ledger_entries update blocked", () =>
  admin.query("update public.ledger_entries set amount_minor=1"));
await expectFail("ledger_entries delete blocked", () =>
  admin.query("delete from public.ledger_entries"));
await expectFail("ledger_accounts delete blocked", () =>
  admin.query("delete from public.ledger_accounts where key='system:adjustments:NGN'"));

// ── wallet write guard ─────────────────────────────────────────────────────────
await expectFail("direct wallet update blocked (even postgres)", () =>
  admin.query("update public.wallets set available_minor=0 where user_id=$1", [uid4]));
await expectFail("direct wallet insert blocked", () =>
  admin.query("insert into public.wallets (user_id,currency) values ($1,'USD')", [uid5]));
await expectFail("wallet delete blocked", () =>
  admin.query("delete from public.wallets where user_id=$1", [uid4]));

// ── reversal ───────────────────────────────────────────────────────────────────
r = await admin.query("select * from public.reverse_journal($1,'test reversal','rev-req-1')", [funding.id]);
const reversal = r.rows[0];
check("reversal journal created", reversal?.journal_type === "REVERSAL" && reversal?.reverses_journal_id === funding.id);
r = await admin.query(`select e.direction, e.amount_minor from public.ledger_entries e
  join public.ledger_accounts a on a.id=e.account_id
  where e.journal_id=$1 order by e.id`, [reversal.id]);
check("reversal mirrors original lines", r.rows.length === 2 &&
  r.rows[0].direction === "CREDIT" && r.rows[1].direction === "DEBIT" &&
  r.rows.every((x) => x.amount_minor === "100000"), JSON.stringify(r.rows));
r = await admin.query("select available_minor from public.wallets where user_id=$1 and currency='NGN'", [uid4]);
check("reversal restored wallet to 0", r.rows[0].available_minor === "0", r.rows[0].available_minor);

await expectFail("duplicate reversal rejected", () =>
  admin.query("select public.reverse_journal($1,'again','rev-req-2')", [funding.id]));
r = await admin.query("select count(*)::int c from public.journal_entries where reverses_journal_id=$1", [funding.id]);
check("still exactly one reversal", r.rows[0].c === 1);
await expectFail("cannot reverse a REVERSAL", () =>
  admin.query("select public.reverse_journal($1,'x',null)", [reversal.id]));
await expectFail("reversal without reason rejected", () =>
  admin.query("select public.reverse_journal($1,'  ',null)", [funding.id]));
await expectFail("investor cannot reverse journals", () =>
  asUser(uid2, "select public.reverse_journal($1,'x',null)", [funding.id]));

// ── admin adjustment (gated, reasoned, audited, balanced) ──────────────────────
// uid1 = FINANCE_ADMIN (granted above); uid4 = OPERATIONS_ADMIN; uid3 = SUPER_ADMIN
await expectFail("adjustment without reason rejected", () =>
  asUser(uid1, `select public.admin_post_adjustment('${uid4}','NGN','AVAILABLE',5000,'CREDIT',' ',null,null)`));
await expectFail("OPERATIONS_ADMIN cannot adjust", () =>
  asUser(uid4, `select public.admin_post_adjustment('${uid2}','NGN','AVAILABLE',5000,'CREDIT','r',null,null)`));
await expectFail("anonymous cannot adjust", () =>
  asAnon(`select public.admin_post_adjustment('${uid2}','NGN','AVAILABLE',5000,'CREDIT','r',null,null)`));

await admin.query("begin");
await admin.query("set local role authenticated");
await admin.query(`set local request.jwt.claims = '{"sub":"${uid1}"}'`);
r = await admin.query(
  `select * from public.admin_post_adjustment('${uid2}','NGN','AVAILABLE',7500,'CREDIT','correction #42','adj-req-1','adj:test-1')`);
const adj = r.rows[0];
await admin.query("commit");
check("FINANCE_ADMIN adjustment posted", adj?.journal_type === "ADMIN_ADJUSTMENT");
r = await admin.query("select available_minor from public.wallets where user_id=$1 and currency='NGN'", [uid2]);
check("adjustment credited wallet", r.rows[0].available_minor === "7500", r.rows[0].available_minor);
r = await admin.query(`select result, actor_id, action from public.audit_log
  where entity_type='wallet' and action='wallet.adjust' order by created_at desc limit 1`);
check("adjustment wrote audit row", r.rows.length === 1 && r.rows[0].result === "SUCCESS" && r.rows[0].actor_id === uid1);
r = await admin.query(`select count(*)::int c from public.ledger_entries e join public.ledger_accounts a on a.id=e.account_id
  where e.journal_id=$1 and a.system_kind='ADJUSTMENTS'`, [adj.id]);
check("adjustment balanced via ADJUSTMENTS contra", r.rows[0].c === 1);

await expectFail("debit adjustment beyond balance rejected", () =>
  asUser(uid1, `select public.admin_post_adjustment('${uid2}','NGN','AVAILABLE',99999999,'DEBIT','r',null,null)`));

// ── reconciliation: stored projection == ledger-derived ────────────────────────
r = await admin.query("select count(*)::int c from public.reconcile_wallets()");
check("reconciliation clean (no diffs)", r.rows[0].c === 0, `diffs: ${r.rows[0].c}`);

// ── concurrency: competing holds serialize on the wallet row ──────────────────
// uid4's NGN wallet is at 0 after the funding reversal above — re-fund to 80000
await admin.query(`select public.post_journal('FUNDING_CREDIT','NGN',
  '[{"account_key":"user:${uid4}:available","direction":"CREDIT","amount_minor":80000},
    {"account_key":"system:deposits_clearing","direction":"DEBIT","amount_minor":80000}]'::jsonb,
  null,'race:fund',null,null,'SYSTEM',null,null,'race')`);
const c2 = new pg.Client({ host: "127.0.0.1", port: 55432, user: "postgres", password: "postgres", database: "verify" });
await c2.connect();
const holdSql = `select public.post_journal('HOLD','NGN',
  '[{"account_key":"user:${uid4}:available","direction":"DEBIT","amount_minor":80000},
    {"account_key":"user:${uid4}:reserved","direction":"CREDIT","amount_minor":80000}]'::jsonb,
  null,'hold:race-' || $1,null,null,'SYSTEM',null,null,'race')`;
const [h1, h2] = await Promise.allSettled([
  admin.query(holdSql, ["a"]),
  c2.query(holdSql, ["b"]),
]);
const okCount = [h1, h2].filter((x) => x.status === "fulfilled").length;
check("concurrent holds: exactly one wins", okCount === 1, `ok=${okCount}`);
r = await admin.query("select available_minor, reserved_minor from public.wallets where user_id=$1 and currency='NGN'", [uid4]);
check("post-race wallet consistent", r.rows[0].available_minor === "0" && r.rows[0].reserved_minor === "80000",
  `${r.rows[0].available_minor}/${r.rows[0].reserved_minor}`);
await c2.end();

// ── RLS boundaries ─────────────────────────────────────────────────────────────
r = await asUser(uid4, "select user_id, currency, available_minor, reserved_minor from public.wallets");
check("investor reads own wallets only", r.rows.length === 2 && r.rows.every((x) => x.user_id === uid4));
r = await asUser(uid2, "select count(*)::int c from public.wallets");
check("other investor sees only own wallet", r.rows[0].c === 1);
await expectFail("anon cannot read wallets", () => asAnon("select * from public.wallets"));

r = await asUser(uid4, "select count(*)::int c from public.journal_entries");
check("owner sees own journals", r.rows[0].c >= 3, `saw ${r.rows[0].c}`);
r = await asUser(uid2, "select count(*)::int c from public.journal_entries");
check("other user sees only own journals (1 adj)", r.rows[0].c === 1, `saw ${r.rows[0].c}`);
r = await asUser(uid2, "select count(*)::int c from public.ledger_entries");
check("other user sees only own-account lines (contra leg hidden)", r.rows[0].c === 1, `saw ${r.rows[0].c}`);
r = await asUser(uid1, "select count(*)::int c from public.journal_entries");
check("finance admin reads all journals", r.rows[0].c >= 6, `saw ${r.rows[0].c}`);

await expectFail("client cannot insert journal", () =>
  asUser(uid4, `insert into public.journal_entries (reference,idempotency_key,journal_type,currency) values ('x','x','HOLD','NGN')`));
await expectFail("client cannot insert ledger line", () =>
  asUser(uid4, `insert into public.ledger_entries (journal_id,account_id,direction,amount_minor) values (gen_random_uuid(),gen_random_uuid(),'DEBIT',1)`));

// transaction feed projection
r = await asUser(uid4, "select journal_type, direction, bucket, amount_minor from public.get_wallet_transactions()");
check("wallet feed returns own lines", r.rows.length >= 4 && r.rows.every((x) => x.journal_type), `rows=${r.rows.length}`);
await expectFail("feed denied when signed out", () =>
  asAnon("select * from public.get_wallet_transactions()"));

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 5B — payments / deposits / withdrawals / outbox
// ═══════════════════════════════════════════════════════════════════════════

// session-level role + claims so definer RPC writes COMMIT (asUser rolls back)
const asUserSession = async (uid, fn) => {
  await admin.query("reset role");
  await admin.query(`set request.jwt.claims = '{"sub":"${uid}"}'`);
  await admin.query("set role authenticated");
  try { return await fn(); }
  finally {
    await admin.query("reset role");
    await admin.query(`set request.jwt.claims = ''`);
  }
};
const asService = async (fn) => {
  await admin.query("reset role");
  await admin.query(`set request.jwt.claims = ''`);
  await admin.query("set role service_role");
  try { return await fn(); }
  finally { await admin.query("reset role"); }
};
const first = (r) => r.rows[0];

console.log("── Phase 5: deposits ────────────────────────────");

// anonymous / unauthenticated
await expectFail("anon cannot call request_deposit", () =>
  asAnon(`select * from public.request_deposit(500000,'PAYSTACK','k')`));

// below minimum (deposit.min_minor.NGN = 100000)
await expectFail("deposit below minimum rejected", () =>
  asUserSession(uid4, () => admin.query(
    `select * from public.request_deposit(50000,'PAYSTACK','min-test')`)));

// provider disabled → reject
await admin.query(`update public.admin_config set is_active=false where key='payment.provider.paystack.enabled'`);
await expectFail("disabled provider rejected", () =>
  asUserSession(uid4, () => admin.query(
    `select * from public.request_deposit(500000,'PAYSTACK','disabled-test')`)));
await admin.query(`update public.admin_config set is_active=true where key='payment.provider.paystack.enabled'`);

// valid request — INITIATED, NGN forced, server reference
let dep = first(await asUserSession(uid4, () => admin.query(
  `select * from public.request_deposit(500000,'PAYSTACK','dep-1')`)));
check("deposit created INITIATED", dep.status === "INITIATED" && /^DEP-[0-9A-F]{12}$/.test(dep.reference));
check("deposit currency forced NGN", dep.currency === "NGN");
check("deposit user resolved server-side", dep.user_id === uid4);
check("idempotency key namespaced", dep.idempotency_key === `dep:init:${uid4}:dep-1`);

// client retry converges
let dep1b = first(await asUserSession(uid4, () => admin.query(
  `select * from public.request_deposit(500000,'PAYSTACK','dep-1')`)));
check("deposit init idempotent", dep1b.id === dep.id);

// provider init completion → PENDING
dep = first(await asService(() => admin.query(
  `select * from public.complete_deposit_init($1,'PS-REF-1','txn_100', 'https://pay.example/x')`, [dep.id])));
check("deposit PENDING after init", dep.status === "PENDING" && dep.provider_reference === "PS-REF-1");
r = await admin.query("select count(*)::int c from public.deposit_events where deposit_id=$1", [dep.id]);
check("transition events recorded", r.rows[0].c === 2, `events=${r.rows[0].c}`);

// provider event ingestion + dedup
let ev = first(await asService(() => admin.query(
  `select * from public.ingest_provider_event('PAYSTACK','charge.success','evt-1',true,'hash-ev1',$1,'h1','{}'::jsonb)`, [dep.id])));
check("event ingested RECEIVED", ev.status === "RECEIVED" && ev.signature_valid === true);
let ev2 = first(await asService(() => admin.query(
  `select * from public.ingest_provider_event('PAYSTACK','charge.success','evt-1',true,'hash-ev1',$1,'h1','{}'::jsonb)`, [dep.id])));
check("duplicate delivery converges", ev2.id === ev.id);

// server-side confirm → FUNDING_CREDIT → wallet
dep = first(await asService(() => admin.query(
  `select * from public.confirm_deposit($1,500000,'NGN','txn_100','success',$2)`, [dep.id, ev.id])));
check("deposit CONFIRMED after verification", dep.status === "CONFIRMED" && dep.funding_journal_id !== null);
r = await admin.query("select available_minor from public.wallets where user_id=$1 and currency='NGN'", [uid4]);
check("wallet credited via ledger", r.rows[0].available_minor === "500000", r.rows[0].available_minor);
r = await admin.query("select journal_type, idempotency_key from public.journal_entries where id=$1", [dep.funding_journal_id]);
check("funding journal FUNDING_CREDIT + idem", r.rows[0].journal_type === "FUNDING_CREDIT" && r.rows[0].idempotency_key === `dep:fund:${dep.id}`);

// re-confirm → no double credit
dep = first(await asService(() => admin.query(
  `select * from public.confirm_deposit($1,500000,'NGN','txn_100','success',$2)`, [dep.id, ev.id])));
r = await admin.query("select available_minor from public.wallets where user_id=$1 and currency='NGN'", [uid4]);
check("re-confirm does not double-credit", r.rows[0].available_minor === "500000");
r = await admin.query("select count(*)::int c from public.journal_entries where idempotency_key=$1", [`dep:fund:${dep.id}`]);
check("exactly one funding journal", r.rows[0].c === 1);

// amount mismatch → REVIEW_REQUIRED, no credit
let depM = first(await asUserSession(uid4, () => admin.query(
  `select * from public.request_deposit(300000,'KORAPAY','dep-mismatch')`)));
depM = first(await asService(() => admin.query(
  `select * from public.complete_deposit_init($1,'KORA-1',null,null)`, [depM.id])));
depM = first(await asService(() => admin.query(
  `select * from public.confirm_deposit($1,299999,'NGN','kt1','success',null)`, [depM.id])));
check("amount mismatch → REVIEW_REQUIRED", depM.status === "REVIEW_REQUIRED" && depM.review_reason === "AMOUNT_MISMATCH");
check("mismatch not credited", depM.funding_journal_id === null);

// currency mismatch → REVIEW_REQUIRED
let depC = first(await asUserSession(uid4, () => admin.query(
  `select * from public.request_deposit(200000,'PAYSTACK','dep-cur')`)));
depC = first(await asService(() => admin.query(
  `select * from public.complete_deposit_init($1,'PS-REF-2',null,null)`, [depC.id])));
depC = first(await asService(() => admin.query(
  `select * from public.confirm_deposit($1,200000,'USD','t2','success',null)`, [depC.id])));
check("currency mismatch → REVIEW_REQUIRED", depC.status === "REVIEW_REQUIRED" && depC.review_reason === "CURRENCY_MISMATCH");

// late success on CANCELLED deposit → REVIEW_REQUIRED (not credited)
let depL = first(await asUserSession(uid4, () => admin.query(
  `select * from public.request_deposit(150000,'PAYSTACK','dep-late')`)));
depL = first(await asService(() => admin.query(
  `select * from public.complete_deposit_init($1,'PS-REF-3',null,null)`, [depL.id])));
await asUserSession(uid4, () => admin.query(`select public.cancel_deposit($1)`, [depL.id]));
depL = first(await asService(() => admin.query(
  `select * from public.confirm_deposit($1,150000,'NGN','t3','success',null)`, [depL.id])));
check("late success → REVIEW_REQUIRED", depL.status === "REVIEW_REQUIRED" && depL.review_reason?.startsWith("LATE_SUCCESS"));
r = await admin.query("select available_minor from public.wallets where user_id=$1 and currency='NGN'", [uid4]);
check("late success not credited", r.rows[0].available_minor === "500000");

// provider reference uniqueness — second init with same ref on another deposit
let depX = first(await asUserSession(uid4, () => admin.query(
  `select * from public.request_deposit(100000,'PAYSTACK','dep-dup')`)));
depX = first(await asService(() => admin.query(
  `select * from public.complete_deposit_init($1,'PS-REF-4',null,null)`, [depX.id])));
let depY = first(await asUserSession(uid4, () => admin.query(
  `select * from public.request_deposit(100000,'PAYSTACK','dep-dup2')`)));
await expectFail("duplicate provider_reference rejected", () =>
  asService(() => admin.query(
    `select * from public.complete_deposit_init($1,'PS-REF-4',null,null)`, [depY.id])));

// invalid transitions: INITIATED → CONFIRMED impossible; terminal stays terminal
await expectFail("INITIATED → CONFIRMED rejected", () =>
  asService(() => admin.query(`select public.apply_deposit_transition($1,'CONFIRMED','SYSTEM')`, [depY.id])));
await asService(() => admin.query(`select public.fail_deposit_init($1,'init failed')`, [depY.id]));
await expectFail("FAILED → CONFIRMED rejected", () =>
  asService(() => admin.query(`select public.apply_deposit_transition($1,'CONFIRMED','SYSTEM')`, [depY.id])));

// non-admin cannot resolve a review deposit
await expectFail("investor cannot resolve review deposit", () =>
  asUserSession(uid4, () => admin.query(
    `select * from public.admin_resolve_deposit($1,'CONFIRM','trying')`, [depM.id])));

// finance admin resolves mismatch → credit requested amount
await admin.query(`insert into public.admin_roles (user_id, role) values ($1,'FINANCE_ADMIN') on conflict do nothing`, [uid1]);
depM = first(await asUserSession(uid1, () => admin.query(
  `select * from public.admin_resolve_deposit($1,'CONFIRM','provider confirmed amount manually')`, [depM.id])));
check("admin resolve CONFIRM credits", depM.status === "CONFIRMED" && depM.funding_journal_id !== null);
r = await admin.query("select available_minor from public.wallets where user_id=$1 and currency='NGN'", [uid4]);
check("manual resolution credited 300000", r.rows[0].available_minor === "800000", r.rows[0].available_minor);
r = await admin.query("select count(*)::int c from public.audit_log where entity_id=$1 and action='deposit.resolve_confirm'", [depM.id]);
check("resolution audited", r.rows[0].c === 1);

// provider reversal of confirmed deposit → REVERSAL journal, REFUNDED
depM = first(await asService(() => admin.query(
  `select * from public.refund_deposit($1,'provider chargeback',null)`, [depM.id])));
check("refund → REFUNDED", depM.status === "REFUNDED" && depM.reversal_journal_id !== null);
r = await admin.query("select journal_type from public.journal_entries where id=$1", [depM.reversal_journal_id]);
check("reversal is REVERSAL journal", r.rows[0].journal_type === "REVERSAL");
r = await admin.query("select available_minor from public.wallets where user_id=$1 and currency='NGN'", [uid4]);
check("reversal debited wallet", r.rows[0].available_minor === "500000", r.rows[0].available_minor);

// reversal with insufficient cover → REVIEW_REQUIRED, never negative
let depI = first(await asUserSession(uid4, () => admin.query(
  `select * from public.request_deposit(100000,'PAYSTACK','dep-insuf')`)));
depI = first(await asService(() => admin.query(
  `select * from public.complete_deposit_init($1,'PS-REF-9',null,null)`, [depI.id])));
depI = first(await asService(() => admin.query(
  `select * from public.confirm_deposit($1,100000,'NGN','t9','success',null)`, [depI.id])));
// drain the just-funded amount into reserved so available can't cover reversal
await admin.query(`select public.post_journal('HOLD','NGN',
  '[{"account_key":"user:${uid4}:available","direction":"DEBIT","amount_minor":600000},
    {"account_key":"user:${uid4}:reserved","direction":"CREDIT","amount_minor":600000}]'::jsonb,
  null,'p5:drain',null,null,'SYSTEM',null,null,'drain')`);
depI = first(await asService(() => admin.query(
  `select * from public.refund_deposit($1,'provider reversal',null)`, [depI.id])));
check("uncoverable reversal → REVIEW_REQUIRED", depI.status === "REVIEW_REQUIRED" && depI.review_reason?.startsWith("REVERSAL_FAILED"));
r = await admin.query("select available_minor from public.wallets where user_id=$1 and currency='NGN'", [uid4]);
check("wallet never negative", parseInt(r.rows[0].available_minor) >= 0, r.rows[0].available_minor);
// release the drain hold so withdrawal tests have funds
await admin.query(`select public.post_journal('HOLD_RELEASE','NGN',
  '[{"account_key":"user:${uid4}:reserved","direction":"DEBIT","amount_minor":600000},
    {"account_key":"user:${uid4}:available","direction":"CREDIT","amount_minor":600000}]'::jsonb,
  null,'p5:undrain',null,null,'SYSTEM',null,null,'undrain')`);

// event lifecycle: mark processed
await asService(() => admin.query(`select public.mark_provider_event($1,'PROCESSED',$2)`, [ev.id, dep.id]));
r = await admin.query("select status, attempts from public.payment_provider_events where id=$1", [ev.id]);
check("event marked PROCESSED", r.rows[0].status === "PROCESSED" && r.rows[0].attempts >= 1);

// invalid signature event persisted as REVIEW, never processed
let badEv = first(await asService(() => admin.query(
  `select * from public.ingest_provider_event('PAYSTACK','charge.success','evt-bad',false,'hash-bad',null,'hb','{}'::jsonb)`)));
check("invalid-signature event → REVIEW", badEv.status === "REVIEW" && badEv.signature_valid === false);

// concurrent confirm — two sessions race; exactly one credit
let depR = first(await asUserSession(uid4, () => admin.query(
  `select * from public.request_deposit(250000,'PAYSTACK','dep-race')`)));
depR = first(await asService(() => admin.query(
  `select * from public.complete_deposit_init($1,'PS-REF-10',null,null)`, [depR.id])));
const c3 = new pg.Client({ host: "127.0.0.1", port: 55432, user: "postgres", password: "postgres", database: "verify" });
await c3.connect();
const [cf1, cf2] = await Promise.allSettled([
  asService(() => admin.query(`select * from public.confirm_deposit($1,250000,'NGN','tr1','success',null)`, [depR.id])),
  c3.query(`select * from public.confirm_deposit($1,250000,'NGN','tr1','success',null)`, [depR.id]),
]);
r = await admin.query("select available_minor from public.wallets where user_id=$1 and currency='NGN'", [uid4]);
check("concurrent confirm credits once", r.rows[0].available_minor === "850000", r.rows[0].available_minor);
await c3.end();

console.log("── Phase 5: withdrawals + outbox ────────────────");

await expectFail("withdrawal below minimum rejected", () =>
  asUserSession(uid4, () => admin.query(
    `select * from public.request_withdrawal(400000,'{"bank_name":"GTB","account_number":"0123","account_name":"A"}'::jsonb,'w-min')`)));
await expectFail("withdrawal insufficient funds rejected", () =>
  asUserSession(uid4, () => admin.query(
    `select * from public.request_withdrawal(99999999,'{"bank_name":"GTB","account_number":"0123","account_name":"A"}'::jsonb,'w-big')`)));
await expectFail("withdrawal bad destination rejected", () =>
  asUserSession(uid4, () => admin.query(
    `select * from public.request_withdrawal(500000,'{"bank_name":"GTB"}'::jsonb,'w-dest')`)));

let wd = first(await asUserSession(uid4, () => admin.query(
  `select * from public.request_withdrawal(500000,'{"bank_name":"GTBank","account_number":"0123456789","account_name":"Ada Okafor"}'::jsonb,'w-1')`)));
check("withdrawal REQUESTED", wd.status === "REQUESTED" && /^WD-[0-9A-F]{12}$/.test(wd.reference));
check("fee snapshot 5%", wd.fee_minor === "25000" && wd.net_minor === "475000", `fee=${wd.fee_minor}`);
check("hold journal linked", wd.hold_journal_id !== null);
r = await admin.query("select available_minor, reserved_minor from public.wallets where user_id=$1 and currency='NGN'", [uid4]);
check("funds held (avail→reserved)", r.rows[0].available_minor === "350000" && r.rows[0].reserved_minor === "580000",
  `${r.rows[0].available_minor}/${r.rows[0].reserved_minor}`);
r = await admin.query("select status, payload->>'spec' spec, payload->>'event_type' et from public.outbound_events where aggregate_id=$1", [wd.id]);
check("outbox row queued with v1 payload", r.rows[0].status === "QUEUED" && r.rows[0].spec === "rentbrown.outbound.v1" && r.rows[0].et === "withdrawal.requested");

let wd1b = first(await asUserSession(uid4, () => admin.query(
  `select * from public.request_withdrawal(500000,'{"bank_name":"GTBank","account_number":"0123456789","account_name":"Ada Okafor"}'::jsonb,'w-1')`)));
check("withdrawal init idempotent", wd1b.id === wd.id);
r = await admin.query("select reserved_minor from public.wallets where user_id=$1 and currency='NGN'", [uid4]);
check("retry did not double-hold", r.rows[0].reserved_minor === "580000", r.rows[0].reserved_minor);

await expectFail("investor cannot decide withdrawal", () =>
  asUserSession(uid4, () => admin.query(`select * from public.decide_withdrawal($1,'APPROVE')`, [wd.id])));

wd = first(await asUserSession(uid1, () => admin.query(`select * from public.decide_withdrawal($1,'REVIEW',null)`, [wd.id])));
wd = first(await asUserSession(uid1, () => admin.query(`select * from public.decide_withdrawal($1,'APPROVE',null)`, [wd.id])));
check("withdrawal APPROVED", wd.status === "APPROVED");
wd = first(await asUserSession(uid1, () => admin.query(`select * from public.decide_withdrawal($1,'PROCESSING',null)`, [wd.id])));
wd = first(await asUserSession(uid1, () => admin.query(`select * from public.decide_withdrawal($1,'MARK_PAID','paid via bank transfer')`, [wd.id])));
check("withdrawal COMPLETED", wd.status === "COMPLETED" && wd.payout_journal_id !== null);
r = await admin.query("select journal_type from public.journal_entries where id=$1", [wd.payout_journal_id]);
check("payout journal EXTERNAL_PAYOUT", r.rows[0].journal_type === "EXTERNAL_PAYOUT");
r = await admin.query(`select a.system_kind, e.direction, e.amount_minor from public.ledger_entries e
  join public.ledger_accounts a on a.id=e.account_id where e.journal_id=$1 and a.kind='SYSTEM' order by a.system_kind`, [wd.payout_journal_id]);
check("payout splits clearing+fee", r.rows.length === 2
  && r.rows.some((x) => x.system_kind === "FEE_REVENUE" && x.amount_minor === "25000")
  && r.rows.some((x) => x.system_kind === "PAYOUTS_CLEARING" && x.amount_minor === "475000"),
  JSON.stringify(r.rows));
r = await admin.query("select reserved_minor from public.wallets where user_id=$1 and currency='NGN'", [uid4]);
check("reserved drained after payout", r.rows[0].reserved_minor === "80000", r.rows[0].reserved_minor);

// reject path — hold released. Fund the user first so a min-sized request fits.
let depF = first(await asUserSession(uid4, () => admin.query(
  `select * from public.request_deposit(200000,'PAYSTACK','dep-fund2')`)));
depF = first(await asService(() => admin.query(
  `select * from public.complete_deposit_init($1,'PS-REF-F2',null,null)`, [depF.id])));
await asService(() => admin.query(
  `select * from public.confirm_deposit($1,200000,'NGN','tf2','success',null)`, [depF.id]));

let wd2 = first(await asUserSession(uid4, () => admin.query(
  `select * from public.request_withdrawal(500000,'{"bank_name":"GTBank","account_number":"0123456789","account_name":"Ada Okafor"}'::jsonb,'w-2')`)));
wd2 = first(await asUserSession(uid1, () => admin.query(`select * from public.decide_withdrawal($1,'REJECT','docs unclear')`, [wd2.id])));
check("withdrawal REJECTED", wd2.status === "REJECTED" && wd2.release_journal_id !== null);
r = await admin.query("select journal_type from public.journal_entries where id=$1", [wd2.release_journal_id]);
check("release journal HOLD_RELEASE", r.rows[0].journal_type === "HOLD_RELEASE");
r = await admin.query("select available_minor, reserved_minor from public.wallets where user_id=$1 and currency='NGN'", [uid4]);
check("hold released to available", r.rows[0].available_minor === "550000" && r.rows[0].reserved_minor === "80000",
  `${r.rows[0].available_minor}/${r.rows[0].reserved_minor}`);

// outbox delivery lifecycle (service worker path)
const ob = first(await asService(() => admin.query(`select * from public.claim_outbound_batch(10)`)));
check("claim returns queued outbox", ob.id !== undefined && ob.attempts >= 1);
await asService(() => admin.query(`select public.finish_outbound_attempt($1,false,500,'boom')`, [ob.id]));
r = await admin.query("select status, last_error, next_attempt_at > now() future from public.outbound_events where id=$1", [ob.id]);
check("failed attempt reschedules", r.rows[0].status === "FAILED" && r.rows[0].future === true);
await asService(() => admin.query(`select public.finish_outbound_attempt($1,true,200)`, [ob.id]));
r = await admin.query("select status from public.outbound_events where id=$1", [ob.id]);
check("successful delivery marks DELIVERED", r.rows[0].status === "DELIVERED");

console.log("── Phase 5: expiry / reconcile / RLS / overview ──");

// expiry disabled (seeded inactive) → sweep is a no-op even with old rows
r = await asService(() => admin.query("select public.expire_due_deposits() n"));
check("expiry disabled → no-op", r.rows[0].n === 0);
// enable expiry, back-date a pending deposit, sweep
await admin.query(`update public.admin_config set is_active=true, value='60' where key='payment.deposit.expiry_minutes'`);
let depE = first(await asUserSession(uid4, () => admin.query(
  `select * from public.request_deposit(100000,'PAYSTACK','dep-exp')`)));
depE = first(await asService(() => admin.query(
  `select * from public.complete_deposit_init($1,'PS-REF-EXP',null,null)`, [depE.id])));
await admin.query(`begin;
  select set_config('app.deposit_write','1',true);
  update public.deposits set expires_at = now() - interval '1 hour' where id='${depE.id}';
  commit;`);
r = await asService(() => admin.query("select public.expire_due_deposits() n"));
check("sweep expires due deposit", r.rows[0].n === 1);
r = await admin.query("select status from public.deposits where id=$1", [depE.id]);
check("deposit EXPIRED", r.rows[0].status === "EXPIRED");
await admin.query(`update public.admin_config set is_active=false, value='null' where key='payment.deposit.expiry_minutes'`);

// reconcile_payments finds anomalies, not clean rows
r = await asUserSession(uid1, () => admin.query(`select kind, count(*)::int n from public.reconcile_payments() group by 1`));
const kinds = Object.fromEntries(r.rows.map((x) => [x.kind, x.n]));
check("reconcile surfaces UNRESOLVED_EVENT", kinds.UNRESOLVED_EVENT >= 1, JSON.stringify(kinds));
check("reconcile clean on funded deposits", !kinds.CONFIRMED_NO_JOURNAL);
await expectFail("investor cannot run reconcile", () =>
  asUserSession(uid4, () => admin.query(`select * from public.reconcile_payments()`)));

// admin_payment_overview
let ov = first(await asUserSession(uid1, () => admin.query(`select public.admin_payment_overview() ov`)));
ov = ov.ov;
check("overview exposes provider config", ov.config["payment.provider.paystack.enabled"] === "true"
  && ov.config["payment.endpoint.paystack.webhook"]?.includes("payment-webhook-paystack"));
check("overview exposes secret markers only", ov.config["payment.provider.paystack.secret_set"] === "false"
  && !JSON.stringify(ov).match(/sk_live|sk_test|whsec|korapay_secret/i));
check("overview exposes counts", ov.review.deposits_review_required >= 1 && ov.review.outbound_pending >= 1);
await expectFail("investor cannot read overview", () =>
  asUserSession(uid2, () => admin.query(`select public.admin_payment_overview()`)));

// RLS boundaries
r = await asUser(uid4, "select id, status from public.deposits");
check("investor reads own deposits only", r.rows.length >= 8 && r.rows.every((x) => x.id));
r = await asUser(uid2, "select count(*)::int c from public.deposits");
check("other investor sees no deposits", r.rows[0].c === 0);
// uid4 holds OPERATIONS_ADMIN (fixture) — use uid2 as the plain investor
r = await asUser(uid2, "select count(*)::int c from public.payment_provider_events");
check("investor sees no provider events", r.rows[0].c === 0);
r = await asUser(uid2, "select count(*)::int c from public.outbound_events");
check("investor sees no outbound events", r.rows[0].c === 0);
await expectFail("investor cannot insert deposit", () =>
  asUser(uid4, `insert into public.deposits (reference,idempotency_key,user_id,currency,amount_minor,provider) values ('X','x','${uid4}','NGN',1,'PAYSTACK')`));
await expectFail("investor cannot update deposit status", () =>
  asUser(uid4, `update public.deposits set status='CONFIRMED' where id='${dep.id}'`));
await expectFail("investor cannot call post_journal", () =>
  asUser(uid4, `select public.post_journal('HOLD','NGN','[]'::jsonb,null,'x')`));
await expectFail("investor cannot call confirm_deposit", () =>
  asUser(uid4, `select public.confirm_deposit('${dep.id}',500000,'NGN','t','success',null)`));

// direct writes blocked even with flags unset (service role, no flag)
await expectFail("service direct deposit update blocked by guard", () =>
  asService(() => admin.query(`update public.deposits set status='FAILED' where id='${dep.id}'`)));

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 6B — investment engine + seeded catalogue
// ═══════════════════════════════════════════════════════════════════════════

console.log("── Phase 6: catalogue seed ────────────────────");

r = await admin.query("select count(*)::int c from public.properties where seed_tag='p6-catalogue-fixtures'");
check("6 seeded properties", r.rows[0].c === 6, `found ${r.rows[0].c}`);
r = await admin.query("select count(*)::int c from public.investment_plans where seed_tag='p6-catalogue-fixtures'");
check("6 seeded plans", r.rows[0].c === 6, `found ${r.rows[0].c}`);
r = await admin.query("select count(*)::int c from public.investment_rounds where seed_tag='p6-catalogue-fixtures'");
check("6 seeded rounds", r.rows[0].c === 6, `found ${r.rows[0].c}`);
r = await admin.query(`select status, count(*)::int c from public.investment_rounds
  where seed_tag='p6-catalogue-fixtures' group by 1`);
const seedSt = Object.fromEntries(r.rows.map((x) => [x.status, x.c]));
check("seed covers OPEN/NEARING/SOLD_OUT/SCHEDULED",
  seedSt.OPEN === 3 && seedSt.NEARING_CAPACITY === 1 && seedSt.SOLD_OUT === 1 && seedSt.SCHEDULED === 1,
  JSON.stringify(seedSt));
r = await admin.query(`select pl.duration_hours, pl.roi_bps, pl.slot_price_minor from public.investment_plans pl
  join public.properties p on p.id = pl.property_id where p.slug='the-terraces-ikoyi'`);
check("terraces plan: 8760h / 1650bps / ₦100k", r.rows[0].duration_hours === 8760
  && r.rows[0].roi_bps === 1650 && r.rows[0].slot_price_minor === "10000000");
r = await admin.query(`select count(*)::int c from public.property_documents d
  join public.properties p on p.id=d.property_id where p.seed_tag='p6-catalogue-fixtures'`);
check("20 seeded docs", r.rows[0].c === 20, `found ${r.rows[0].c}`);
// VERIFIED requires an auth.users reviewer; embedded runs the seed before
// fixtures exist, so docs land IN_REVIEW locally and VERIFIED on hosted.
r = await admin.query(`select d.status from public.property_documents d
  join public.properties p on p.id=d.property_id
  where p.slug='maitama-heights' and d.document_type='VALUATION'`);
check("maitama pending valuation IN_REVIEW", r.rows[0]?.status === "IN_REVIEW");
r = await admin.query(`select count(*)::int c from public.investments i
  join public.investment_rounds r2 on r2.id = i.round_id where r2.seed_tag='p6-catalogue-fixtures'`);
check("seed created no investments", r.rows[0].c === 0);
r = await admin.query("select count(*)::int c from public.journal_entries where entity_type='investment'");
check("seed created no journals", r.rows[0].c === 0);
// fictional markers preserved
r = await admin.query(`select bool_and(operator_name like '%fictional%') f from public.properties where seed_tag='p6-catalogue-fixtures'`);
check("fictional operator markers preserved", r.rows[0].f === true);

// fixture investors: uid6 funded+verified, uid7 funded+verified, uid8 unverified
const uid6 = "66666666-6666-6666-6666-666666666666";
const uid7 = "77777777-7777-7777-7777-777777777777";
const uid8 = "88888888-8888-8888-8888-888888888888";
await admin.query(`insert into auth.users (id,email,raw_user_meta_data) values
  ('${uid6}','inv6@example.com','{"username":"inv6"}'),
  ('${uid7}','inv7@example.com','{"username":"inv7"}'),
  ('${uid8}','inv8@example.com','{"username":"inv8"}')`);
await admin.query("update auth.users set email_confirmed_at=now() where id in ($1,$2)", [uid6, uid7]);
await admin.query(`select public.post_journal('FUNDING_CREDIT','NGN',
  '[{"account_key":"system:deposits_clearing","direction":"DEBIT","amount_minor":50000000},
    {"account_key":"user:${uid6}:available","direction":"CREDIT","amount_minor":50000000}]'::jsonb,
  null,'p6:fund6',null,null,'SYSTEM',null,null,'fund6')`);
await admin.query(`select public.post_journal('FUNDING_CREDIT','NGN',
  '[{"account_key":"system:deposits_clearing","direction":"DEBIT","amount_minor":30000000},
    {"account_key":"user:${uid7}:available","direction":"CREDIT","amount_minor":30000000}]'::jsonb,
  null,'p6:fund7',null,null,'SYSTEM',null,null,'fund7')`);

const seedRound = async (slug) => first(await admin.query(
  `select r.* from public.investment_rounds r
   join public.investment_plans pl on pl.id = r.plan_id
   join public.properties p on p.id = pl.property_id where p.slug = $1`, [slug]));
const terraces = await seedRound("the-terraces-ikoyi");
const wuse = await seedRound("wuse-square-residences");
const maitama = await seedRound("maitama-heights");
const harbour = await seedRound("harbour-view-suites");

const expectErr = async (name, fn, needle) => {
  try { await fn(); check(name, false, "no error raised"); }
  catch (e) { check(name, e.message.includes(needle), e.message); }
};

console.log("── Phase 6: request_investment — happy path ───");

// quote first — server-authoritative math + wallet eligibility
let q = first(await asUserSession(uid6, () => admin.query(
  `select public.investment_quote($1, 1) q`, [terraces.id]))).q;
check("quote economics", q.principal_minor === 10000000 && q.expected_profit_minor === 1650000
  && q.maturity_value_minor === 11650000 && q.available_slots === 160,
  JSON.stringify(q));
check("quote wallet funding available", q.funding_options[0].available === true
  && q.funding_options[0].wallet_available_minor === 50000000);
check("external funding rejected in quote", q.funding_options.every((o) => o.source === "WALLET" || o.available === false));

let inv = first(await asUserSession(uid6, () => admin.query(
  `select * from public.request_investment($1, 1, 'inv-happy', 'WALLET', 'req-inv-1')`, [terraces.id])));
check("investment ACTIVE", inv.status === "ACTIVE" && /^INV-[0-9A-F]{12}$/.test(inv.reference));
check("snapshot economics", inv.principal_minor === "10000000" && inv.expected_profit_minor === "1650000"
  && inv.maturity_value_minor === "11650000" && inv.roi_bps === 1650 && inv.duration_hours === 8760
  && inv.currency === "NGN" && inv.funding_source === "WALLET");
check("activated + matures + funding ref", !!inv.activated_at && !!inv.matures_at && !!inv.payment_reference);
r = await admin.query("select matures_at = activated_at + duration_hours * interval '1 hour' ok from public.investments where id=$1", [inv.id]);
check("matures_at = activated + duration", r.rows[0].ok === true);
r = await admin.query("select available_minor, reserved_minor from public.wallets where user_id=$1 and currency='NGN'", [uid6]);
check("wallet debited ₦100k, reserved net 0", r.rows[0].available_minor === "40000000" && r.rows[0].reserved_minor === "0");
r = await admin.query("select journal_type from public.journal_entries where entity_id=$1 order by created_at", [inv.id]);
check("HOLD + INVESTMENT_DEBIT journals", r.rows.map((x) => x.journal_type).join() === "HOLD,INVESTMENT_DEBIT", JSON.stringify(r.rows));
r = await admin.query(`select e.direction, e.amount_minor, a.key from public.ledger_entries e
  join public.ledger_accounts a on a.id = e.account_id join public.journal_entries j on j.id=e.journal_id
  where j.entity_id=$1 and j.journal_type='INVESTMENT_DEBIT' order by e.id`, [inv.id]);
check("debit RESERVED → IPP shape", r.rows.length === 2
  && r.rows[0].key === `user:${uid6}:reserved:NGN` && r.rows[0].direction === "DEBIT"
  && r.rows[1].key === "system:investment_principal_payable:NGN" && r.rows[1].direction === "CREDIT",
  JSON.stringify(r.rows));
r = await admin.query("select event_type from public.investment_events where investment_id=$1 order by created_at", [inv.id]);
check("3 lifecycle events", r.rows.map((x) => x.event_type).join() === "CREATED,PAYMENT_CONFIRMED,ACTIVATED",
  JSON.stringify(r.rows.map((x) => x.event_type)));
r = await admin.query("select allocated_slots from public.investment_rounds where id=$1", [terraces.id]);
check("capacity consumed 332→333", r.rows[0].allocated_slots === 333);

console.log("── Phase 6: idempotency ───────────────────────");

let inv2 = first(await asUserSession(uid6, () => admin.query(
  `select * from public.request_investment($1, 1, 'inv-happy', 'WALLET', 'req-inv-1')`, [terraces.id])));
check("replay returns same investment", inv2.id === inv.id);
r = await admin.query("select count(*)::int c from public.journal_entries where entity_id=$1", [inv.id]);
check("no duplicate journals on replay", r.rows[0].c === 2);
r = await admin.query("select allocated_slots from public.investment_rounds where id=$1", [terraces.id]);
check("no second capacity consumption", r.rows[0].allocated_slots === 333);
r = await admin.query("select count(*)::int c from public.investment_events where investment_id=$1", [inv.id]);
check("no duplicate events", r.rows[0].c === 3);

await expectErr("same key + different params → conflict", () =>
  asUserSession(uid6, () => admin.query(
    `select * from public.request_investment($1, 2, 'inv-happy')`, [terraces.id])), "ERR_IDEMPOTENCY_CONFLICT");
r = await admin.query("select allocated_slots from public.investment_rounds where id=$1", [terraces.id]);
check("conflict consumed no capacity", r.rows[0].allocated_slots === 333);

console.log("── Phase 6: rejection paths ───────────────────");

await expectErr("unverified email rejected", () =>
  asUserSession(uid8, () => admin.query(
    `select * from public.request_investment($1, 1, 'k8')`, [terraces.id])), "ERR_EMAIL_VERIFICATION_REQUIRED");
await expectErr("anonymous rejected", () =>
  asAnon(`select * from public.request_investment('${terraces.id}', 1, 'k')`), "denied");
await expectErr("missing round", () =>
  asUserSession(uid6, () => admin.query(
    `select * from public.request_investment(gen_random_uuid(), 1, 'k-nf')`)), "ERR_ROUND_NOT_FOUND");
await expectErr("scheduled round not open", () =>
  asUserSession(uid6, () => admin.query(
    `select * from public.request_investment($1, 1, 'k-sched')`, [maitama.id])), "ERR_ROUND_NOT_OPEN");
await expectErr("sold-out round not open", () =>
  asUserSession(uid6, () => admin.query(
    `select * from public.request_investment($1, 5, 'k-so')`, [wuse.id])), "ERR_ROUND_NOT_OPEN");
await expectErr("below min slots", () =>
  asUserSession(uid6, () => admin.query(
    `select * from public.request_investment($1, 1, 'k-min')`, [harbour.id])), "ERR_INVALID_SLOTS");
await expectErr("CARD funding rejected", () =>
  asUserSession(uid6, () => admin.query(
    `select * from public.request_investment($1, 1, 'k-card', 'CARD')`, [terraces.id])), "ERR_FUNDING_SOURCE");
await expectErr("zero slots rejected", () =>
  asUserSession(uid6, () => admin.query(
    `select * from public.request_investment($1, 0, 'k-zero')`, [terraces.id])), "ERR_INVALID_SLOTS");

// insufficient balance — uid2 has ₦7,500 (fixture); capacity must not leak
const terrBefore = (await admin.query("select allocated_slots from public.investment_rounds where id=$1", [terraces.id])).rows[0].allocated_slots;
await expectErr("insufficient balance", () =>
  asUserSession(uid2, () => admin.query(
    `select * from public.request_investment($1, 1, 'k-poor')`, [terraces.id])), "ERR_INSUFFICIENT_BALANCE");
r = await admin.query("select allocated_slots from public.investment_rounds where id=$1", [terraces.id]);
check("no capacity leaked on failure", r.rows[0].allocated_slots === terrBefore);
r = await admin.query("select count(*)::int c from public.investments where user_id=$1 and round_id=$2", [uid2, terraces.id]);
check("no investment left on failure", r.rows[0].c === 0);

// per-user limit — tiny fixture plan (max 2/user) on the terraces property
const terracesProp = (await admin.query("select id from public.properties where slug='the-terraces-ikoyi'")).rows[0].id;
const limitPlan = "eeeeeee1-0000-0000-0000-000000000001";
const limitRound = "ffffffff-0000-0000-0000-000000000001";
await admin.query(`insert into public.investment_plans (id,property_id,name,currency,slot_price_minor,roi_bps,duration_hours,min_slots,max_slots_per_user,status)
  values ('${limitPlan}','${terracesProp}','Limit probe','NGN',100,500,24,1,2,'PUBLISHED')`);
await investWrite(`insert into public.investment_rounds (id,plan_id,round_number,status,total_slots,slot_price_minor,currency,opens_at,closes_at)
  values ('${limitRound}','${limitPlan}',1,'OPEN',50,100,'NGN',now(),now()+interval '7 days')`);
await asUserSession(uid6, () => admin.query(`select * from public.request_investment('${limitRound}',2,'lim-1')`));
await expectErr("per-user max enforced cumulatively", () =>
  asUserSession(uid6, () => admin.query(`select * from public.request_investment('${limitRound}',1,'lim-2')`)),
  "ERR_INVESTMENT_LIMIT_EXCEEDED");

// capacity exceeded — small fixture round (2 total)
const capPlan = "eeeeeee2-0000-0000-0000-000000000002";
const capRound = "ffffffff-0000-0000-0000-000000000002";
await admin.query(`insert into public.investment_plans (id,property_id,name,currency,slot_price_minor,roi_bps,duration_hours,min_slots,max_slots_per_user,status)
  values ('${capPlan}','${terracesProp}','Capacity probe','NGN',100,500,24,1,10,'PUBLISHED')`);
await investWrite(`insert into public.investment_rounds (id,plan_id,round_number,status,total_slots,slot_price_minor,currency,opens_at,closes_at)
  values ('${capRound}','${capPlan}',1,'OPEN',1,100,'NGN',now(),now()+interval '7 days')`);
await expectErr("beyond capacity rejected", () =>
  asUserSession(uid6, () => admin.query(`select * from public.request_investment('${capRound}',3,'cap-1')`)),
  "ERR_ROUND_CAPACITY_EXCEEDED");

console.log("── Phase 6: capacity race ─────────────────────");

// one slot left, two verified funded users race
const c4 = new pg.Client({ host: "127.0.0.1", port: 55432, user: "postgres", password: "postgres", database: "verify" });
await c4.connect();
const raceAs = async (client, uid, key) => {
  await client.query(`set request.jwt.claims = '{"sub":"${uid}"}'`);
  await client.query("set role authenticated");
  try { return await client.query(`select * from public.request_investment('${capRound}',1,'${key}')`); }
  finally { await client.query("reset role"); await client.query(`set request.jwt.claims = ''`); }
};
const [ra, rb] = await Promise.allSettled([
  raceAs(admin, uid6, "race-a"),
  raceAs(c4, uid7, "race-b"),
]);
const winners = [ra, rb].filter((x) => x.status === "fulfilled").length;
check("race: exactly one succeeds", winners === 1, `ok=${winners} ${ra.status === "rejected" ? ra.reason.message : ""} ${rb.status === "rejected" ? rb.reason.message : ""}`);
const loser = [ra, rb].find((x) => x.status === "rejected");
check("race loser gets typed capacity error", loser?.reason.message.includes("ERR_ROUND_CAPACITY_EXCEEDED")
  || loser?.reason.message.includes("ERR_ROUND_NOT_OPEN"), loser?.reason?.message);
r = await admin.query("select allocated_slots, status from public.investment_rounds where id=$1", [capRound]);
check("exactly one slot consumed, round full→SOLD_OUT", r.rows[0].allocated_slots === 1 && r.rows[0].status === "SOLD_OUT");
r = await admin.query(`select count(*)::int c from public.investments where round_id='${capRound}' and status='ACTIVE'`);
check("exactly one ACTIVE investment", r.rows[0].c === 1);
r = await admin.query(`select count(*)::int c from public.journal_entries j join public.investments i on j.entity_id=i.id::text where i.round_id='${capRound}' and j.journal_type='INVESTMENT_DEBIT'`);
check("exactly one funding journal", r.rows[0].c === 1);
await c4.end();

console.log("── Phase 6: write guards + RLS ────────────────");

await expectFail("direct investment insert blocked even with service role", () =>
  asService(() => admin.query(`insert into public.investments (reference,user_id,round_id,plan_id,property_id,funding_source,slots,slot_price_minor,currency,principal_minor,roi_bps,duration_hours,expected_profit_minor,maturity_value_minor)
    values ('X','${uid6}','${terraces.id}','${terraces.plan_id}','${terracesProp}','WALLET',1,1,'NGN',1,0,24,0,1)`)));
await expectFail("direct round counter update blocked", () =>
  asService(() => admin.query(`update public.investment_rounds set allocated_slots=0 where id='${terraces.id}'`)));
await expectFail("direct event insert blocked", () =>
  asService(() => admin.query(`insert into public.investment_events (investment_id,event_type,actor_kind) values ('${inv.id}','SETTLED','SYSTEM')`)));
r = await asUser(uid7, `select id from public.investments where id='${inv.id}'`);
check("investor cannot read another's investment", r.rows.length === 0);
r = await asUser(uid6, `select id from public.investments where id='${inv.id}'`);
check("investor reads own investment", r.rows.length === 1);

// snapshot immutability — edit the plan after purchase; investment unchanged
await admin.query(`update public.investment_plans set roi_bps=9999 where id='${terraces.plan_id}'`);
r = await admin.query("select roi_bps, expected_profit_minor from public.investments where id=$1", [inv.id]);
check("snapshot immune to plan edits", r.rows[0].roi_bps === 1650 && r.rows[0].expected_profit_minor === "1650000");
await admin.query(`update public.investment_plans set roi_bps=1650 where id='${terraces.plan_id}'`);

console.log("── Phase 6: quote + listing + admin ───────────");

r = await asUserSession(uid2, () => admin.query("select jsonb_array_length(public.list_opportunities()) n"));
check("list_opportunities returns seeded + fixture rows", r.rows[0].n >= 6, `n=${r.rows[0].n}`);
await expectErr("anon cannot call list_opportunities", () => asAnon("select public.list_opportunities()"), "denied");
await expectErr("anon cannot call investment_quote", () => asAnon(`select public.investment_quote('${terraces.id}',1)`), "denied");

// admin RPCs — uid3 SUPER_ADMIN, uid1 FINANCE_ADMIN, uid4 OPERATIONS_ADMIN
r = await asUserSession(uid3, () => admin.query(`select count(*)::int c from public.admin_list_investments()`));
check("admin list returns investments", r.rows[0].c >= 2, `c=${r.rows[0].c}`);
await expectErr("investor cannot list all investments", () =>
  asUserSession(uid7, () => admin.query(`select * from public.admin_list_investments()`)), "not authorized");
let det = first(await asUserSession(uid3, () => admin.query(`select public.admin_investment_detail('${inv.id}') d`))).d;
check("admin detail has events + journals", det.events.length === 3 && det.journals.length === 2 && det.investment.idempotency_key === undefined);
await expectErr("investor cannot read investment detail", () =>
  asUserSession(uid7, () => admin.query(`select public.admin_investment_detail('${inv.id}')`)), "not authorized");

// review flow — finance admin marks ACTIVE → REVIEW_REQUIRED, audited
await expectErr("mark review requires reason", () =>
  asUserSession(uid3, () => admin.query(`select public.admin_mark_investment_review('${inv.id}',' ')`)), "reason");
await expectErr("ops admin cannot mark review", () =>
  asUserSession(uid4, () => admin.query(`select public.admin_mark_investment_review('${inv.id}','x')`)), "not authorized");
r = first(await asUserSession(uid1, () => admin.query(
  `select public.admin_mark_investment_review('${inv.id}','reconciliation probe','rev-req-1') s`)));
check("finance marks investment for review", r.s === "REVIEW_REQUIRED");
r = await admin.query(`select count(*)::int c from public.audit_log where entity_id='${inv.id}' and action='INVESTMENT_REVIEW'`);
check("review mark audited", r.rows[0].c === 1);
r = await admin.query(`select event_type from public.investment_events where investment_id='${inv.id}' order by created_at desc limit 1`);
check("review event appended", r.rows[0].event_type === "REVIEW_REQUIRED");
// restore via the audited admin resolution RPC (apply_investment_transition
// itself is service-only)
await asUserSession(uid1, () => admin.query(
  `select public.admin_resolve_investment_review('${inv.id}','ACTIVE','review complete','rev-req-2')`));
r = await admin.query(`select status from public.investments where id='${inv.id}'`);
check("review resolved back to ACTIVE", r.rows[0].status === "ACTIVE");
await expectErr("ops admin cannot resolve review", () =>
  asUserSession(uid4, () => admin.query(
    `select public.admin_resolve_investment_review('${inv.id}','ACTIVE','x')`)), "not authorized");
await expectErr("investor cannot call transition map", () =>
  asUserSession(uid7, () => admin.query(
    `select public.apply_investment_transition('${inv.id}','REVIEW_REQUIRED','INVESTOR')`)), "denied");
await expectErr("invalid transition rejected", () =>
  asService(() => admin.query(
    `select public.apply_investment_transition('${inv.id}','PAYMENT_PENDING','SYSTEM')`)), "invalid investment transition");

console.log("── Phase 6: reconciliation ────────────────────");

r = await admin.query("select count(*)::int c from public.reconcile_wallets()");
check("wallet reconciliation clean", r.rows[0].c === 0, `diffs=${r.rows[0].c}`);
r = await admin.query("select check_name, count(*)::int c from public.reconcile_investments() group by 1");
check("investment reconciliation clean", r.rows.length === 0, JSON.stringify(r.rows));
await expectErr("investor cannot reconcile", () =>
  asUserSession(uid7, () => admin.query(`select * from public.reconcile_investments()`)), "not authorized");
// seed rows themselves produce no anomalies
r = await admin.query(`select count(*)::int c from public.reconcile_investments() where entity_id in
  (select id::text from public.investment_rounds where seed_tag='p6-catalogue-fixtures')`);
check("seed rounds anomaly-free", r.rows[0].c === 0);

// ── migration tracking convention untouched ──────────────────────────────────
r = await admin.query(`select count(*)::int c from information_schema.tables
  where table_name='schema_migrations' and table_schema not in ('public')`);
check("no competing migration tracker introduced", r.rows[0].c === 0);
r = await admin.query(`select count(*)::int c from information_schema.schemata where schema_name='supabase_migrations'`);
check("no supabase_migrations schema created", r.rows[0].c === 0);

console.log(`\n${pass} passed, ${fail} failed`);
await admin.end();
await epg.stop();
process.exit(fail ? 1 : 0);
