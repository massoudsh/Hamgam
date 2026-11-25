import type { QueryExecutor } from "../db/pool.js";

const DAY_MS = 86_400_000;

export type VelocityStatus = "fast" | "healthy" | "slow" | "dead" | "idle";

export interface VelocityRow {
  skuId: string;
  internalCode: string;
  canonicalTitle: string;
  quantityOnHand: number;
  unitsSold: number;
  revenue: number;
  avgDailySales: number;
  /** Days until stock runs out at the current pace; null when nothing sold. */
  daysOfCover: number | null;
  status: VelocityStatus;
}

export interface VelocityReport {
  windowDays: number;
  items: VelocityRow[];
}

/**
 * Sales-velocity report: how fast each SKU moves, its stock cover in days, and a
 * status bucket that makes dead stock and fast movers obvious (Cin7/Linnworks-style
 * inventory health reporting).
 */
export async function getInventoryVelocity(
  db: QueryExecutor,
  sellerId: string,
  windowDays = 30
): Promise<VelocityReport> {
  const from = new Date(Date.now() - windowDays * DAY_MS);
  const result = await db.query(
    `SELECT s.id, s.internal_code, s.canonical_title, i.quantity_on_hand,
            COALESCE(sales.units_sold, 0) AS units_sold,
            COALESCE(sales.revenue, 0) AS revenue
     FROM sku s
     JOIN inventory i ON i.sku_id = s.id
     LEFT JOIN (
       SELECT oi.sku_id, SUM(oi.quantity) AS units_sold, SUM(oi.quantity * oi.unit_price) AS revenue
       FROM order_item oi
       JOIN "order" o ON o.id = oi.order_id
       WHERE o.seller_id = $1 AND o.placed_at >= $2 AND o.status <> 'cancelled'
       GROUP BY oi.sku_id
     ) sales ON sales.sku_id = s.id
     WHERE s.seller_id = $1
     ORDER BY units_sold DESC, i.quantity_on_hand DESC`,
    [sellerId, from]
  );

  const items: VelocityRow[] = result.rows.map((row) => {
    const unitsSold = Number(row.units_sold);
    const quantityOnHand = Number(row.quantity_on_hand);
    const avgDailySales = unitsSold / windowDays;
    const daysOfCover = avgDailySales > 0 ? quantityOnHand / avgDailySales : null;

    let status: VelocityStatus;
    if (unitsSold === 0) {
      status = quantityOnHand > 0 ? "dead" : "idle";
    } else if (daysOfCover !== null && daysOfCover <= 14) {
      status = "fast";
    } else if (daysOfCover !== null && daysOfCover <= 60) {
      status = "healthy";
    } else {
      status = "slow";
    }

    return {
      skuId: row.id,
      internalCode: row.internal_code,
      canonicalTitle: row.canonical_title,
      quantityOnHand,
      unitsSold,
      revenue: Number(row.revenue),
      avgDailySales: Math.round(avgDailySales * 100) / 100,
      daysOfCover: daysOfCover === null ? null : Math.round(daysOfCover * 10) / 10,
      status
    };
  });

  return { windowDays, items };
}

export interface CustomerInsightRow {
  name: string | null;
  phone: string | null;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: Date;
  isRepeat: boolean;
}

export interface CustomerInsights {
  totalCustomers: number;
  repeatCustomers: number;
  repeatRate: number;
  topCustomers: CustomerInsightRow[];
}

/**
 * Customer rollup (Hamsalam-style customer view): orders grouped by phone (falling
 * back to name), ranked by spend, with repeat-buyer counts.
 */
export async function getCustomerInsights(
  db: QueryExecutor,
  sellerId: string,
  limit = 10
): Promise<CustomerInsights> {
  const result = await db.query(
    `SELECT COALESCE(o.customer_phone, o.customer_name) AS customer_key,
            MAX(o.customer_name) AS name,
            MAX(o.customer_phone) AS phone,
            COUNT(*) AS order_count,
            COALESCE(SUM(o.total_amount), 0) AS total_spent,
            MAX(o.placed_at) AS last_order_at
     FROM "order" o
     WHERE o.seller_id = $1
       AND o.status <> 'cancelled'
       AND COALESCE(o.customer_phone, o.customer_name) IS NOT NULL
     GROUP BY COALESCE(o.customer_phone, o.customer_name)
     ORDER BY total_spent DESC, order_count DESC`,
    [sellerId]
  );

  const all: CustomerInsightRow[] = result.rows.map((row) => ({
    name: row.name ?? null,
    phone: row.phone ?? null,
    orderCount: Number(row.order_count),
    totalSpent: Number(row.total_spent),
    lastOrderAt: row.last_order_at,
    isRepeat: Number(row.order_count) > 1
  }));

  const repeatCustomers = all.filter((customer) => customer.isRepeat).length;
  return {
    totalCustomers: all.length,
    repeatCustomers,
    repeatRate: all.length === 0 ? 0 : Math.round((repeatCustomers / all.length) * 1000) / 10,
    topCustomers: all.slice(0, limit)
  };
}
