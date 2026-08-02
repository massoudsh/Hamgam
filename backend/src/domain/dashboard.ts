import type { QueryExecutor } from "../db/pool.js";

export interface DashboardKpis {
  ordersLast30Days: number;
  criticalStockSkuCount: number;
  overslellingPreventedCount: number;
}

/**
 * "Prevented overselling" = number of order line items in the last 30 days
 * that would have driven a SKU negative but were instead recorded as
 * out-of-stock (see InsufficientStockError handling in domain/orders.ts),
 * i.e. `inventory_ledger` entries whose SKU is currently at 0.
 */
export async function getDashboardKpis(db: QueryExecutor, sellerId: string): Promise<DashboardKpis> {
  const orders = await db.query(
    `SELECT COUNT(*)::int AS count FROM "order"
     WHERE seller_id = $1 AND placed_at >= now() - interval '30 days'`,
    [sellerId]
  );

  const critical = await db.query(
    `SELECT COUNT(*)::int AS count FROM inventory i
     JOIN sku s ON s.id = i.sku_id
     WHERE s.seller_id = $1 AND i.quantity_on_hand <= i.low_stock_threshold`,
    [sellerId]
  );

  const prevented = await db.query(
    `SELECT COUNT(*)::int AS count FROM inventory_ledger il
     JOIN sku s ON s.id = il.sku_id
     JOIN inventory i ON i.sku_id = il.sku_id
     WHERE s.seller_id = $1 AND i.quantity_on_hand = 0
       AND il.created_at >= now() - interval '30 days'`,
    [sellerId]
  );

  return {
    ordersLast30Days: orders.rows[0].count,
    criticalStockSkuCount: critical.rows[0].count,
    overslellingPreventedCount: prevented.rows[0].count
  };
}
