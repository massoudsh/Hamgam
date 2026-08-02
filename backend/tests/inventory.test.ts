import { describe, it, expect, beforeEach } from "vitest";
import type { QueryExecutor } from "../src/db/pool.js";
import { createTestDb } from "./testDb.js";
import { adjustInventory, getInventory, InsufficientStockError } from "../src/domain/inventory.js";
import { createSku } from "../src/domain/sku.js";

async function seedSeller(db: QueryExecutor): Promise<string> {
  const res = await db.query(
    `INSERT INTO seller (name, email) VALUES ('Test Seller', $1) RETURNING id`,
    [`seller-${Math.random()}@test.dev`]
  );
  return res.rows[0].id;
}

describe("inventory domain", () => {
  let db: QueryExecutor;
  let sellerId: string;
  let skuId: string;

  beforeEach(async () => {
    db = await createTestDb();
    sellerId = await seedSeller(db);
    skuId = await createSku(db, {
      sellerId,
      internalCode: "NK-RN-BK-40",
      canonicalTitle: "کتونی رانینگ مشکی ۴۰",
      initialStock: 10,
      lowStockThreshold: 3
    });
  });

  it("decrements stock on a sale", async () => {
    const snapshot = await adjustInventory(db, {
      skuId,
      changeQty: -3,
      reason: "order",
      eventId: "evt-1"
    });
    expect(snapshot.quantityOnHand).toBe(7);
    expect(snapshot.version).toBe(1);
  });

  it("is idempotent — replaying the same eventId does not double-decrement", async () => {
    await adjustInventory(db, { skuId, changeQty: -3, reason: "order", eventId: "evt-dup" });
    const second = await adjustInventory(db, { skuId, changeQty: -3, reason: "order", eventId: "evt-dup" });
    expect(second.quantityOnHand).toBe(7); // not 4
  });

  it("never allows stock to go negative", async () => {
    await expect(
      adjustInventory(db, { skuId, changeQty: -999, reason: "order", eventId: "evt-huge" })
    ).rejects.toBeInstanceOf(InsufficientStockError);
    const current = await getInventory(db, skuId);
    expect(current?.quantityOnHand).toBe(10);
  });

  it("handles concurrent decrements from two channels without over-selling", async () => {
    // Simulate two channels selling the last units of stock at the same time.
    const results = await Promise.allSettled([
      adjustInventory(db, { skuId, changeQty: -6, reason: "order", eventId: "evt-a" }),
      adjustInventory(db, { skuId, changeQty: -6, reason: "order", eventId: "evt-b" })
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Only one of the two -6 adjustments can succeed against a starting stock of 10.
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const finalStock = await getInventory(db, skuId);
    expect(finalStock?.quantityOnHand).toBe(4);
    expect(finalStock!.quantityOnHand).toBeGreaterThanOrEqual(0);
  });

  it("increases stock on a restock/return", async () => {
    const snapshot = await adjustInventory(db, {
      skuId,
      changeQty: 5,
      reason: "return",
      eventId: "evt-return-1"
    });
    expect(snapshot.quantityOnHand).toBe(15);
  });
});
