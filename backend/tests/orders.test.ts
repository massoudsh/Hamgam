import { describe, it, expect, beforeEach } from "vitest";
import type { QueryExecutor } from "../src/db/pool.js";
import { createTestDb } from "./testDb.js";
import { createSku } from "../src/domain/sku.js";
import { createOrder, listOrderHub } from "../src/domain/orders.js";
import { getInventory } from "../src/domain/inventory.js";

async function seedSellerWithConnection(db: QueryExecutor, channelCode: string) {
  const seller = await db.query(`INSERT INTO seller (name, email) VALUES ('S', $1) RETURNING id`, [
    `s-${Math.random()}@test.dev`
  ]);
  const sellerId = seller.rows[0].id;
  const channel = await db.query(`SELECT id FROM channel WHERE code = $1`, [channelCode]);
  const conn = await db.query(
    `INSERT INTO channel_connection (seller_id, channel_id, credentials) VALUES ($1,$2,'{}') RETURNING id`,
    [sellerId, channel.rows[0].id]
  );
  return { sellerId, channelConnectionId: conn.rows[0].id };
}

describe("orders domain", () => {
  let db: QueryExecutor;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it("creates an order and decrements inventory for each line item", async () => {
    const { sellerId, channelConnectionId } = await seedSellerWithConnection(db, "woocommerce");
    const skuId = await createSku(db, {
      sellerId,
      internalCode: "SKU-1",
      canonicalTitle: "کالای تست",
      initialStock: 20
    });

    const result = await createOrder(db, {
      sellerId,
      channelConnectionId,
      externalOrderId: "wc-101",
      placedAt: new Date(),
      items: [{ skuId, quantity: 4, unitPrice: 1000 }]
    });

    expect(result.created).toBe(true);
    const inv = await getInventory(db, skuId);
    expect(inv?.quantityOnHand).toBe(16);
  });

  it("is idempotent on (channel_connection_id, external_order_id) — duplicate webhook does not double-sell stock", async () => {
    const { sellerId, channelConnectionId } = await seedSellerWithConnection(db, "basalam");
    const skuId = await createSku(db, {
      sellerId,
      internalCode: "SKU-2",
      canonicalTitle: "کالای دو",
      initialStock: 10
    });

    const input = {
      sellerId,
      channelConnectionId,
      externalOrderId: "bas-55",
      placedAt: new Date(),
      items: [{ skuId, quantity: 3, unitPrice: 500 }]
    };

    const first = await createOrder(db, input);
    const second = await createOrder(db, input); // duplicate webhook delivery

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.orderId).toBe(first.orderId);

    const inv = await getInventory(db, skuId);
    expect(inv?.quantityOnHand).toBe(7); // decremented once, not twice
  });

  it("Order Hub lists orders with channel/status/date filters scoped to the seller", async () => {
    const a = await seedSellerWithConnection(db, "woocommerce");
    const b = await seedSellerWithConnection(db, "basalam");
    const skuA = await createSku(db, { sellerId: a.sellerId, internalCode: "A1", canonicalTitle: "A", initialStock: 5 });
    const skuB = await createSku(db, { sellerId: b.sellerId, internalCode: "B1", canonicalTitle: "B", initialStock: 5 });

    await createOrder(db, {
      sellerId: a.sellerId,
      channelConnectionId: a.channelConnectionId,
      externalOrderId: "order-a",
      status: "new",
      placedAt: new Date("2026-01-01T00:00:00Z"),
      items: [{ skuId: skuA, quantity: 1, unitPrice: 100 }]
    });
    await createOrder(db, {
      sellerId: b.sellerId,
      channelConnectionId: b.channelConnectionId,
      externalOrderId: "order-b",
      status: "shipped",
      placedAt: new Date("2026-01-02T00:00:00Z"),
      items: [{ skuId: skuB, quantity: 1, unitPrice: 200 }]
    });

    const sellerAOrders = await listOrderHub(db, { sellerId: a.sellerId });
    expect(sellerAOrders).toHaveLength(1);
    expect(sellerAOrders[0].channelCode).toBe("woocommerce");

    const filteredByStatus = await listOrderHub(db, { sellerId: b.sellerId, status: "shipped" });
    expect(filteredByStatus).toHaveLength(1);

    const filteredByWrongStatus = await listOrderHub(db, { sellerId: b.sellerId, status: "new" });
    expect(filteredByWrongStatus).toHaveLength(0);
  });

  it("surfaces out-of-stock items instead of allowing negative inventory when overselling would occur", async () => {
    const { sellerId, channelConnectionId } = await seedSellerWithConnection(db, "instagram");
    const skuId = await createSku(db, {
      sellerId,
      internalCode: "SKU-3",
      canonicalTitle: "کالای کم‌موجودی",
      initialStock: 2
    });

    const result = await createOrder(db, {
      sellerId,
      channelConnectionId,
      externalOrderId: "ig-1",
      placedAt: new Date(),
      items: [{ skuId, quantity: 5, unitPrice: 100 }]
    });

    expect(result.created).toBe(true);
    expect(result.outOfStockSkuIds).toContain(skuId);
    const inv = await getInventory(db, skuId);
    expect(inv?.quantityOnHand).toBe(2); // unchanged — never went negative
  });
});
