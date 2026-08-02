import { describe, it, expect, beforeEach } from "vitest";
import type { QueryExecutor } from "../src/db/pool.js";
import { createTestDb } from "./testDb.js";
import { createSku } from "../src/domain/sku.js";
import { listCriticalStock } from "../src/domain/inventory.js";
import { listOrderHub, createOrder } from "../src/domain/orders.js";
import { getDashboardKpis } from "../src/domain/dashboard.js";

async function seedSeller(db: QueryExecutor, name: string) {
  const res = await db.query(`INSERT INTO seller (name, email) VALUES ($1,$2) RETURNING id`, [
    name,
    `${name}-${Math.random()}@test.dev`
  ]);
  return res.rows[0].id as string;
}

describe("tenant isolation", () => {
  let db: QueryExecutor;
  let sellerA: string;
  let sellerB: string;

  beforeEach(async () => {
    db = await createTestDb();
    sellerA = await seedSeller(db, "Seller A");
    sellerB = await seedSeller(db, "Seller B");
  });

  it("critical stock list for seller A never includes seller B's SKUs", async () => {
    await createSku(db, { sellerId: sellerA, internalCode: "A-1", canonicalTitle: "A1", initialStock: 1, lowStockThreshold: 5 });
    await createSku(db, { sellerId: sellerB, internalCode: "B-1", canonicalTitle: "B1", initialStock: 1, lowStockThreshold: 5 });

    const critical = await listCriticalStock(db, sellerA);
    expect(critical).toHaveLength(1);
    expect(critical[0].internalCode).toBe("A-1");
  });

  it("Order Hub never leaks orders across sellers", async () => {
    const channel = await db.query(`SELECT id FROM channel WHERE code = 'woocommerce'`);
    const connA = await db.query(
      `INSERT INTO channel_connection (seller_id, channel_id, credentials) VALUES ($1,$2,'{}') RETURNING id`,
      [sellerA, channel.rows[0].id]
    );
    const connB = await db.query(
      `INSERT INTO channel_connection (seller_id, channel_id, credentials) VALUES ($1,$2,'{}') RETURNING id`,
      [sellerB, channel.rows[0].id]
    );
    const skuA = await createSku(db, { sellerId: sellerA, internalCode: "A-2", canonicalTitle: "A2", initialStock: 10 });
    const skuB = await createSku(db, { sellerId: sellerB, internalCode: "B-2", canonicalTitle: "B2", initialStock: 10 });

    await createOrder(db, {
      sellerId: sellerA,
      channelConnectionId: connA.rows[0].id,
      externalOrderId: "same-external-id", // same external id, different channel_connection -> must not collide
      placedAt: new Date(),
      items: [{ skuId: skuA, quantity: 1, unitPrice: 10 }]
    });
    await createOrder(db, {
      sellerId: sellerB,
      channelConnectionId: connB.rows[0].id,
      externalOrderId: "same-external-id",
      placedAt: new Date(),
      items: [{ skuId: skuB, quantity: 1, unitPrice: 10 }]
    });

    const ordersA = await listOrderHub(db, { sellerId: sellerA });
    const ordersB = await listOrderHub(db, { sellerId: sellerB });
    expect(ordersA).toHaveLength(1);
    expect(ordersB).toHaveLength(1);
    expect(ordersA[0].id).not.toBe(ordersB[0].id);
  });

  it("dashboard KPIs are computed per seller only", async () => {
    await createSku(db, { sellerId: sellerA, internalCode: "A-3", canonicalTitle: "A3", initialStock: 1, lowStockThreshold: 5 });
    const kpisA = await getDashboardKpis(db, sellerA);
    const kpisB = await getDashboardKpis(db, sellerB);
    expect(kpisA.criticalStockSkuCount).toBe(1);
    expect(kpisB.criticalStockSkuCount).toBe(0);
  });
});
