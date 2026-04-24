/**
 * Apply all SQL files under ./drizzle/ to the target database in order.
 *
 * Workaround for a drizzle-kit 0.31 bug that crashes on NULL
 * `constraint_definition` rows in Supabase's public schema during `push`
 * introspection. This script sidesteps introspection entirely: it reads the
 * `generate`-produced SQL and executes each statement over a plain
 * postgres-js connection.
 *
 * Idempotent: the generated SQL uses `CREATE TABLE IF NOT EXISTS`. Enums and
 * constraints that already exist are skipped with a warning.
 *
 * Run: `bun run src/db/apply-migrations.ts`
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { env } from "../config/env.js";

const MIGRATIONS_DIR = join(import.meta.dir, "..", "..", "drizzle");

async function main() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.error(`No .sql files under ${MIGRATIONS_DIR}. Run 'bun run db:generate' first.`);
    process.exit(1);
  }

  const sql = postgres(env.DATABASE_URL, { prepare: false, max: 1 });

  try {
    for (const file of files) {
      const full = join(MIGRATIONS_DIR, file);
      const body = readFileSync(full, "utf8");
      const statements = body
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);

      console.log(`\n→ ${file}  (${statements.length} statements)`);
      for (const [i, stmt] of statements.entries()) {
        try {
          await sql.unsafe(stmt);
          process.stdout.write(".");
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const benign =
            msg.includes("already exists") ||
            msg.includes("duplicate key") ||
            msg.includes("duplicate object");
          if (benign) {
            process.stdout.write("~");
          } else {
            console.error(`\n  ✖ stmt ${i + 1} failed: ${msg}`);
            console.error(stmt.slice(0, 200));
            throw e;
          }
        }
      }
      console.log(`  done`);
    }
    console.log("\nAll migrations applied.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
