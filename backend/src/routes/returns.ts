import { Router } from "express";
import { z } from "zod";
import type { QueryExecutor } from "../db/pool.js";
import { createReturn, listReturns } from "../domain/returns.js";

const returnSchema = z.object({
  sellerId: z.string().uuid(),
  orderId: z.string().uuid(),
  reason: z.string().max(200).optional(),
  items: z
    .array(
      z.object({
        orderItemId: z.string().uuid(),
        quantity: z.number().int().positive(),
        restock: z.boolean().optional()
      })
    )
    .min(1)
    .refine((items) => new Set(items.map((item) => item.orderItemId)).size === items.length, {
      message: "duplicate_order_item"
    })
});

const listSchema = z.object({ sellerId: z.string().uuid() });

export function returnsRouter(db: QueryExecutor): Router {
  const router = Router();

  router.post("/returns", async (req, res, next) => {
    try {
      const returned = await createReturn(db, returnSchema.parse(req.body));
      res.status(201).json(returned);
    } catch (err) {
      next(err);
    }
  });

  router.get("/returns", async (req, res, next) => {
    try {
      const returns = await listReturns(db, listSchema.parse(req.query).sellerId);
      res.json({ items: returns });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
