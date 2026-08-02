import { newDb, DataType } from "pg-mem";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { QueryExecutor } from "../src/db/pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

/**
 * Spins up an in-memory PostgreSQL-compatible database (pg-mem) for tests.
 * This lets domain/route tests run without a real Postgres server, which
 * matches this project's "no heavy infra in the dev container" constraint
 * while still exercising real SQL (transactions, FKs, CHECK constraints,
 * UNIQUE constraints, `FOR UPDATE`, etc.) rather than a hand-rolled mock.
 */
export async function createTestDb(): Promise<QueryExecutor> {
  const db = newDb({ autoCreateForeignKeyIndices: true });

  db.public.registerFunction({
    name: "gen_random_uuid",
    returns: DataType.uuid,
    implementation: () => randomUUID(),
    impure: true
  });

  const { Pool } = db.adapters.createPg();
  const pool = new Pool() as unknown as QueryExecutor;

  // pg-mem doesn't support `CREATE EXTENSION` — strip it; gen_random_uuid is
  // registered natively above instead of via the real pgcrypto extension.
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8").replace(/CREATE EXTENSION[^;]*;/gi, "");
    await pool.query(sql);
  }

  return pool;
}
