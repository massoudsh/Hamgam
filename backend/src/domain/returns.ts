import type { QueryExecutor } from "../db/pool.js";
import { adjustInventory } from "./inventory.js";

export interface CreateReturnInput {
  sellerId: string;
  orderId: string;
  reason?: string;
  items: Array<{
    orderItemId: string;
    quantity: number;
    restock?: boolean;
  }>;
}

export interface ReturnRow {
  id: string;
  orderId: string;
  status: string;
  reason: string | null;
  createdAt: Date;
  items: Array<{
    orderItemId: string;
    skuId: string;
    quantity: number;
    restock: boolean;
  }>;
}

export async function createReturn(db: QueryExecutor, input: CreateReturnInput): Promise<ReturnRow> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const order = await client.query(
      `SELECT id FROM "order" WHERE id = $1 AND seller_id = $2 AND status = 'shipped'`,
      [input.orderId, input.sellerId]
    );
    if (order.rowCount === 0) throw new Error("order_not_shipped");

    const orderItemById = new Map<string, { id: string; sku_id: string; quantity: number | string }>();
    for (const item of input.items) {
      const orderItem = await client.query(
        `SELECT oi.id, oi.sku_id, oi.quantity,
                COALESCE(SUM(CASE WHEN rr.order_id = oi.order_id THEN ri.quantity ELSE 0 END), 0) AS returned_quantity
         FROM order_item oi
         LEFT JOIN return_item ri ON ri.order_item_id = oi.id
         LEFT JOIN return_request rr ON rr.id = ri.return_request_id
         WHERE oi.order_id = $1 AND oi.id = $2
         GROUP BY oi.id, oi.sku_id, oi.quantity`,
        [input.orderId, item.orderItemId]
      );
      if (orderItem.rowCount === 0) throw new Error("return_item_not_found");
      const row = orderItem.rows[0];
      orderItemById.set(row.id, row);
      if (item.quantity + Number(row.returned_quantity) > Number(row.quantity)) {
        throw new Error("return_quantity_exceeds_ordered");
      }
    }

    const created = await client.query(
      `INSERT INTO return_request (order_id, status, reason) VALUES ($1, 'received', $2) RETURNING id, status, reason, created_at`,
      [input.orderId, input.reason ?? null]
    );
    const returnId = created.rows[0].id as string;
    const items: ReturnRow["items"] = [];

    for (const item of input.items) {
      const orderItem = orderItemById.get(item.orderItemId)!;
      const restock = item.restock ?? true;
      await client.query(
        `INSERT INTO return_item (return_request_id, order_item_id, quantity, restock) VALUES ($1, $2, $3, $4)`,
        [returnId, item.orderItemId, item.quantity, restock]
      );
      items.push({ orderItemId: item.orderItemId, skuId: orderItem.sku_id, quantity: item.quantity, restock });
    }

    await client.query(`UPDATE "order" SET status = 'returned', updated_at = now() WHERE id = $1`, [input.orderId]);
    await client.query("COMMIT");

    for (const item of items) {
      if (item.restock) {
        await adjustInventory(db, {
          skuId: item.skuId,
          changeQty: item.quantity,
          reason: "return",
          eventId: `return:${returnId}:${item.orderItemId}`,
          referenceId: returnId
        });
      }
    }

    return {
      id: returnId,
      orderId: input.orderId,
      status: created.rows[0].status,
      reason: created.rows[0].reason,
      createdAt: created.rows[0].created_at,
      items
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function listReturns(db: QueryExecutor, sellerId: string): Promise<ReturnRow[]> {
  const result = await db.query(
    `SELECT rr.id, rr.order_id, rr.status, rr.reason, rr.created_at,
            ri.order_item_id, oi.sku_id, ri.quantity, ri.restock
     FROM return_request rr
     JOIN "order" o ON o.id = rr.order_id
     JOIN return_item ri ON ri.return_request_id = rr.id
     JOIN order_item oi ON oi.id = ri.order_item_id
     WHERE o.seller_id = $1
     ORDER BY rr.created_at DESC, ri.id ASC`,
    [sellerId]
  );
  const returns = new Map<string, ReturnRow>();
  for (const row of result.rows) {
    let returned = returns.get(row.id);
    if (!returned) {
      returned = {
        id: row.id,
        orderId: row.order_id,
        status: row.status,
        reason: row.reason,
        createdAt: row.created_at,
        items: []
      };
      returns.set(row.id, returned);
    }
    returned.items.push({
      orderItemId: row.order_item_id,
      skuId: row.sku_id,
      quantity: Number(row.quantity),
      restock: row.restock
    });
  }
  return [...returns.values()];
}
