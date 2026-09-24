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

console.log(`\n${pass} passed, ${fail} failed`);
await admin.end();
await epg.stop();
process.exit(fail ? 1 : 0);
