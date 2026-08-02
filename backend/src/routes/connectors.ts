import { Router } from "express";
import { z } from "zod";
import type { QueryExecutor } from "../db/pool.js";
import { createOrder } from "../domain/orders.js";
import { WooCommerceConnector } from "../connectors/woocommerce.js";
import { BasalamConnector } from "../connectors/basalam.js";
import { InstagramConnector } from "../connectors/instagram.js";
import type { NormalizedOrderEvent } from "../connectors/types.js";

const manualOrderSchema = z.object({
  sellerId: z.string().uuid(),
  channelConnectionId: z.string().uuid(),
  externalOrderId: z.string().min(1),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  items: z
    .array(z.object({ skuId: z.string().uuid(), quantity: z.number().int().positive(), unitPrice: z.number().nonnegative() }))
    .min(1)
});

/**
 * Resolves a connector's `externalSkuRef` (product/variant id) to an internal
 * Master SKU id via `channel_listing`. Unmatched listings are skipped —
 * consistent with the human-in-the-loop matching flow (docs/architecture.md §3).
 */
async function resolveOrderEventToOrder(
  db: QueryExecutor,
  sellerId: string,
  channelConnectionId: string,
  event: NormalizedOrderEvent
) {
  const items: Array<{ skuId: string; quantity: number; unitPrice: number }> = [];
  for (const item of event.items) {
    const [externalProductId, externalVariantId] = item.externalSkuRef.split(":");
    const listing = await db.query(
      `SELECT sku_id FROM channel_listing
       WHERE channel_connection_id = $1 AND external_product_id = $2
         AND (external_variant_id = $3 OR ($3 IS NULL AND external_variant_id IS NULL))
         AND sku_id IS NOT NULL`,
      [channelConnectionId, externalProductId, externalVariantId ?? null]
    );
    if (listing.rowCount === 0) continue; // not matched yet — surfaced via unmatched listing UI, not blocking order capture
    items.push({ skuId: listing.rows[0].sku_id, quantity: item.quantity, unitPrice: item.unitPrice });
  }

  return createOrder(db, {
    sellerId,
    channelConnectionId,
    externalOrderId: event.externalOrderId,
    status: event.status,
    customerName: event.customerName,
    customerPhone: event.customerPhone,
    totalAmount: event.totalAmount,
    placedAt: event.placedAt,
    items
  });
}

const webhookSchema = z.object({ sellerId: z.string().uuid(), channelConnectionId: z.string().uuid() });

export function connectorsRouter(db: QueryExecutor): Router {
  const router = Router();

  router.post("/connectors/woocommerce/webhook", async (req, res, next) => {
    try {
      const { sellerId, channelConnectionId } = webhookSchema.parse(req.query);
      const connector = new WooCommerceConnector({ siteUrl: "", consumerKey: "", consumerSecret: "" });
      const event = connector.handleWebhookPayload(req.body);
      if (!event) {
        res.status(200).json({ ignored: true });
        return;
      }
      const result = await resolveOrderEventToOrder(db, sellerId, channelConnectionId, event);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/connectors/basalam/webhook", async (req, res, next) => {
    try {
      const { sellerId, channelConnectionId } = webhookSchema.parse(req.query);
      const connector = new BasalamConnector({ accessToken: "" });
      const event = connector.handleWebhookPayload(req.body);
      if (!event) {
        res.status(200).json({ ignored: true });
        return;
      }
      const result = await resolveOrderEventToOrder(db, sellerId, channelConnectionId, event);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/connectors/instagram/manual-order", async (req, res, next) => {
    try {
      const parsed = manualOrderSchema.parse(req.body);
      const connector = new InstagramConnector();
      const event = connector.submitManualOrder(parsed);
      const result = await createOrder(db, {
        sellerId: parsed.sellerId,
        channelConnectionId: parsed.channelConnectionId,
        externalOrderId: event.externalOrderId,
        status: event.status,
        customerName: event.customerName,
        customerPhone: event.customerPhone,
        totalAmount: event.totalAmount,
        placedAt: event.placedAt,
        items: parsed.items
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
