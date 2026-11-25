import type { QueryExecutor } from "../db/pool.js";

export type ListingIssue =
  | "unmatched"
  | "stock_mismatch"
  | "inactive_with_stock"
  | "active_out_of_stock"
  | "stale_sync";

export interface ListingHealthRow {
  channelListingId: string;
  channelCode: string;
  channelDisplayName: string;
  externalProductId: string;
  skuId: string | null;
  internalCode: string | null;
  canonicalTitle: string;
  isActive: boolean;
  channelStock: number | null;
  channelPrice: number | null;
  quantityOnHand: number | null;
  lastSyncedAt: Date | null;
  issues: ListingIssue[];
  severity: "error" | "warning" | "ok";
}

export interface ListingHealthSummary {
  totalListings: number;
  healthy: number;
  withWarnings: number;
  withErrors: number;
  items: ListingHealthRow[];
}

const STALE_SYNC_MS = 24 * 60 * 60 * 1000;

/**
 * Cross-channel discrepancy audit (competitive parity with seller hubs that ship a
 * "differences" report): compares every listing against the master stock record and
 * flags drift — stock not matching, active listings with no stock, in-stock listings
 * switched off, unmatched products, and listings that haven't been synced recently.
 */
export async function auditListingHealth(
  db: QueryExecutor,
  sellerId: string,
  now: Date = new Date()
): Promise<ListingHealthSummary> {
  const result = await db.query(
    `SELECT cl.id, cl.external_product_id, cl.is_active, cl.channel_stock, cl.channel_price,
            cl.last_synced_at, cl.match_status, cl.sku_id, cl.channel_title,
            s.internal_code, s.canonical_title, i.quantity_on_hand,
            ch.code AS channel_code, ch.display_name AS channel_display_name
     FROM channel_listing cl
     JOIN channel_connection cc ON cc.id = cl.channel_connection_id
     JOIN channel ch ON ch.id = cc.channel_id
     LEFT JOIN sku s ON s.id = cl.sku_id
     LEFT JOIN inventory i ON i.sku_id = cl.sku_id
     WHERE cc.seller_id = $1
     ORDER BY cl.last_synced_at ASC NULLS FIRST`,
    [sellerId]
  );

  const items: ListingHealthRow[] = result.rows.map((row) => {
    const issues: ListingIssue[] = [];
    const quantityOnHand = row.quantity_on_hand === null ? null : Number(row.quantity_on_hand);
    const channelStock = row.channel_stock === null ? null : Number(row.channel_stock);
    const isActive = Boolean(row.is_active);

    if (row.match_status === "unmatched" || row.sku_id === null || quantityOnHand === null) {
      issues.push("unmatched");
    } else {
      if (channelStock !== quantityOnHand) issues.push("stock_mismatch");
      if (!isActive && quantityOnHand > 0) issues.push("inactive_with_stock");
      if (isActive && quantityOnHand === 0) issues.push("active_out_of_stock");
    }

    const lastSyncedAt: Date | null = row.last_synced_at;
    const isStale = !lastSyncedAt || now.getTime() - new Date(lastSyncedAt).getTime() > STALE_SYNC_MS;
    if (isStale) issues.push("stale_sync");

    const severity: ListingHealthRow["severity"] = issues.some((issue) =>
      ["unmatched", "stock_mismatch", "active_out_of_stock"].includes(issue)
    )
      ? "error"
      : issues.length > 0
        ? "warning"
        : "ok";

    return {
      channelListingId: row.id,
      channelCode: row.channel_code,
      channelDisplayName: row.channel_display_name,
      externalProductId: row.external_product_id,
      skuId: row.sku_id ?? null,
      internalCode: row.internal_code ?? null,
      canonicalTitle: row.canonical_title ?? row.channel_title,
      isActive,
      channelStock,
      channelPrice: row.channel_price === null ? null : Number(row.channel_price),
      quantityOnHand,
      lastSyncedAt,
      issues,
      severity
    };
  });

  return {
    totalListings: items.length,
    healthy: items.filter((item) => item.severity === "ok").length,
    withWarnings: items.filter((item) => item.severity === "warning").length,
    withErrors: items.filter((item) => item.severity === "error").length,
    items
  };
}
