import type { QueryExecutor } from "../db/pool.js";

export interface DashboardKpis {
  ordersLast30Days: number;
  criticalStockSkuCount: number;
  overslellingPreventedCount: number;
}

export interface SalesReport {
  byChannel: Array<{ channelCode: string; channelDisplayName: string; orderCount: number; totalAmount: number }>;
  byStatus: Array<{ status: string; orderCount: number }>;
}

export async function getSalesReport(db: QueryExecutor, sellerId: string): Promise<SalesReport> {
  const [channels, statuses] = await Promise.all([
    db.query(
      `SELECT ch.code, ch.display_name, COUNT(o.id)::int AS order_count,
              COALESCE(SUM(o.total_amount), 0) AS total_amount
       FROM "order" o
       JOIN channel_connection cc ON cc.id = o.channel_connection_id
       JOIN channel ch ON ch.id = cc.channel_id
       WHERE o.seller_id = $1
       GROUP BY ch.code, ch.display_name
       ORDER BY total_amount DESC`,
      [sellerId]
    ),
    db.query(
      `SELECT status, COUNT(*)::int AS order_count
       FROM "order"
       WHERE seller_id = $1
       GROUP BY status
       ORDER BY order_count DESC`,
      [sellerId]
    )
  ]);

  return {
    byChannel: channels.rows.map((row) => ({
      channelCode: row.code,
      channelDisplayName: row.display_name,
      orderCount: Number(row.order_count),
      totalAmount: Number(row.total_amount)
    })),
    byStatus: statuses.rows.map((row) => ({ status: row.status, orderCount: Number(row.order_count) }))
  };
}

/**
 * Counts recent orders, critical stock items, and prevented overselling events.
 * Prevented events are ledger entries for SKUs currently at zero stock.
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
