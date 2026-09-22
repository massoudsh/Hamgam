import { Router } from "express";
import { z } from "zod";
import type { QueryExecutor } from "../db/pool.js";
import { listOrderHub } from "../domain/orders.js";

const filterSchema = z.object({
  sellerId: z.string().uuid(),
  channel: z.string().optional(),
  status: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

export function ordersRouter(db: QueryExecutor): Router {
  const router = Router();

  router.get("/orders", async (req, res, next) => {
    try {
      const parsed = filterSchema.parse(req.query);
      const rows = await listOrderHub(db, {
        sellerId: parsed.sellerId,
        channelCode: parsed.channel,
        status: parsed.status,
        from: parsed.from ? new Date(parsed.from) : undefined,
        to: parsed.to ? new Date(parsed.to) : undefined,
        limit: parsed.limit,
        offset: parsed.offset
      });
      res.json({ items: rows });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
