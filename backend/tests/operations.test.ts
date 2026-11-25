import { describe, it, expect, beforeEach } from "vitest";
import type { QueryExecutor } from "../src/db/pool.js";
import { createTestDb } from "./testDb.js";
import { createSku } from "../src/domain/sku.js";
import { createOrder } from "../src/domain/orders.js";
import { getInventory, adjustInventory } from "../src/domain/inventory.js";
import {
  createPurchaseOrder,
  listPurchaseOrders,
  receivePurchaseOrderItem,
  suggestReplenishment
} from "../src/domain/purchasing.js";
import { auditListingHealth } from "../src/domain/inventoryHealth.js";
import { getCustomerInsights, getInventoryVelocity } from "../src/domain/analytics.js";
import { updateOrderStatus } from "../src/domain/orders.js";

async function seedSeller(db: QueryExecutor): Promise<string> {
  const res = await db.query(`INSERT INTO seller (name, email) VALUES ('Ops', $1) RETURNING id`, [
    `ops-${Math.random()}@test.dev`
  ]);
  return res.rows[0].id;
}

async function seedConnection(db: QueryExecutor, sellerId: string, code = "instagram"): Promise<string> {
  const channel = await db.query(`SELECT id FROM channel WHERE code = $1`, [code]);
  const conn = await db.query(
    `INSERT INTO channel_connection (seller_id, channel_id, credentials) VALUES ($1,$2,'{}') RETURNING id`,
    [sellerId, channel.rows[0].id]
  );
  return conn.rows[0].id;
}

async function seedOrder(
  db: QueryExecutor,
  sellerId: string,
  connectionId: string,
  skuId: string,
  opts: { qty?: number; daysAgo?: number; price?: number; phone?: string } = {}
): Promise<string> {
  const created = await createOrder(db, {
    sellerId,
    channelConnectionId: connectionId,
    externalOrderId: `ext-${Math.random()}`,
    placedAt: new Date(Date.now() - (opts.daysAgo ?? 1) * 86_400_000),
    customerName: "سارا",
    customerPhone: opts.phone ?? `0912${Math.floor(Math.random() * 1e7)}`,
    totalAmount: (opts.price ?? 1000) * (opts.qty ?? 1),
    items: [{ skuId, quantity: opts.qty ?? 1, unitPrice: opts.price ?? 1000 }]
  });
  return created.orderId;
}

describe("replenishment and purchase orders", () => {
  let db: QueryExecutor;
  let sellerId: string;
  let connectionId: string;

  beforeEach(async () => {
    db = await createTestDb();
    sellerId = await seedSeller(db);
    connectionId = await seedConnection(db, sellerId);
  });

  it("suggests a purchase quantity from sales velocity and urgency order", async () => {
    const fast = await createSku(db, {
      sellerId,
      internalCode: "FAST",
      canonicalTitle: "سریع",
      initialStock: 10
    });
    const slow = await createSku(db, {
      sellerId,
      internalCode: "SLOW",
      canonicalTitle: "کند",
      initialStock: 100
    });
    const idle = await createSku(db, {
      sellerId,
      internalCode: "IDLE",
      canonicalTitle: "بدون فروش",
      initialStock: 50
    });

    // 60 units of FAST sold in 30 days = 2/day → low days of cover.
    await seedOrder(db, sellerId, connectionId, fast, { qty: 60 });
    await seedOrder(db, sellerId, connectionId, slow, { qty: 5 }); // 0.17/day → 600 days cover → no suggestion
    void idle;

    const suggestions = await suggestReplenishment(db, sellerId, { windowDays: 30, leadTimeDays: 7, targetCoverDays: 30 });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ skuId: fast, unitsSold: 60, quantityOnHand: 10 });
    // target = ceil(2 × 37) = 74 → 74 − 10 = 64
    expect(suggestions[0].suggestedQty).toBe(64);
    expect(suggestions[0].daysOfCover).toBe(5);
  });

  it("creates a purchase order and receiving it restocks inventory", async () => {
    const sku = await createSku(db, { sellerId, internalCode: "PO-1", canonicalTitle: "کالا", initialStock: 0 });
    const po = await createPurchaseOrder(db, {
      sellerId,
      supplierName: "تأمین‌کننده",
      items: [{ skuId: sku, quantity: 20, unitCost: 500 }]
    });
    expect(po.status).toBe("ordered");
    expect(po.items).toHaveLength(1);

    const received = await receivePurchaseOrderItem(db, sellerId, po.id, po.items[0].id, 12);
    expect(received.status).toBe("partially_received");
    expect((await getInventory(db, sku))?.quantityOnHand).toBe(12);

    const rest = await receivePurchaseOrderItem(db, sellerId, po.id, po.items[0].id, 8);
    expect(rest.status).toBe("received");
    expect((await getInventory(db, sku))?.quantityOnHand).toBe(20);

    const [stored] = await listPurchaseOrders(db, sellerId);
    expect(stored.items[0]).toMatchObject({ quantityOrdered: 20, quantityReceived: 20 });
  });

  it("rejects over-receiving and keeps stock unchanged", async () => {
    const sku = await createSku(db, { sellerId, internalCode: "PO-2", canonicalTitle: "کالا", initialStock: 0 });
    const po = await createPurchaseOrder(db, { sellerId, items: [{ skuId: sku, quantity: 5 }] });
    await expect(receivePurchaseOrderItem(db, sellerId, po.id, po.items[0].id, 6)).rejects.toThrow(
      "quantity_exceeds_ordered"
    );
    expect((await getInventory(db, sku))?.quantityOnHand).toBe(0);
  });

  it("nets open purchase orders out of the reorder suggestion", async () => {
    const sku = await createSku(db, { sellerId, internalCode: "PO-3", canonicalTitle: "کالا", initialStock: 0 });
    await seedOrder(db, sellerId, connectionId, sku, { qty: 30 });
    const before = await suggestReplenishment(db, sellerId, { windowDays: 30 });
    expect(before[0].suggestedQty).toBeGreaterThan(0);

    await createPurchaseOrder(db, { sellerId, items: [{ skuId: sku, quantity: before[0].suggestedQty }] });
    const after = await suggestReplenishment(db, sellerId, { windowDays: 30 });
    expect(after).toHaveLength(0);
  });

  it("does not create purchase orders for another seller's SKU", async () => {
    const other = await seedSeller(db);
    void other;
    const foreignSku = await createSku(db, { sellerId: other, internalCode: "X", canonicalTitle: "X" });
    await expect(createPurchaseOrder(db, { sellerId, items: [{ skuId: foreignSku, quantity: 1 }] })).rejects.toThrow(
      "sku_not_found"
    );
  });
});

describe("listing health audit", () => {
  let db: QueryExecutor;
  let sellerId: string;

  beforeEach(async () => {
    db = await createTestDb();
    sellerId = await seedSeller(db);
  });

  it("flags stock drift, inactive-with-stock and unmatched listings", async () => {
    const connectionId = await seedConnection(db, sellerId, "woocommerce");
    const sku = await createSku(db, { sellerId, internalCode: "H-1", canonicalTitle: "مطابق", initialStock: 8 });
    const unmatchedSku = await createSku(db, { sellerId, internalCode: "H-2", canonicalTitle: "بدون تطبیق", initialStock: 2 });
    void unmatchedSku;

    await db.query(
      `INSERT INTO channel_listing
        (channel_connection_id, sku_id, external_product_id, channel_title, channel_stock, is_active, match_status, last_synced_at)
       VALUES ($1,$2,'ext-1','مطابق',5,true,'matched', now())`,
      [connectionId, sku]
    );
    await db.query(
      `INSERT INTO channel_listing
        (channel_connection_id, sku_id, external_product_id, channel_title, channel_stock, is_active, match_status, last_synced_at)
       VALUES ($1,NULL,'ext-2','یتیم',3,true,'unmatched', now())`,
      [connectionId]
    );

    const health = await auditListingHealth(db, sellerId);
    expect(health.totalListings).toBe(2);
    expect(health.withErrors).toBe(2);
    expect(health.items[0].issues).toContain("stock_mismatch");
    expect(health.items[1].issues).toContain("unmatched");
  });
});

describe("velocity and customer analytics", () => {
  let db: QueryExecutor;
  let sellerId: string;
  let connectionId: string;

  beforeEach(async () => {
    db = await createTestDb();
    sellerId = await seedSeller(db);
    connectionId = await seedConnection(db, sellerId);
  });

  it("classifies fast movers and dead stock", async () => {
    const hot = await createSku(db, { sellerId, internalCode: "HOT", canonicalTitle: "پرفروش", initialStock: 10 });
    await createSku(db, { sellerId, internalCode: "DEAD", canonicalTitle: "راکد", initialStock: 40 });
    await seedOrder(db, sellerId, connectionId, hot, { qty: 30, price: 2000 });

    const report = await getInventoryVelocity(db, sellerId, 30);
    const byCode = Object.fromEntries(report.items.map((item) => [item.internalCode, item]));
    expect(byCode.HOT.status).toBe("fast"); // 10 stock, 1/day → 10 days cover
    expect(byCode.HOT.revenue).toBe(60000);
    expect(byCode.DEAD.status).toBe("dead");
  });

  it("rolls customers up by phone and computes the repeat rate", async () => {
    const sku = await createSku(db, { sellerId, internalCode: "C-1", canonicalTitle: "کالا", initialStock: 100 });
    await seedOrder(db, sellerId, connectionId, sku, { phone: "09120000001", price: 5000 });
    await seedOrder(db, sellerId, connectionId, sku, { phone: "09120000001", price: 5000 });
    await seedOrder(db, sellerId, connectionId, sku, { phone: "09120000002", price: 1000 });

    const insights = await getCustomerInsights(db, sellerId);
    expect(insights.totalCustomers).toBe(2);
    expect(insights.repeatCustomers).toBe(1);
    expect(insights.repeatRate).toBe(50);
    expect(insights.topCustomers[0]).toMatchObject({ phone: "09120000001", orderCount: 2, totalSpent: 10000 });
  });
});

describe("fulfillment workflow", () => {
  let db: QueryExecutor;
  let sellerId: string;
  let connectionId: string;
  let skuId: string;

  beforeEach(async () => {
    db = await createTestDb();
    sellerId = await seedSeller(db);
    connectionId = await seedConnection(db, sellerId);
    skuId = await createSku(db, { sellerId, internalCode: "F-1", canonicalTitle: "کالا", initialStock: 10 });
  });

  it("moves an order to shipped with a tracking code and then delivered", async () => {
    const orderId = await seedOrder(db, sellerId, connectionId, skuId, { qty: 2 });
    await updateOrderStatus(db, { sellerId, orderId, status: "processing" });
    const shipped = await updateOrderStatus(db, {
      sellerId,
      orderId,
      status: "shipped",
      trackingCode: "IR-123456"
    });
    expect(shipped.status).toBe("shipped");
    expect(shipped.trackingCode).toBe("IR-123456");
    expect(shipped.shippedAt).not.toBeNull();

    const delivered = await updateOrderStatus(db, { sellerId, orderId, status: "delivered" });
    expect(delivered.deliveredAt).not.toBeNull();
  });

  it("rejects invalid transitions such as new → delivered", async () => {
    const orderId = await seedOrder(db, sellerId, connectionId, skuId);
    await expect(updateOrderStatus(db, { sellerId, orderId, status: "delivered" })).rejects.toThrow(
      "invalid_transition_new_to_delivered"
    );
  });

  it("restocks the deducted quantity when an order is cancelled before shipping", async () => {
    const orderId = await seedOrder(db, sellerId, connectionId, skuId, { qty: 3 });
    expect((await getInventory(db, skuId))?.quantityOnHand).toBe(7);

    await updateOrderStatus(db, { sellerId, orderId, status: "cancelled" });
    expect((await getInventory(db, skuId))?.quantityOnHand).toBe(10);
  });

  it("does not invent stock when cancelling an order that never deducted inventory", async () => {
    const tiny = await createSku(db, { sellerId, internalCode: "F-2", canonicalTitle: "کم", initialStock: 1 });
    const orderId = await seedOrder(db, sellerId, connectionId, tiny, { qty: 5 });
    // Order was recorded but stock could not go negative → still 1.
    expect((await getInventory(db, tiny))?.quantityOnHand).toBe(1);

    await updateOrderStatus(db, { sellerId, orderId, status: "cancelled" });
    expect((await getInventory(db, tiny))?.quantityOnHand).toBe(1);
  });

  it("does not let a seller update another seller's order", async () => {
    const orderId = await seedOrder(db, sellerId, connectionId, skuId);
    const other = await seedSeller(db);
    await expect(updateOrderStatus(db, { sellerId: other, orderId, status: "processing" })).rejects.toThrow(
      "order_not_found"
    );
    await adjustInventory(db, { skuId, changeQty: 0, reason: "manual_adjustment", eventId: "noop" });
  });
});
