import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { QueryExecutor } from "../src/db/pool.js";
import { createTestDb } from "./testDb.js";
import { createApp } from "../src/app.js";
import { createSku } from "../src/domain/sku.js";
import { createOrder } from "../src/domain/orders.js";

describe("HTTP API", () => {
  let db: QueryExecutor;
  let app: Express;
  let sellerId: string;

  beforeEach(async () => {
    db = await createTestDb();
    app = createApp(db);
    const seller = await db.query(`INSERT INTO seller (name, email) VALUES ('S', $1) RETURNING id`, [
      `s-${Math.random()}@test.dev`
    ]);
    sellerId = seller.rows[0].id;
  });

  it("GET /health returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("GET /api/dashboard/kpis returns per-seller KPIs", async () => {
    await createSku(db, { sellerId, internalCode: "K1", canonicalTitle: "K", initialStock: 1, lowStockThreshold: 5 });
    const res = await request(app).get("/api/dashboard/kpis").query({ sellerId });
    expect(res.status).toBe(200);
    expect(res.body.criticalStockSkuCount).toBe(1);
  });

  it("GET /api/orders/:orderId/returnable-items scopes shipped order items to the seller", async () => {
    const channel = await db.query(`SELECT id FROM channel WHERE code = 'instagram'`);
    const connection = await db.query(
      `INSERT INTO channel_connection (seller_id, channel_id, credentials) VALUES ($1, $2, '{}') RETURNING id`,
      [sellerId, channel.rows[0].id]
    );
    const skuId = await createSku(db, { sellerId, internalCode: "RETURN-1", canonicalTitle: "کالای مرجوعی", initialStock: 4 });
    const created = await createOrder(db, {
      sellerId,
      channelConnectionId: connection.rows[0].id,
      externalOrderId: "returnable-1",
      status: "shipped",
      placedAt: new Date(),
      items: [{ skuId, quantity: 1, unitPrice: 100 }]
    });

    const res = await request(app)
      .get(`/api/orders/${created.orderId}/returnable-items`)
      .query({ sellerId });
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([expect.objectContaining({ skuId, canonicalTitle: "کالای مرجوعی", quantity: 1 })]);
  });


    const res = await request(app).get("/api/dashboard/reports/sales").query({ sellerId });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ byChannel: [], byStatus: [] });
  });


    const channel = await db.query(`SELECT id FROM channel WHERE code = 'woocommerce'`);
    await db.query(
      `INSERT INTO channel_connection (seller_id, channel_id, credentials) VALUES ($1, $2, '{"consumerSecret":"hidden"}')`,
      [sellerId, channel.rows[0].id]
    );

    const res = await request(app).get("/api/connectors").query({ sellerId });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ code: "woocommerce", status: "active" });
    expect(res.body.items[0]).not.toHaveProperty("credentials");
  });


    const channel = await db.query(`SELECT id FROM channel WHERE code = 'instagram'`);
    const conn = await db.query(
      `INSERT INTO channel_connection (seller_id, channel_id, credentials) VALUES ($1,$2,'{}') RETURNING id`,
      [sellerId, channel.rows[0].id]
    );
    const skuId = await createSku(db, { sellerId, internalCode: "IG-1", canonicalTitle: "IG", initialStock: 5 });

    const res = await request(app)
      .post("/api/connectors/instagram/manual-order")
      .send({
        sellerId,
        channelConnectionId: conn.rows[0].id,
        externalOrderId: "dm-1",
        items: [{ skuId, quantity: 2, unitPrice: 1000 }]
      });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);

    const orders = await request(app).get("/api/orders").query({ sellerId });
    expect(orders.body.items).toHaveLength(1);
    expect(orders.body.items[0].channelCode).toBe("instagram");
  });

  it("rejects malformed requests with 400", async () => {
    const res = await request(app).get("/api/dashboard/kpis").query({ sellerId: "not-a-uuid" });
    expect(res.status).toBe(400);
  });
});
