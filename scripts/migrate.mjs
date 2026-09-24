/**
 * Applies supabase/migrations/*.sql in order against DATABASE_URL.
 * Tracks applied files in public.schema_migrations. Usage: node scripts/migrate.mjs
 * Reads the repo-root .env (never commit that file).
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const env = Object.fromEntries(
  readFileSync(join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const url = env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing from .env");
  process.exit(1);
}

const parsed = new URL(url);
const client = new pg.Client({
  host: parsed.hostname,
  port: Number(parsed.port || 5432),
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  database: parsed.pathname.replace(/^\//, "") || "postgres",
  ssl: { rejectUnauthorized: false },
});
await client.connect();

await client.query(`
  create table if not exists public.schema_migrations (
    filename text primary key,
    applied_at timestamptz not null default now()
  );
`);

const files = readdirSync(join(root, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();

const { rows: applied } = await client.query("select filename from public.schema_migrations");
const done = new Set(applied.map((r) => r.filename));

for (const file of files) {
  if (done.has(file)) {
    console.log(`skip  ${file}`);
    continue;
  }
  const sql = readFileSync(join(root, "supabase/migrations", file), "utf8");
  console.log(`apply ${file} …`);
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into public.schema_migrations (filename) values ($1)", [file]);
    await client.query("commit");
    console.log(`ok    ${file}`);
  } catch (err) {
    await client.query("rollback");
    console.error(`FAIL  ${file}: ${err.message}`);
    process.exitCode = 1;
    break;
  }
}

await client.end();
