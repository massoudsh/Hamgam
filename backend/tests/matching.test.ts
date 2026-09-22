import { describe, it, expect, beforeEach } from "vitest";
import type { QueryExecutor } from "../src/db/pool.js";
import { createTestDb } from "./testDb.js";
import { createSku } from "../src/domain/sku.js";
import {
  scoreSkuCandidate,
  generateSkuMatchSuggestions,
  listPendingSuggestions,
  decideSkuMatchSuggestion
} from "../src/domain/matching.js";

async function seedSellerWithListing(db: QueryExecutor, channelTitle: string) {
  const seller = await db.query(`INSERT INTO seller (name, email) VALUES ('S', $1) RETURNING id`, [
    `s-${Math.random()}@test.dev`
  ]);
  const sellerId = seller.rows[0].id;
  const channel = await db.query(`SELECT id FROM channel WHERE code = 'basalam'`);
  const conn = await db.query(
    `INSERT INTO channel_connection (seller_id, channel_id, credentials) VALUES ($1,$2,'{}') RETURNING id`,
    [sellerId, channel.rows[0].id]
  );
  const listing = await db.query(
    `INSERT INTO channel_listing (channel_connection_id, external_product_id, channel_title)
     VALUES ($1,'ext-1',$2) RETURNING id`,
    [conn.rows[0].id, channelTitle]
  );
  return { sellerId, channelListingId: listing.rows[0].id as string };
}

describe("SKU matching engine — scoring", () => {
  it("gives a high score when the internal code appears in the listing title", () => {
    const score = scoreSkuCandidate("کفش NK-RN-BK-40 اورجینال", {
      canonicalTitle: "کتونی رانینگ مشکی",
      internalCode: "NK-RN-BK-40",
      attributes: {}
    });
    expect(score).toBeGreaterThanOrEqual(0.95);
  });

  it("scores higher when shared attributes (size/color) appear despite different wording", () => {
    const sku = {
      canonicalTitle: "کتونی رانینگ مشکی ۴۰",
      internalCode: "NK-RN-BK-40",
      attributes: { color: "مشکی", size: "۴۰", brand: "نایک" }
    };
    const closeMatch = scoreSkuCandidate("کفش نایک زوم مشکی ۴۰", sku);
    const noMatch = scoreSkuCandidate("شلوار جین آبی ۳۲", sku);
    expect(closeMatch).toBeGreaterThan(noMatch);
    expect(closeMatch).toBeGreaterThan(0.3);
  });

  it("returns 0 for completely unrelated titles/attributes", () => {
    const score = scoreSkuCandidate("کیف دستی چرم قهوه‌ای", {
      canonicalTitle: "کتونی رانینگ مشکی",
      internalCode: "NK-RN-BK-40",
      attributes: { color: "مشکی", size: "۴۰" }
    });
    expect(score).toBe(0);
  });
});

describe("SKU matching engine — suggestion flow", () => {
  let db: QueryExecutor;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it("suggests at most 3 candidates, sorted by confidence, and flags the listing as suggested", async () => {
    const { sellerId, channelListingId } = await seedSellerWithListing(db, "کفش نایک زوم مشکی ۴۰");
    for (let i = 0; i < 5; i++) {
      await createSku(db, {
        sellerId,
        internalCode: `SKU-${i}`,
        canonicalTitle: `محصول نامرتبط ${i}`,
        attributes: {}
      });
    }
    const target = await createSku(db, {
      sellerId,
      internalCode: "NK-RN-BK-40",
      canonicalTitle: "کتونی رانینگ مشکی ۴۰",
      attributes: { color: "مشکی", size: "۴۰" }
    });

    const suggestions = await generateSkuMatchSuggestions(db, channelListingId);

    expect(suggestions.length).toBeLessThanOrEqual(3);
    expect(suggestions[0].candidateSkuId).toBe(target);
    expect(suggestions.every((s, i) => i === 0 || suggestions[i - 1].confidence >= s.confidence)).toBe(true);

    const listing = await db.query(`SELECT match_status FROM channel_listing WHERE id = $1`, [channelListingId]);
    expect(listing.rows[0].match_status).toBe("suggested");
  });

  it("accepting a suggestion links the listing to the SKU and rejects other pending suggestions", async () => {
    const { sellerId, channelListingId } = await seedSellerWithListing(db, "کفش نایک زوم مشکی ۴۰");
    const skuA = await createSku(db, {
      sellerId,
      internalCode: "NK-RN-BK-40",
      canonicalTitle: "کتونی رانینگ مشکی ۴۰",
      attributes: { color: "مشکی", size: "۴۰" }
    });
    await createSku(db, {
      sellerId,
      internalCode: "NK-RN-BK-41",
      canonicalTitle: "کتونی رانینگ مشکی ۴۱",
      attributes: { color: "مشکی", size: "۴۱" }
    });

    const suggestions = await generateSkuMatchSuggestions(db, channelListingId);
    const best = suggestions.find((s) => s.candidateSkuId === skuA)!;

    await decideSkuMatchSuggestion(db, best.id, "accepted");

    const listing = await db.query(`SELECT sku_id, match_status FROM channel_listing WHERE id = $1`, [
      channelListingId
    ]);
    expect(listing.rows[0].sku_id).toBe(skuA);
    expect(listing.rows[0].match_status).toBe("matched");

    const remainingPending = await listPendingSuggestions(db, channelListingId);
    expect(remainingPending).toHaveLength(0);
  });

  it("rejecting the last suggestion marks the listing as an independent SKU", async () => {
    const { sellerId, channelListingId } = await seedSellerWithListing(db, "کفش نایک زوم مشکی ۴۰");
    await createSku(db, {
      sellerId,
      internalCode: "NK-RN-BK-40",
      canonicalTitle: "کتونی رانینگ مشکی ۴۰",
      attributes: { color: "مشکی", size: "۴۰" }
    });

    const suggestions = await generateSkuMatchSuggestions(db, channelListingId);
    for (const s of suggestions) {
      await decideSkuMatchSuggestion(db, s.id, "rejected");
    }

    const listing = await db.query(`SELECT sku_id, match_status FROM channel_listing WHERE id = $1`, [
      channelListingId
    ]);
    expect(listing.rows[0].sku_id).toBeNull();
    expect(listing.rows[0].match_status).toBe("independent");
  });

  it("rejects deciding an already-decided suggestion", async () => {
    const { sellerId, channelListingId } = await seedSellerWithListing(db, "کفش نایک زوم مشکی ۴۰");
    await createSku(db, {
      sellerId,
      internalCode: "NK-RN-BK-40",
      canonicalTitle: "کتونی رانینگ مشکی ۴۰",
      attributes: { color: "مشکی", size: "۴۰" }
    });
    const [first] = await generateSkuMatchSuggestions(db, channelListingId);
    await decideSkuMatchSuggestion(db, first.id, "accepted");
    await expect(decideSkuMatchSuggestion(db, first.id, "accepted")).rejects.toThrow();
  });
});
