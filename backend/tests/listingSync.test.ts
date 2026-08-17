import { describe, it, expect, beforeEach } from "vitest";
import type { QueryExecutor } from "../src/db/pool.js";
import { createTestDb } from "./testDb.js";
import { createSku } from "../src/domain/sku.js";
import { adjustInventory } from "../src/domain/inventory.js";
import { syncInventoryToChannels, listSyncJobs, listConnectionErrors } from "../src/domain/listingSync.js";
import type { ChannelConnector } from "../src/connectors/types.js";

async function seedListing(db: QueryExecutor, skuId: string, channelCode = "woocommerce") {
  const seller = await db.query(`SELECT seller_id FROM sku WHERE id = $1`, [skuId]);
  const sellerId = seller.rows[0].seller_id as string;
  const channel = await db.query(`SELECT id FROM channel WHERE code = $1`, [channelCode]);
  const conn = await db.query(
    `INSERT INTO channel_connection (seller_id, channel_id, credentials) VALUES ($1,$2,'{}') RETURNING id`,
    [sellerId, channel.rows[0].id]
  );
  const listing = await db.query(
    `INSERT INTO channel_listing (channel_connection_id, sku_id, external_product_id, channel_title, is_active, match_status)
     VALUES ($1,$2,'ext-1','Listing',true,'matched') RETURNING id`,
    [conn.rows[0].id, skuId]
  );
  return { sellerId, channelConnectionId: conn.rows[0].id as string, channelListingId: listing.rows[0].id as string };
}

function fakeConnector(overrides: Partial<ChannelConnector> = {}): ChannelConnector {
  return {
    channelCode: "woocommerce",
    supportsWebhook: true,
    fetchListings: async () => [],
    fetchOrders: async () => [],
    pushInventoryUpdate: async () => {},
    ...overrides
  };
}

describe("channel sync engine", () => {
  let db: QueryExecutor;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it("pushes stock, marks the listing active, and logs a successful sync_job", async () => {
    const seller = await db.query(`INSERT INTO seller (name, email) VALUES ('S', $1) RETURNING id`, [
      `s-${Math.random()}@test.dev`
    ]);
    const sellerId = seller.rows[0].id;
    const skuId = await createSku(db, { sellerId, internalCode: "SKU-1", canonicalTitle: "کالای تست", initialStock: 5 });
    const { channelListingId } = await seedListing(db, skuId);

    const pushed: number[] = [];
    const results = await syncInventoryToChannels(db, skuId, () =>
      fakeConnector({ pushInventoryUpdate: async (input) => void pushed.push(input.stock) })
    );

    expect(results).toEqual([{ channelListingId, channelCode: "woocommerce", status: "success" }]);
    expect(pushed).toEqual([5]);

    const listing = await db.query(`SELECT is_active, channel_stock FROM channel_listing WHERE id = $1`, [
      channelListingId
    ]);
    expect(listing.rows[0].is_active).toBe(true);
    expect(Number(listing.rows[0].channel_stock)).toBe(5);

    const jobs = await listSyncJobs(db, sellerId);
    expect(jobs[0].status).toBe("success");
    expect(jobs[0].jobType).toBe("inventory_push");
  });

  it("auto-disables the listing when stock reaches zero", async () => {
    const seller = await db.query(`INSERT INTO seller (name, email) VALUES ('S', $1) RETURNING id`, [
      `s-${Math.random()}@test.dev`
    ]);
    const sellerId = seller.rows[0].id;
    const skuId = await createSku(db, { sellerId, internalCode: "SKU-2", canonicalTitle: "کالا", initialStock: 3 });
    const { channelListingId } = await seedListing(db, skuId);

    await adjustInventory(db, { skuId, changeQty: -3, reason: "order", eventId: "evt-1" });
    await syncInventoryToChannels(db, skuId, () => fakeConnector());

    const listing = await db.query(`SELECT is_active FROM channel_listing WHERE id = $1`, [channelListingId]);
    expect(listing.rows[0].is_active).toBe(false);
  });

  it("records a failed sync_job and marks the connection as errored when the push throws", async () => {
    const seller = await db.query(`INSERT INTO seller (name, email) VALUES ('S', $1) RETURNING id`, [
      `s-${Math.random()}@test.dev`
    ]);
    const sellerId = seller.rows[0].id;
    const skuId = await createSku(db, { sellerId, internalCode: "SKU-3", canonicalTitle: "کالا", initialStock: 5 });
    const { channelConnectionId } = await seedListing(db, skuId);

    const results = await syncInventoryToChannels(db, skuId, () =>
      fakeConnector({
        pushInventoryUpdate: async () => {
          throw new Error("upstream timeout");
        }
      })
    );

    expect(results[0].status).toBe("failed");
    expect(results[0].errorMessage).toBe("upstream timeout");

    const jobs = await listSyncJobs(db, sellerId, { status: "failed" });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].errorMessage).toBe("upstream timeout");

    const errors = await listConnectionErrors(db, sellerId);
    expect(errors).toHaveLength(1);
    expect(errors[0].channelConnectionId).toBe(channelConnectionId);
    expect(errors[0].lastError).toBe("upstream timeout");
  });

  it("returns an empty list for a SKU with no channel listings", async () => {
    const seller = await db.query(`INSERT INTO seller (name, email) VALUES ('S', $1) RETURNING id`, [
      `s-${Math.random()}@test.dev`
    ]);
    const skuId = await createSku(db, {
      sellerId: seller.rows[0].id,
      internalCode: "SKU-4",
      canonicalTitle: "کالا",
      initialStock: 1
    });
    const results = await syncInventoryToChannels(db, skuId, () => fakeConnector());
    expect(results).toEqual([]);
  });
});
