import type { QueryExecutor } from "../db/pool.js";
import { adjustInventory, InsufficientStockError } from "./inventory.js";

export interface NormalizedOrderItem {
  skuId: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateOrderInput {
  sellerId: string;
  channelConnectionId: string;
  externalOrderId: string;
  status?: string;
  customerName?: string;
  customerPhone?: string;
  totalAmount?: number;
  placedAt: Date;
  items: NormalizedOrderItem[];
}

export interface CreateOrderResult {
  orderId: string;
  created: boolean; // false if this order already existed (idempotent replay)
  outOfStockSkuIds: string[];
}

/**
 * Creates an order and decrements inventory for each line item.
 * Idempotent on (channel_connection_id, external_order_id): a duplicate
 * webhook/poll for the same channel order is a no-op that returns the
 * existing order id instead of creating a duplicate or double-decrementing stock.
 */
export async function createOrder(
  db: QueryExecutor,
  input: CreateOrderInput
): Promise<CreateOrderResult> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id FROM "order" WHERE channel_connection_id = $1 AND external_order_id = $2`,
      [input.channelConnectionId, input.externalOrderId]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      await client.query("COMMIT");
      return { orderId: existing.rows[0].id, created: false, outOfStockSkuIds: [] };
    }

    const inserted = await client.query(
      `INSERT INTO "order"
        (seller_id, channel_connection_id, external_order_id, status, customer_name, customer_phone, total_amount, placed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [
        input.sellerId,
        input.channelConnectionId,
        input.externalOrderId,
        input.status ?? "new",
        input.customerName ?? null,
        input.customerPhone ?? null,
        input.totalAmount ?? null,
        input.placedAt
      ]
    );
    const orderId = inserted.rows[0].id as string;

    for (const item of input.items) {
      await client.query(
        `INSERT INTO order_item (order_id, sku_id, quantity, unit_price) VALUES ($1,$2,$3,$4)`,
        [orderId, item.skuId, item.quantity, item.unitPrice]
      );
    }

    await client.query("COMMIT");

    const outOfStockSkuIds: string[] = [];
    for (const item of input.items) {
      try {
        const snapshot = await adjustInventory(db, {
          skuId: item.skuId,
          changeQty: -item.quantity,
          reason: "order",
          eventId: `order:${orderId}:${item.skuId}`,
          referenceId: orderId
        });
        if (snapshot.isOutOfStock) outOfStockSkuIds.push(item.skuId);
      } catch (err) {
        if (err instanceof InsufficientStockError) {
          // Order is still recorded (source of truth for what was sold); the
          // stock discrepancy is surfaced to the seller instead of silently dropped.
          outOfStockSkuIds.push(item.skuId);
          continue;
        }
        throw err;
      }
    }

    return { orderId, created: true, outOfStockSkuIds };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export interface OrderHubFilters {
  sellerId: string;
  channelCode?: string;
  status?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface OrderHubRow {
  id: string;
  externalOrderId: string;
  status: string;
  channelCode: string;
  channelDisplayName: string;
  customerName: string | null;
  totalAmount: number | null;
  placedAt: Date;
}

export interface ReturnableOrderItem {
  id: string;
  skuId: string;
  canonicalTitle: string;
  quantity: number;
}

export async function listReturnableOrderItems(
  db: QueryExecutor,
  sellerId: string,
  orderId: string
): Promise<ReturnableOrderItem[]> {
  const result = await db.query(
    `SELECT oi.id, oi.sku_id, s.canonical_title, oi.quantity
     FROM order_item oi
     JOIN "order" o ON o.id = oi.order_id
     JOIN sku s ON s.id = oi.sku_id
     WHERE oi.order_id = $1 AND o.seller_id = $2 AND o.status = 'shipped'
     ORDER BY oi.id`,
    [orderId, sellerId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    skuId: row.sku_id,
    canonicalTitle: row.canonical_title,
    quantity: Number(row.quantity)
  }));
}


  const conditions: string[] = [`o.seller_id = $1`];
  const params: unknown[] = [filters.sellerId];

  if (filters.channelCode) {
    params.push(filters.channelCode);
    conditions.push(`c.code = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`o.status = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    conditions.push(`o.placed_at >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    conditions.push(`o.placed_at <= $${params.length}`);
  }

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  params.push(limit);
  params.push(offset);

  const result = await db.query(
    `SELECT o.id, o.external_order_id, o.status, c.code AS channel_code, c.display_name AS channel_display_name,
            o.customer_name, o.total_amount, o.placed_at
     FROM "order" o
     JOIN channel_connection cc ON cc.id = o.channel_connection_id
     JOIN channel c ON c.id = cc.channel_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY o.placed_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return result.rows.map((row) => ({
    id: row.id,
    externalOrderId: row.external_order_id,
    status: row.status,
    channelCode: row.channel_code,
    channelDisplayName: row.channel_display_name,
    customerName: row.customer_name,
    totalAmount: row.total_amount === null ? null : Number(row.total_amount),
    placedAt: row.placed_at
  }));
}
