import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { QueryExecutor } from "../src/db/pool.js";
import { createTestDb } from "./testDb.js";
import { createApp } from "../src/app.js";
import { createSku } from "../src/domain/sku.js";
import { createOrder } from "../src/domain/orders.js";

async function seedSeller(db: QueryExecutor): Promise<string> {
  const res = await db.query(`INSERT INTO seller (name, email) VALUES ('API', $1) RETURNING id`, [
    `api-${Math.random()}@test.dev`
  ]);
  return res.rows[0].id;
}

async function seedConnection(db: QueryExecutor, sellerId: string): Promise<string> {
  const channel = await db.query(`SELECT id FROM channel WHERE code = 'instagram'`);
  const conn = await db.query(
    `INSERT INTO channel_connection (seller_id, channel_id, credentials) VALUES ($1,$2,'{}') RETURNING id`,
    [sellerId, channel.rows[0].id]
  );
  return conn.rows[0].id;
}

describe("operations API", () => {
  let db: QueryExecutor;
  let app: Express;
  let sellerId: string;
  let connectionId: string;
  let skuId: string;

  beforeEach(async () => {
    db = await createTestDb();
    app = createApp(db);
    sellerId = await seedSeller(db);
    connectionId = await seedConnection(db, sellerId);
    skuId = await createSku(db, { sellerId, internalCode: "API-1", canonicalTitle: "کالا", initialStock: 5 });
  });

  it("serves replenishment suggestions and creates a receivable purchase order", async () => {
    await createOrder(db, {
      sellerId,
      channelConnectionId: connectionId,
      externalOrderId: "suggest-1",
      placedAt: new Date(Date.now() - 86_400_000),
      items: [{ skuId, quantity: 4, unitPrice: 1000 }]
    });
    const suggestions = await request(app).get("/api/purchasing/suggestions").query({ sellerId });
    expect(suggestions.status).toBe(200);
    expect(suggestions.body.items).toEqual([
      expect.objectContaining({ skuId, suggestedQty: expect.any(Number) })
    ]);

    const created = await request(app)
      .post("/api/purchasing/orders")
      .send({ sellerId, supplierName: "تأمین‌کننده", items: [{ skuId, quantity: 10 }] });
    expect(created.status).toBe(201);
    const itemId = created.body.items[0].id;

    const received = await request(app)
      .post(`/api/purchasing/orders/${created.body.id}/items/${itemId}/receive`)
      .send({ sellerId, quantity: 10 });
    expect(received.status).toBe(200);
    expect(received.body.status).toBe("received");

    const stock = await request(app).get(`/api/inventory/${skuId}`);
    expect(stock.body.quantityOnHand).toBe(11); // 5 − 4 sold + 10 received
  });

  it("rejects over-receiving with 409", async () => {
    const created = await request(app)
      .post("/api/purchasing/orders")
      .send({ sellerId, items: [{ skuId, quantity: 2 }] });
    const res = await request(app)
      .post(`/api/purchasing/orders/${created.body.id}/items/${created.body.items[0].id}/receive`)
      .send({ sellerId, quantity: 5 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("quantity_exceeds_ordered");
  });

  it("returns listing health, velocity and customer insights", async () => {
    const health = await request(app).get("/api/listing-health").query({ sellerId });
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({ totalListings: 0, healthy: 0, items: [] });

    const velocity = await request(app).get("/api/analytics/velocity").query({ sellerId });
    expect(velocity.status).toBe(200);
    expect(velocity.body.windowDays).toBe(30);
    expect(velocity.body.items[0]).toMatchObject({ skuId, status: "dead" });

    const customers = await request(app).get("/api/analytics/customers").query({ sellerId });
    expect(customers.status).toBe(200);
    expect(customers.body).toMatchObject({ totalCustomers: 0, repeatCustomers: 0, topCustomers: [] });
  });

  it("drives an order through the fulfillment workflow", async () => {
    const created = await createOrder(db, {
      sellerId,
      channelConnectionId: connectionId,
      externalOrderId: "api-order-1",
      placedAt: new Date(),
      customerName: "سارا",
      items: [{ skuId, quantity: 2, unitPrice: 1000 }]
    });

    const processing = await request(app)
      .patch(`/api/orders/${created.orderId}/status`)
      .send({ sellerId, status: "processing" });
    expect(processing.status).toBe(200);
    expect(processing.body.status).toBe("processing");

    const shipped = await request(app)
      .patch(`/api/orders/${created.orderId}/status`)
      .send({ sellerId, status: "shipped", trackingCode: "IR-99" });
    expect(shipped.status).toBe(200);
    expect(shipped.body.trackingCode).toBe("IR-99");

    const invalid = await request(app)
      .patch(`/api/orders/${created.orderId}/status`)
      .send({ sellerId, status: "cancelled" });
    expect(invalid.status).toBe(409);
    expect(invalid.body.error).toBe("invalid_transition_shipped_to_cancelled");
  });

  it("returns 404 when another seller touches an order", async () => {
    const created = await createOrder(db, {
      sellerId,
      channelConnectionId: connectionId,
      externalOrderId: "api-order-2",
      placedAt: new Date(),
      items: [{ skuId, quantity: 1, unitPrice: 1000 }]
    });
    const other = await seedSeller(db);

    const res = await request(app)
      .patch(`/api/orders/${created.orderId}/status`)
      .send({ sellerId: other, status: "processing" });
    expect(res.status).toBe(404);
  });

  it("validates payloads", async () => {
    const res = await request(app)
      .post("/api/purchasing/orders")
      .send({ sellerId, items: [] });
    expect(res.status).toBe(400);
  });
});
