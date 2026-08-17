import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { QueryExecutor } from "./db/pool.js";
import { healthRouter } from "./routes/health.js";
import { inventoryRouter } from "./routes/inventory.js";
import { ordersRouter } from "./routes/orders.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { connectorsRouter } from "./routes/connectors.js";
import { matchingRouter } from "./routes/matching.js";
import { syncRouter } from "./routes/sync.js";

export function createApp(db: QueryExecutor): Express {
  const app = express();
  app.use(express.json());

  app.use(healthRouter());
  app.use("/api", inventoryRouter(db));
  app.use("/api", ordersRouter(db));
  app.use("/api", dashboardRouter(db));
  app.use("/api", connectorsRouter(db));
  app.use("/api", matchingRouter(db));
  app.use("/api", syncRouter(db));

  // Central error handler — keeps internals out of client-facing errors.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : "internal_error";
    const status = message.includes("Insufficient") ? 409 : message.includes("no_rows") ? 404 : 400;
    res.status(status).json({ error: message });
  });

  return app;
}
