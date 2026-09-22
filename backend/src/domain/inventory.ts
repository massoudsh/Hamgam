import type { QueryExecutor } from "../db/pool.js";
import { syncInventoryToChannels } from "./listingSync.js";
import { createConnectorForChannel } from "../connectors/factory.js";

export class InsufficientStockError extends Error {
  constructor(skuId: string) {
    super(`Insufficient stock for SKU ${skuId}`);
    this.name = "InsufficientStockError";
  }
}

export class ConcurrencyConflictError extends Error {
  constructor(skuId: string) {
    super(`Concurrent inventory update conflict for SKU ${skuId} — retry`);
    this.name = "ConcurrencyConflictError";
  }
}

export type InventoryReason = "order" | "return" | "manual_adjustment" | "reconciliation";

export interface AdjustInventoryInput {
  skuId: string;
  /** Negative = decrease (sale), positive = increase (restock/return). */
  changeQty: number;
  reason: InventoryReason;
  /** Idempotency key, e.g. `orderId` or `channel:eventId`. Prevents double-processing. */
  eventId: string;
  referenceId?: string;
  maxRetries?: number;
}

export interface InventorySnapshot {
  skuId: string;
  quantityOnHand: number;
  quantityReserved: number;
  lowStockThreshold: number;
  version: number;
  isOutOfStock: boolean;
}

export type InventorySyncHandler = (skuId: string) => Promise<unknown>;

export interface AdjustInventoryOptions {
  sync?: InventorySyncHandler;
}

/**
 * Adjusts inventory for a Master SKU using optimistic concurrency (`version` column)
 * and idempotency (`processed_event` table). Safe to call multiple times with the
 * same `eventId` — only the first call has an effect.
 *
 * Retries automatically on concurrent version conflicts (another sale from a
 * different channel racing on the same SKU), up to `maxRetries` attempts.
 */
export async function adjustInventory(
  db: QueryExecutor,
  input: AdjustInventoryInput,
  options: AdjustInventoryOptions = {}
): Promise<InventorySnapshot> {
  const sync = options.sync ?? ((skuId: string) => syncInventoryToChannels(db, skuId, createConnectorForChannel));
  const maxRetries = input.maxRetries ?? 5;
  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxRetries) {
    attempt += 1;
    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const already = await client.query(
        `SELECT 1 FROM processed_event WHERE event_id = $1`,
        [input.eventId]
      );
      if (already.rowCount && already.rowCount > 0) {
        // Already applied — return the current snapshot without changing anything.
        const current = await client.query(
          `SELECT sku_id, quantity_on_hand, quantity_reserved, low_stock_threshold, version
           FROM inventory WHERE sku_id = $1`,
          [input.skuId]
        );
        await client.query("COMMIT");
        return toSnapshot(current.rows[0]);
      }

      const current = await client.query(
        `SELECT sku_id, quantity_on_hand, quantity_reserved, low_stock_threshold, version
         FROM inventory WHERE sku_id = $1 FOR UPDATE`,
        [input.skuId]
      );
      if (current.rowCount === 0) {
        await client.query("ROLLBACK");
        throw new Error(`No inventory row for SKU ${input.skuId}`);
      }

      const row = current.rows[0];
      const nextQty = Number(row.quantity_on_hand) + input.changeQty;
      if (nextQty < 0) {
        await client.query("ROLLBACK");
        throw new InsufficientStockError(input.skuId);
      }

      const updated = await client.query(
        `UPDATE inventory
         SET quantity_on_hand = $1, version = version + 1, updated_at = now()
         WHERE sku_id = $2 AND version = $3
         RETURNING sku_id, quantity_on_hand, quantity_reserved, low_stock_threshold, version`,
        [nextQty, input.skuId, row.version]
      );

      if (updated.rowCount === 0) {
        await client.query("ROLLBACK");
        throw new ConcurrencyConflictError(input.skuId);
      }

      await client.query(
        `INSERT INTO inventory_ledger (sku_id, change_qty, reason, reference_id)
         VALUES ($1, $2, $3, $4)`,
        [input.skuId, input.changeQty, input.reason, input.referenceId ?? null]
      );

      await client.query(
        `INSERT INTO processed_event (event_id) VALUES ($1)
         ON CONFLICT (event_id) DO NOTHING`,
        [input.eventId]
      );

      await client.query("COMMIT");
      const snapshot = toSnapshot(updated.rows[0]);
      await sync(snapshot.skuId);
      return snapshot;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      if (err instanceof ConcurrencyConflictError) {
        lastError = err;
        continue; // retry
      }
      throw err;
    } finally {
      client.release();
    }
  }

  throw lastError ?? new ConcurrencyConflictError(input.skuId);
}

function toSnapshot(row: {
  sku_id: string;
  quantity_on_hand: string | number;
  quantity_reserved: string | number;
  low_stock_threshold: string | number;
  version: string | number;
}): InventorySnapshot {
  const quantityOnHand = Number(row.quantity_on_hand);
  return {
    skuId: row.sku_id,
    quantityOnHand,
    quantityReserved: Number(row.quantity_reserved),
    lowStockThreshold: Number(row.low_stock_threshold),
    version: Number(row.version),
    isOutOfStock: quantityOnHand <= 0
  };
}

export async function getInventory(
  db: QueryExecutor,
  skuId: string
): Promise<InventorySnapshot | null> {
  const result = await db.query(
    `SELECT sku_id, quantity_on_hand, quantity_reserved, low_stock_threshold, version
     FROM inventory WHERE sku_id = $1`,
    [skuId]
  );
  if (result.rowCount === 0) return null;
  return toSnapshot(result.rows[0]);
}

export async function listCriticalStock(
  db: QueryExecutor,
  sellerId: string
): Promise<Array<InventorySnapshot & { internalCode: string; canonicalTitle: string }>> {
  const result = await db.query(
    `SELECT i.sku_id, i.quantity_on_hand, i.quantity_reserved, i.low_stock_threshold, i.version,
            s.internal_code, s.canonical_title
     FROM inventory i
     JOIN sku s ON s.id = i.sku_id
     WHERE s.seller_id = $1 AND i.quantity_on_hand <= i.low_stock_threshold
     ORDER BY i.quantity_on_hand ASC`,
    [sellerId]
  );
  return result.rows.map((row) => ({
    ...toSnapshot(row),
    internalCode: row.internal_code,
    canonicalTitle: row.canonical_title
  }));
}
