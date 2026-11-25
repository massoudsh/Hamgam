import type { QueryExecutor } from "../db/pool.js";
import { adjustInventory } from "./inventory.js";
import { ConflictError, NotFoundError } from "../errors.js";

export interface ReplenishmentSuggestion {
  skuId: string;
  internalCode: string;
  canonicalTitle: string;
  quantityOnHand: number;
  lowStockThreshold: number;
  unitsSold: number;
  onOrder: number;
  avgDailySales: number;
  /** Days of stock left at current sales pace; null when there were no sales. */
  daysOfCover: number | null;
  suggestedQty: number;
}

export interface ReplenishmentOptions {
  windowDays?: number;
  leadTimeDays?: number;
  targetCoverDays?: number;
}

const DAY_MS = 86_400_000;

/**
 * Replenishment engine: turns recent sales velocity into a suggested purchase
 * quantity per SKU, netting out stock already on the way (open purchase orders).
 * Suggestion = avg daily sales × (lead time + target cover) − on hand − on order.
 * SKUs with no sales in the window are only suggested when they sit at/below the
 * low-stock threshold and have nothing on order, so the list stays actionable.
 */
export async function suggestReplenishment(
  db: QueryExecutor,
  sellerId: string,
  options: ReplenishmentOptions = {}
): Promise<ReplenishmentSuggestion[]> {
  const windowDays = options.windowDays ?? 30;
  const leadTimeDays = options.leadTimeDays ?? 7;
  const targetCoverDays = options.targetCoverDays ?? 30;
  const from = new Date(Date.now() - windowDays * DAY_MS);

  const result = await db.query(
    `SELECT s.id, s.internal_code, s.canonical_title,
            i.quantity_on_hand, i.low_stock_threshold,
            COALESCE(sales.units_sold, 0) AS units_sold,
            COALESCE(on_order.on_order, 0) AS on_order
     FROM sku s
     JOIN inventory i ON i.sku_id = s.id
     LEFT JOIN (
       SELECT oi.sku_id, SUM(oi.quantity) AS units_sold
       FROM order_item oi
       JOIN "order" o ON o.id = oi.order_id
       WHERE o.seller_id = $1 AND o.placed_at >= $2 AND o.status <> 'cancelled'
       GROUP BY oi.sku_id
     ) sales ON sales.sku_id = s.id
     LEFT JOIN (
       SELECT poi.sku_id, SUM(poi.quantity_ordered - poi.quantity_received) AS on_order
       FROM purchase_order_item poi
       JOIN purchase_order po ON po.id = poi.purchase_order_id
       WHERE po.seller_id = $1 AND po.status IN ('ordered', 'partially_received')
       GROUP BY poi.sku_id
     ) on_order ON on_order.sku_id = s.id
     WHERE s.seller_id = $1`,
    [sellerId, from]
  );

  const suggestions: ReplenishmentSuggestion[] = [];
  for (const row of result.rows) {
    const quantityOnHand = Number(row.quantity_on_hand);
    const lowStockThreshold = Number(row.low_stock_threshold);
    const unitsSold = Number(row.units_sold);
    const onOrder = Number(row.on_order);
    const avgDailySales = unitsSold / windowDays;
    const daysOfCover = avgDailySales > 0 ? quantityOnHand / avgDailySales : null;

    let suggestedQty = 0;
    if (avgDailySales > 0) {
      const target = Math.ceil(avgDailySales * (leadTimeDays + targetCoverDays));
      suggestedQty = Math.max(0, target - quantityOnHand - onOrder);
    } else if (onOrder === 0 && quantityOnHand <= lowStockThreshold) {
      suggestedQty = Math.max(lowStockThreshold - quantityOnHand, quantityOnHand === 0 ? 1 : 0);
    }

    if (suggestedQty <= 0) continue;
    suggestions.push({
      skuId: row.id,
      internalCode: row.internal_code,
      canonicalTitle: row.canonical_title,
      quantityOnHand,
      lowStockThreshold,
      unitsSold,
      onOrder,
      avgDailySales: round2(avgDailySales),
      daysOfCover: daysOfCover === null ? null : round2(daysOfCover),
      suggestedQty
    });
  }

  return suggestions.sort((a, b) => {
    // Most urgent first: lowest cover, no-sales rows (null) last.
    if (a.daysOfCover === null && b.daysOfCover === null) return b.unitsSold - a.unitsSold;
    if (a.daysOfCover === null) return 1;
    if (b.daysOfCover === null) return -1;
    return a.daysOfCover - b.daysOfCover;
  });
}

export interface CreatePurchaseOrderInput {
  sellerId: string;
  supplierName?: string;
  expectedAt?: Date;
  notes?: string;
  items: Array<{ skuId: string; quantity: number; unitCost?: number }>;
}

export interface PurchaseOrderItemRow {
  id: string;
  skuId: string;
  internalCode: string;
  canonicalTitle: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number | null;
}

export interface PurchaseOrderRow {
  id: string;
  supplierName: string | null;
  status: string;
  expectedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  items: PurchaseOrderItemRow[];
}

export async function createPurchaseOrder(
  db: QueryExecutor,
  input: CreatePurchaseOrderInput
): Promise<PurchaseOrderRow> {
  const uniqueSkus = new Set(input.items.map((item) => item.skuId));
  if (uniqueSkus.size !== input.items.length) throw new ConflictError("duplicate_sku");

  const owned = await db.query(`SELECT id FROM sku WHERE seller_id = $1`, [input.sellerId]);
  const ownedIds = new Set(owned.rows.map((row) => row.id as string));
  for (const skuId of uniqueSkus) {
    if (!ownedIds.has(skuId)) throw new NotFoundError("sku_not_found");
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const created = await client.query(
      `INSERT INTO purchase_order (seller_id, supplier_name, status, expected_at, notes)
       VALUES ($1,$2,'ordered',$3,$4) RETURNING id, created_at`,
      [input.sellerId, input.supplierName ?? null, input.expectedAt ?? null, input.notes ?? null]
    );
    const orderId = created.rows[0].id as string;
    for (const item of input.items) {
      await client.query(
        `INSERT INTO purchase_order_item (purchase_order_id, sku_id, quantity_ordered, unit_cost)
         VALUES ($1,$2,$3,$4)`,
        [orderId, item.skuId, item.quantity, item.unitCost ?? null]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const rows = await listPurchaseOrders(db, input.sellerId);
  return rows[0];
}

export async function listPurchaseOrders(db: QueryExecutor, sellerId: string): Promise<PurchaseOrderRow[]> {
  const result = await db.query(
    `SELECT po.id, po.supplier_name, po.status, po.expected_at, po.notes, po.created_at,
            poi.id AS item_id, poi.sku_id, poi.quantity_ordered, poi.quantity_received, poi.unit_cost,
            s.internal_code, s.canonical_title
     FROM purchase_order po
     LEFT JOIN purchase_order_item poi ON poi.purchase_order_id = po.id
     LEFT JOIN sku s ON s.id = poi.sku_id
     WHERE po.seller_id = $1
     ORDER BY po.created_at DESC, poi.id ASC`,
    [sellerId]
  );

  const orders = new Map<string, PurchaseOrderRow>();
  for (const row of result.rows) {
    let order = orders.get(row.id);
    if (!order) {
      order = {
        id: row.id,
        supplierName: row.supplier_name,
        status: row.status,
        expectedAt: row.expected_at,
        notes: row.notes,
        createdAt: row.created_at,
        items: []
      };
      orders.set(row.id, order);
    }
    if (row.item_id) {
      order.items.push({
        id: row.item_id,
        skuId: row.sku_id,
        internalCode: row.internal_code,
        canonicalTitle: row.canonical_title,
        quantityOrdered: Number(row.quantity_ordered),
        quantityReceived: Number(row.quantity_received),
        unitCost: row.unit_cost === null ? null : Number(row.unit_cost)
      });
    }
  }
  return [...orders.values()];
}

export interface ReceiveResult {
  purchaseOrderId: string;
  itemId: string;
  quantityReceived: number;
  status: string;
}

/**
 * Receives units against a purchase order line. Stock only increases here —
 * ordered quantities alone never touch inventory. The idempotency key is derived
 * from the cumulative received count, so replaying the same request is a no-op
 * rather than a double restock.
 */
export async function receivePurchaseOrderItem(
  db: QueryExecutor,
  sellerId: string,
  purchaseOrderId: string,
  itemId: string,
  quantity: number
): Promise<ReceiveResult> {
  const itemRes = await db.query(
    `SELECT poi.id, poi.sku_id, poi.quantity_ordered, poi.quantity_received, po.status
     FROM purchase_order_item poi
     JOIN purchase_order po ON po.id = poi.purchase_order_id
     WHERE poi.id = $1 AND poi.purchase_order_id = $2 AND po.seller_id = $3`,
    [itemId, purchaseOrderId, sellerId]
  );
  if (itemRes.rowCount === 0) throw new NotFoundError("purchase_order_item_not_found");

  const item = itemRes.rows[0];
  if (item.status === "cancelled") throw new ConflictError("purchase_order_cancelled");

  const ordered = Number(item.quantity_ordered);
  const alreadyReceived = Number(item.quantity_received);
  if (alreadyReceived + quantity > ordered) throw new ConflictError("quantity_exceeds_ordered");

  const nextReceived = alreadyReceived + quantity;
  await db.query(
    `UPDATE purchase_order_item SET quantity_received = $1 WHERE id = $2`,
    [nextReceived, itemId]
  );

  // Compare in JS rather than with COUNT(*) FILTER, which isn't portable to the
  // in-memory test database.
  const lines = await db.query(
    `SELECT quantity_ordered, quantity_received FROM purchase_order_item WHERE purchase_order_id = $1`,
    [purchaseOrderId]
  );
  const fullyReceived = lines.rows.every(
    (line) => Number(line.quantity_received) >= Number(line.quantity_ordered)
  );
  const status = fullyReceived ? "received" : "partially_received";
  await db.query(`UPDATE purchase_order SET status = $1, updated_at = now() WHERE id = $2`, [
    status,
    purchaseOrderId
  ]);

  await adjustInventory(db, {
    skuId: item.sku_id,
    changeQty: quantity,
    reason: "purchase_receipt",
    eventId: `po:${purchaseOrderId}:${itemId}:${nextReceived}`,
    referenceId: purchaseOrderId
  });

  return { purchaseOrderId, itemId, quantityReceived: nextReceived, status };
}

export async function cancelPurchaseOrder(
  db: QueryExecutor,
  sellerId: string,
  purchaseOrderId: string
): Promise<void> {
  const res = await db.query(
    `SELECT status FROM purchase_order WHERE id = $1 AND seller_id = $2`,
    [purchaseOrderId, sellerId]
  );
  if (res.rowCount === 0) throw new NotFoundError("purchase_order_not_found");
  if (res.rows[0].status === "received") throw new ConflictError("purchase_order_already_received");
  await db.query(`UPDATE purchase_order SET status = 'cancelled', updated_at = now() WHERE id = $1`, [
    purchaseOrderId
  ]);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
