import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { QueryExecutor } from "./pool.js";
import { getPool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

export async function runMigrations(executor: QueryExecutor): Promise<void> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    await executor.query(sql);
  }
}

// CLI entrypoint: `npm run migrate`
if (process.argv[1] && process.argv[1].endsWith("migrate.ts")) {
  const pool = getPool();
  runMigrations(pool)
    .then(() => {
      console.log("Migrations applied successfully.");
      return pool.end();
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exitCode = 1;
    });
}
