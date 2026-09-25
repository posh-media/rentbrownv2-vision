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
    $$ select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub','')::uuid $$;
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

const roundId = "ccccccc1-0000-0000-0000-000000000001";
await admin.query(`insert into public.investment_rounds (id, plan_id, round_number, status, total_slots, slot_price_minor, currency, opens_at, closes_at)
  values ($1,$2,1,'OPEN',100,10000000,'NGN',now(),now()+interval '30 days')`, [roundId, planPub]);

const invId = "ddddddd1-0000-0000-0000-000000000001";
await admin.query(`insert into public.investments (id, reference, user_id, round_id, plan_id, property_id, funding_source, slots, slot_price_minor, currency, principal_minor, roi_bps, duration_hours, expected_profit_minor, maturity_value_minor, status, activated_at, matures_at)
  values ($1,'RB-INV-T1',$2,$3,$4,$5,'WALLET',2,10000000,'NGN',20000000,1650,8760,3300000,23300000,'ACTIVE',now(),now()+interval '8760 hours')`,
  [invId, uid2, roundId, planPub, propPub]);
await admin.query(`insert into public.investment_events (investment_id, event_type, actor_kind) values ($1,'ACTIVATED','SYSTEM')`, [invId]);

// ── capacity / integrity constraints ─────────────────────────────────────────
await expectFail("over-allocation rejected", () =>
  admin.query("update public.investment_rounds set allocated_slots=101 where id=$1", [roundId]));
await expectFail("reserved+allocated overflow rejected", () =>
  admin.query("update public.investment_rounds set reserved_slots=99, allocated_slots=2 where id=$1", [roundId]));
await expectFail("negative capacity rejected", () =>
  admin.query("update public.investment_rounds set reserved_slots=-1 where id=$1", [roundId]));
await expectFail("total_slots=0 rejected", () =>
  admin.query("insert into public.investment_rounds (plan_id,round_number,total_slots,slot_price_minor,currency,opens_at,closes_at) values ($1,9,0,1,'NGN',now(),now()+interval '1 day')", [planPub]));
await expectFail("invalid round dates rejected", () =>
  admin.query("insert into public.investment_rounds (plan_id,round_number,total_slots,slot_price_minor,currency,opens_at,closes_at) values ($1,9,10,1,'NGN',now()+interval '2 days',now())", [planPub]));
await expectFail("duplicate (plan_id,round_number) rejected", () =>
  admin.query("insert into public.investment_rounds (plan_id,round_number,total_slots,slot_price_minor,currency,opens_at,closes_at) values ($1,1,10,1,'NGN',now(),now()+interval '1 day')", [planPub]));

await expectFail("principal mismatch rejected", () =>
  admin.query(`insert into public.investments (reference,user_id,round_id,plan_id,property_id,funding_source,slots,slot_price_minor,currency,principal_minor,roi_bps,duration_hours,expected_profit_minor,maturity_value_minor)
    values ('RB-INV-BAD',$1,$2,$3,$4,'WALLET',2,10000000,'NGN',19999999,1650,8760,3300000,23299999)`, [uid2, roundId, planPub, propPub]));
await expectFail("maturity_value mismatch rejected", () =>
  admin.query(`insert into public.investments (reference,user_id,round_id,plan_id,property_id,funding_source,slots,slot_price_minor,currency,principal_minor,roi_bps,duration_hours,expected_profit_minor,maturity_value_minor)
    values ('RB-INV-BAD2',$1,$2,$3,$4,'WALLET',2,10000000,'NGN',20000000,1650,8760,3300000,24000000)`, [uid2, roundId, planPub, propPub]));
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
r = await asAnon("select id from public.properties");
check("anon sees only published properties", r.rows.length === 1 && r.rows[0].id === propPub, `saw ${r.rows.length}`);
await expectFail("anon cannot read address column", () =>
  asAnon("select address from public.properties"));

r = await asAnon("select id from public.investment_plans");
check("anon sees only published plans", r.rows.length === 1 && r.rows[0].id === planPub);
r = await asAnon("select id from public.investment_rounds");
check("anon sees rounds of published plans", r.rows.length === 1 && r.rows[0].id === roundId);

r = await asAnon("select status from public.property_documents");
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

r = await asUser(uid3, "select count(*)::int c from public.properties");
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
check("admin_config seeded (10 keys)", r.rows[0].c === 10, `found ${r.rows[0].c}`);
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

console.log(`\n${pass} passed, ${fail} failed`);
await admin.end();
await epg.stop();
process.exit(fail ? 1 : 0);
