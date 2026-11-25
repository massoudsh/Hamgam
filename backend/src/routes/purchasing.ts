import { Router } from "express";
import { z } from "zod";
import type { QueryExecutor } from "../db/pool.js";
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  listPurchaseOrders,
  receivePurchaseOrderItem,
  suggestReplenishment
} from "../domain/purchasing.js";

const sellerSchema = z.object({ sellerId: z.string().uuid() });

const suggestionSchema = z.object({
  sellerId: z.string().uuid(),
  windowDays: z.coerce.number().int().min(1).max(365).optional(),
  leadTimeDays: z.coerce.number().int().min(0).max(180).optional(),
  targetCoverDays: z.coerce.number().int().min(0).max(365).optional()
});

const createSchema = z.object({
  sellerId: z.string().uuid(),
  supplierName: z.string().max(200).optional(),
  expectedAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
  items: z
    .array(
      z.object({
        skuId: z.string().uuid(),
        quantity: z.number().int().positive().max(1_000_000),
        unitCost: z.number().nonnegative().optional()
      })
    )
    .min(1)
    .max(200)
});

const receiveSchema = z.object({
  sellerId: z.string().uuid(),
  quantity: z.number().int().positive().max(1_000_000)
});

const paramsSchema = z.object({ orderId: z.string().uuid() });
const receiveParamsSchema = z.object({ orderId: z.string().uuid(), itemId: z.string().uuid() });

export function purchasingRouter(db: QueryExecutor): Router {
  const router = Router();

  router.get("/purchasing/suggestions", async (req, res, next) => {
    try {
      const parsed = suggestionSchema.parse(req.query);
      const items = await suggestReplenishment(db, parsed.sellerId, {
        windowDays: parsed.windowDays,
        leadTimeDays: parsed.leadTimeDays,
        targetCoverDays: parsed.targetCoverDays
      });
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  router.get("/purchasing/orders", async (req, res, next) => {
    try {
      const { sellerId } = sellerSchema.parse(req.query);
      res.json({ items: await listPurchaseOrders(db, sellerId) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/purchasing/orders", async (req, res, next) => {
    try {
      const parsed = createSchema.parse(req.body);
      const order = await createPurchaseOrder(db, {
        sellerId: parsed.sellerId,
        supplierName: parsed.supplierName,
        expectedAt: parsed.expectedAt ? new Date(parsed.expectedAt) : undefined,
        notes: parsed.notes,
        items: parsed.items
      });
      res.status(201).json(order);
    } catch (err) {
      next(err);
    }
  });

  router.post("/purchasing/orders/:orderId/cancel", async (req, res, next) => {
    try {
      const { sellerId } = z.object({ sellerId: z.string().uuid() }).parse(req.body);
      const { orderId } = paramsSchema.parse(req.params);
      await cancelPurchaseOrder(db, sellerId, orderId);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post("/purchasing/orders/:orderId/items/:itemId/receive", async (req, res, next) => {
    try {
      const parsed = receiveSchema.parse(req.body);
      const { orderId, itemId } = receiveParamsSchema.parse(req.params);
      const result = await receivePurchaseOrderItem(db, parsed.sellerId, orderId, itemId, parsed.quantity);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
