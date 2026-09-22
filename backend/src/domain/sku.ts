import type { QueryExecutor } from "../db/pool.js";

export interface CreateSkuInput {
  sellerId: string;
  internalCode: string;
  canonicalTitle: string;
  attributes?: Record<string, string>;
  barcode?: string;
  initialStock?: number;
  lowStockThreshold?: number;
}

export async function createSku(db: QueryExecutor, input: CreateSkuInput): Promise<string> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO sku (seller_id, internal_code, canonical_title, attributes, barcode)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id`,
      [
        input.sellerId,
        input.internalCode,
        input.canonicalTitle,
        JSON.stringify(input.attributes ?? {}),
        input.barcode ?? null
      ]
    );
    const skuId = inserted.rows[0].id as string;
    await client.query(
      `INSERT INTO inventory (sku_id, quantity_on_hand, low_stock_threshold)
       VALUES ($1,$2,$3)`,
      [skuId, input.initialStock ?? 0, input.lowStockThreshold ?? 3]
    );
    await client.query("COMMIT");
    return skuId;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
