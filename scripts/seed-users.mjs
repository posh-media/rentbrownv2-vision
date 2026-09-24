/**
 * Seeds dev/test users via the Supabase Admin API (service role — NEVER in
 * client code). Usage:
 *   node scripts/seed-users.mjs
 * Env (repo-root .env): PUBLIC_SUPABASE_URL or SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Creates: one investor (verified) + one SUPER_ADMIN (verified) with an
 * admin_roles grant. Idempotent — existing users are re-used, roles upserted.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const url = (env.SUPABASE_URL ?? env.PUBLIC_SUPABASE_URL)?.replace(/\/$/, "");
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = env.DATABASE_URL;
if (!url || !serviceKey) {
  console.error("SUPABASE_URL/PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const USERS = [
  {
    email: "ada.investor@rentbrown.dev",
    password: process.argv[2] ?? "Investor!Pass1",
    meta: { username: "ada_ocha", display_name: "Ada Okafor", full_name: "Ada Okafor", phone: "+2348012345678" },
    role: null,
  },
  {
    email: "tunde.admin@rentbrown.dev",
    password: process.argv[3] ?? "Admin!Pass1",
    meta: { username: "tunde_ops", display_name: "Tunde A.", full_name: "Tunde A." },
    role: "FINANCE_ADMIN",
  },
];

for (const u of USERS) {
  // admin.createUser is idempotent-by-email only via lookup; list + match.
  const { data: existing } = await admin.auth.admin.listUsers({ perPage: 200 });
  let user = existing?.users?.find((x) => x.email === u.email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true, // dev seed only — real signups verify by email
      user_metadata: u.meta,
    });
    if (error) {
      console.error(`create ${u.email}: ${error.message}`);
      continue;
    }
    user = data.user;
    console.log(`created ${u.email} (${user.id})`);
  } else {
    console.log(`exists  ${u.email} (${user.id})`);
  }

  if (u.role && dbUrl) {
    const parsed = new URL(dbUrl);
    const db = new pg.Client({
      host: parsed.hostname,
      port: Number(parsed.port || 5432),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, "") || "postgres",
      ssl: { rejectUnauthorized: false },
    });
    await db.connect();
    await db.query(
      `insert into public.admin_roles (user_id, role) values ($1, $2)
       on conflict (user_id) do update set role = excluded.role`,
      [user.id, u.role],
    );
    await db.end();
    console.log(`granted ${u.role} to ${u.email}`);
  }
}
console.log("done");
