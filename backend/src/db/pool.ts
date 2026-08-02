import pg from "pg";

const { Pool } = pg;

export type QueryExecutor = Pick<pg.Pool, "query" | "connect">;

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX ?? 10)
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
