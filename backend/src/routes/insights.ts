import { Router } from "express";
import { z } from "zod";
import type { QueryExecutor } from "../db/pool.js";
import { auditListingHealth } from "../domain/inventoryHealth.js";
import { getCustomerInsights, getInventoryVelocity } from "../domain/analytics.js";

const sellerSchema = z.object({ sellerId: z.string().uuid() });
const velocitySchema = z.object({
  sellerId: z.string().uuid(),
  windowDays: z.coerce.number().int().min(1).max(365).optional()
});
const customerSchema = z.object({
  sellerId: z.string().uuid(),
  limit: z.coerce.number().int().positive().max(100).optional()
});

export function insightsRouter(db: QueryExecutor): Router {
  const router = Router();

  router.get("/listing-health", async (req, res, next) => {
    try {
      const { sellerId } = sellerSchema.parse(req.query);
      res.json(await auditListingHealth(db, sellerId));
    } catch (err) {
      next(err);
    }
  });

  router.get("/analytics/velocity", async (req, res, next) => {
    try {
      const { sellerId, windowDays } = velocitySchema.parse(req.query);
      res.json(await getInventoryVelocity(db, sellerId, windowDays ?? 30));
    } catch (err) {
      next(err);
    }
  });

  router.get("/analytics/customers", async (req, res, next) => {
    try {
      const { sellerId, limit } = customerSchema.parse(req.query);
      res.json(await getCustomerInsights(db, sellerId, limit ?? 10));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
