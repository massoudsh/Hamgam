import { Router } from "express";
import { z } from "zod";
import type { QueryExecutor } from "../db/pool.js";
import { getDashboardKpis } from "../domain/dashboard.js";

const querySchema = z.object({ sellerId: z.string().uuid() });

export function dashboardRouter(db: QueryExecutor): Router {
  const router = Router();

  router.get("/dashboard/kpis", async (req, res, next) => {
    try {
      const { sellerId } = querySchema.parse(req.query);
      const kpis = await getDashboardKpis(db, sellerId);
      res.json(kpis);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
