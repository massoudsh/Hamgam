import { Router } from "express";
import { z } from "zod";
import type { QueryExecutor } from "../db/pool.js";
import { syncInventoryToChannels, listSyncJobs, listConnectionErrors } from "../domain/listingSync.js";
import { createConnectorForChannel } from "../connectors/factory.js";

export function syncRouter(db: QueryExecutor): Router {
  const router = Router();

  // Pushes current stock for a SKU to all its matched channel listings; auto-disables at zero stock.
  router.post("/sync/inventory/:skuId", async (req, res, next) => {
    try {
      const { skuId } = z.object({ skuId: z.string().uuid() }).parse(req.params);
      const results = await syncInventoryToChannels(db, skuId, createConnectorForChannel);
      res.json({ results });
    } catch (err) {
      next(err);
    }
  });

  router.get("/sync/jobs", async (req, res, next) => {
    try {
      const { sellerId, status } = z
        .object({ sellerId: z.string().uuid(), status: z.string().optional() })
        .parse(req.query);
      const jobs = await listSyncJobs(db, sellerId, { status });
      res.json({ jobs });
    } catch (err) {
      next(err);
    }
  });

  // Powers the "connection error resolution" page.
  router.get("/sync/connection-errors", async (req, res, next) => {
    try {
      const { sellerId } = z.object({ sellerId: z.string().uuid() }).parse(req.query);
      const errors = await listConnectionErrors(db, sellerId);
      res.json({ errors });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
