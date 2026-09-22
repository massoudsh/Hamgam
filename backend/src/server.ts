import { createApp } from "./app.js";
import { getPool } from "./db/pool.js";
import { runMigrations } from "./db/migrate.js";

const port = Number(process.env.PORT ?? 4000);
const pool = getPool();

async function main() {
  if (process.env.AUTO_MIGRATE === "true") {
    await runMigrations(pool);
  }
  const app = createApp(pool);
  app.listen(port, () => {
    console.log(`Hamgam backend listening on :${port}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
