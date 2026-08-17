import type { QueryExecutor } from "../db/pool.js";
import type { ChannelConnector } from "../connectors/types.js";

/** Builds the right connector instance for a channel_connection's stored credentials. */
export type ConnectorResolver = (channelCode: string, credentials: unknown) => ChannelConnector;

export interface SyncResult {
  channelListingId: string;
  channelCode: string;
  status: "success" | "failed";
  errorMessage?: string;
}

/**
 * Channel sync engine (PRD F5/F6/F11): pushes a Master SKU's current stock to
 * every channel listing it's matched to, auto-disabling the listing when
 * stock hits zero and re-enabling it on restock — `pushInventoryUpdate`
 * derives active/instock state from the stock number on each connector
 * (see basalam.ts/woocommerce.ts). Every push attempt is recorded as a
 * `sync_job` row (success or failed) so it powers both the sync log and the
 * connection-error page below.
 */
export async function syncInventoryToChannels(
  db: QueryExecutor,
  skuId: string,
  resolveConnector: ConnectorResolver
): Promise<SyncResult[]> {
  const invRes = await db.query(`SELECT quantity_on_hand FROM inventory WHERE sku_id = $1`, [skuId]);
  if (invRes.rowCount === 0) return [];
  const quantityOnHand = Number(invRes.rows[0].quantity_on_hand);
  const desiredActive = quantityOnHand > 0;

  const listingsRes = await db.query(
    `SELECT cl.id, cl.channel_connection_id, cl.external_product_id, cl.external_variant_id,
            cc.credentials, cc.seller_id, ch.code AS channel_code
     FROM channel_listing cl
     JOIN channel_connection cc ON cc.id = cl.channel_connection_id
     JOIN channel ch ON ch.id = cc.channel_id
     WHERE cl.sku_id = $1`,
    [skuId]
  );

  const results: SyncResult[] = [];

  for (const row of listingsRes.rows) {
    const jobRes = await db.query(
      `INSERT INTO sync_job (seller_id, channel_listing_id, job_type, status)
       VALUES ($1,$2,'inventory_push','pending') RETURNING id`,
      [row.seller_id, row.id]
    );
    const jobId = jobRes.rows[0].id;

    try {
      const connector = resolveConnector(row.channel_code, row.credentials);
      await connector.pushInventoryUpdate({
        externalProductId: row.external_product_id,
        externalVariantId: row.external_variant_id ?? undefined,
        stock: quantityOnHand
      });

      await db.query(
        `UPDATE channel_listing SET is_active = $1, channel_stock = $2, last_synced_at = now() WHERE id = $3`,
        [desiredActive, quantityOnHand, row.id]
      );
      await db.query(
        `UPDATE sync_job SET status = 'success', finished_at = now() WHERE id = $1`,
        [jobId]
      );
      await db.query(
        `UPDATE channel_connection SET status = 'active', last_error = NULL, last_synced_at = now(), updated_at = now()
         WHERE id = $1`,
        [row.channel_connection_id]
      );
      results.push({ channelListingId: row.id, channelCode: row.channel_code, status: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown_error";
      await db.query(
        `UPDATE sync_job SET status = 'failed', error_message = $1, attempt_count = attempt_count + 1, finished_at = now()
         WHERE id = $2`,
        [message, jobId]
      );
      await db.query(
        `UPDATE channel_connection SET status = 'error', last_error = $1, updated_at = now() WHERE id = $2`,
        [message, row.channel_connection_id]
      );
      results.push({ channelListingId: row.id, channelCode: row.channel_code, status: "failed", errorMessage: message });
    }
  }

  return results;
}

export interface SyncJobRow {
  id: number;
  channelListingId: string | null;
  jobType: string;
  status: string;
  attemptCount: number;
  errorMessage: string | null;
  createdAt: Date;
  finishedAt: Date | null;
}

/** Powers the sync log (PRD F11): recent inventory push / order pull / reconciliation jobs for a seller. */
export async function listSyncJobs(
  db: QueryExecutor,
  sellerId: string,
  opts: { status?: string; limit?: number } = {}
): Promise<SyncJobRow[]> {
  const conditions = ["seller_id = $1"];
  const params: unknown[] = [sellerId];
  if (opts.status) {
    params.push(opts.status);
    conditions.push(`status = $${params.length}`);
  }
  const limit = opts.limit ?? 50;
  params.push(limit);

  const result = await db.query(
    `SELECT id, channel_listing_id, job_type, status, attempt_count, error_message, created_at, finished_at
     FROM sync_job
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    channelListingId: row.channel_listing_id,
    jobType: row.job_type,
    status: row.status,
    attemptCount: Number(row.attempt_count),
    errorMessage: row.error_message,
    createdAt: row.created_at,
    finishedAt: row.finished_at
  }));
}

export interface ConnectionErrorRow {
  channelConnectionId: string;
  channelCode: string;
  channelDisplayName: string;
  lastError: string | null;
  updatedAt: Date;
}

/** Powers the "رفع خطای اتصال" page (PRD F11): connections currently in an error state. */
export async function listConnectionErrors(db: QueryExecutor, sellerId: string): Promise<ConnectionErrorRow[]> {
  const result = await db.query(
    `SELECT cc.id AS channel_connection_id, ch.code AS channel_code, ch.display_name AS channel_display_name,
            cc.last_error, cc.updated_at
     FROM channel_connection cc
     JOIN channel ch ON ch.id = cc.channel_id
     WHERE cc.seller_id = $1 AND cc.status = 'error'
     ORDER BY cc.updated_at DESC`,
    [sellerId]
  );
  return result.rows.map((row) => ({
    channelConnectionId: row.channel_connection_id,
    channelCode: row.channel_code,
    channelDisplayName: row.channel_display_name,
    lastError: row.last_error,
    updatedAt: row.updated_at
  }));
}
