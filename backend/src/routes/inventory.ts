import { Router } from "express";
import { z } from "zod";
import type { QueryExecutor } from "../db/pool.js";
import { getInventory, listCriticalStock } from "../domain/inventory.js";

const querySchema = z.object({ sellerId: z.string().uuid() });

export function inventoryRouter(db: QueryExecutor): Router {
  const router = Router();

  router.get("/inventory/critical", async (req, res, next) => {
    try {
      const { sellerId } = querySchema.parse(req.query);
      const rows = await listCriticalStock(db, sellerId);
      res.json({ items: rows });
    } catch (err) {
      next(err);
    }
  });

  router.get("/inventory/:skuId", async (req, res, next) => {
    try {
      const snapshot = await getInventory(db, req.params.skuId);
      if (!snapshot) {
        res.status(404).json({ error: "sku_not_found" });
        return;
      }
      res.json(snapshot);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
