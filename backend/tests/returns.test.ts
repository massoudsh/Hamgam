import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { QueryExecutor } from "../src/db/pool.js";
import { createTestDb } from "./testDb.js";
import { createSku } from "../src/domain/sku.js";
import { createOrder } from "../src/domain/orders.js";
import { createReturn, listReturns } from "../src/domain/returns.js";
import { getInventory } from "../src/domain/inventory.js";
import { createApp } from "../src/app.js";

async function seedShippedOrder(db: QueryExecutor) {
  const seller = await db.query(`INSERT INTO seller (name, email) VALUES ('S', $1) RETURNING id`, [
    `s-${Math.random()}@test.dev`
  ]);
  const sellerId = seller.rows[0].id as string;
  const channel = await db.query(`SELECT id FROM channel WHERE code = 'instagram'`);
  const connection = await db.query(
    `INSERT INTO channel_connection (seller_id, channel_id, credentials) VALUES ($1, $2, '{}') RETURNING id`,
    [sellerId, channel.rows[0].id]
  );
  const skuId = await createSku(db, { sellerId, internalCode: "RETURN-1", canonicalTitle: "کالای مرجوعی", initialStock: 10 });
  const order = await createOrder(db, {
    sellerId,
    channelConnectionId: connection.rows[0].id,
    externalOrderId: `order-${Math.random()}`,
    status: "shipped",
    placedAt: new Date(),
    items: [{ skuId, quantity: 3, unitPrice: 100 }]
  });
  const orderItem = await db.query(`SELECT id FROM order_item WHERE order_id = $1`, [order.orderId]);
  return { sellerId, skuId, orderId: order.orderId, orderItemId: orderItem.rows[0].id as string };
}

describe("returns", () => {
  let db: QueryExecutor;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it("records a shipped order return, restores stock, and exposes it in the return list", async () => {
    const { sellerId, skuId, orderId, orderItemId } = await seedShippedOrder(db);

    const returned = await createReturn(db, {
      sellerId,
      orderId,
      reason: "damaged",
      items: [{ orderItemId, quantity: 2 }]
    });

    expect(returned.status).toBe("received");
    expect(returned.items).toEqual([{ orderItemId, skuId, quantity: 2, restock: true }]);
    expect((await getInventory(db, skuId))?.quantityOnHand).toBe(9);

    const order = await db.query(`SELECT status FROM "order" WHERE id = $1`, [orderId]);
    expect(order.rows[0].status).toBe("returned");
    expect(await listReturns(db, sellerId)).toEqual([returned]);
  });

  it("rejects returns for orders that have not shipped", async () => {
    const { sellerId, orderId, orderItemId } = await seedShippedOrder(db);
    await db.query(`UPDATE "order" SET status = 'new' WHERE id = $1`, [orderId]);

    await expect(createReturn(db, { sellerId, orderId, items: [{ orderItemId, quantity: 1 }] })).rejects.toThrow(
      "order_not_shipped"
    );
  });

  it("records and lists returns through the API", async () => {
    const app: Express = createApp(db);
    const { sellerId, orderId, orderItemId } = await seedShippedOrder(db);

    const created = await request(app)
      .post("/api/returns")
      .send({ sellerId, orderId, items: [{ orderItemId, quantity: 1, restock: false }] });
    expect(created.status).toBe(201);

    const listed = await request(app).get("/api/returns").query({ sellerId });
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0].id).toBe(created.body.id);
  });
});
