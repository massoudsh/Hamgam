import type { QueryExecutor } from "../db/pool.js";

/** Strips Persian/Arabic diacritics + punctuation and lowercases for comparison. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u064B-\u0652]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): Set<string> {
  return new Set(normalize(text).split(" ").filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface MatchableSku {
  canonicalTitle: string;
  internalCode: string;
  attributes: Record<string, string>;
  barcode?: string | null;
}

/**
 * Rule-based confidence scorer for the SKU matching engine (PRD F4).
 * Channel titles for the same physical product often differ a lot between
 * marketplaces ("کتونی رانینگ مشکی ۴۰" vs "کفش نایک زوم ۴۰") but still share
 * distinguishing attributes (size/color/brand) or the seller's own internal
 * code, so those are weighted heavier than raw title overlap. Output is a
 * confidence in [0,1] — never auto-applied, always surfaced for seller
 * confirmation (PRD §8 risk: "همیشه human-in-the-loop").
 */
export function scoreSkuCandidate(listingTitle: string, sku: MatchableSku): number {
  const listingTokens = tokenize(listingTitle);
  const titleTokens = tokenize(sku.canonicalTitle);
  let score = jaccard(listingTokens, titleTokens) * 0.6;

  const normalizedListing = normalize(listingTitle);
  const attributeValues = Object.values(sku.attributes ?? {}).filter(Boolean);
  if (attributeValues.length > 0) {
    const matched = attributeValues.filter((value) => normalizedListing.includes(normalize(value)));
    score += (matched.length / attributeValues.length) * 0.4;
  }

  const normalizedCode = normalize(sku.internalCode);
  if (normalizedCode && normalizedListing.includes(normalizedCode)) {
    score = Math.max(score, 0.95);
  }

  return Math.min(1, Math.round(score * 1000) / 1000);
}

export interface SuggestionResult {
  id: string;
  candidateSkuId: string;
  candidateTitle: string;
  confidence: number;
  status: "pending";
}

const MAX_SUGGESTIONS = 3; // PRD F4: "حداکثر ۳ پیشنهاد تطبیق"

/**
 * Generates up to 3 SKU match suggestions for an unmatched channel listing,
 * scored against every SKU belonging to the same seller, and persists them
 * to `sku_match_suggestion` for seller review. Re-running replaces any
 * previous *pending* suggestions for the listing (idempotent-ish refresh).
 */
export async function generateSkuMatchSuggestions(
  db: QueryExecutor,
  channelListingId: string
): Promise<SuggestionResult[]> {
  const listingRes = await db.query(
    `SELECT cl.channel_title, cc.seller_id
     FROM channel_listing cl
     JOIN channel_connection cc ON cc.id = cl.channel_connection_id
     WHERE cl.id = $1`,
    [channelListingId]
  );
  if (listingRes.rowCount === 0) throw new Error(`channel_listing not found: ${channelListingId}`);
  const channelTitle = listingRes.rows[0].channel_title as string;
  const sellerId = listingRes.rows[0].seller_id as string;

  const skuRes = await db.query(
    `SELECT id, canonical_title, internal_code, attributes, barcode FROM sku WHERE seller_id = $1`,
    [sellerId]
  );

  const scored = skuRes.rows
    .map((row) => ({
      skuId: row.id as string,
      canonicalTitle: row.canonical_title as string,
      confidence: scoreSkuCandidate(channelTitle, {
        canonicalTitle: row.canonical_title,
        internalCode: row.internal_code,
        attributes: row.attributes ?? {},
        barcode: row.barcode
      })
    }))
    .filter((candidate) => candidate.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_SUGGESTIONS);

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM sku_match_suggestion WHERE channel_listing_id = $1 AND status = 'pending'`,
      [channelListingId]
    );

    const results: SuggestionResult[] = [];
    for (const candidate of scored) {
      const inserted = await client.query(
        `INSERT INTO sku_match_suggestion (channel_listing_id, candidate_sku_id, confidence, status)
         VALUES ($1,$2,$3,'pending') RETURNING id`,
        [channelListingId, candidate.skuId, candidate.confidence]
      );
      results.push({
        id: inserted.rows[0].id,
        candidateSkuId: candidate.skuId,
        candidateTitle: candidate.canonicalTitle,
        confidence: candidate.confidence,
        status: "pending"
      });
    }

    if (results.length > 0) {
      await client.query(`UPDATE channel_listing SET match_status = 'suggested' WHERE id = $1`, [channelListingId]);
    }

    await client.query("COMMIT");
    return results;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function listPendingSuggestions(
  db: QueryExecutor,
  channelListingId: string
): Promise<SuggestionResult[]> {
  const result = await db.query(
    `SELECT sms.id, sms.candidate_sku_id, sms.confidence, s.canonical_title
     FROM sku_match_suggestion sms
     JOIN sku s ON s.id = sms.candidate_sku_id
     WHERE sms.channel_listing_id = $1 AND sms.status = 'pending'
     ORDER BY sms.confidence DESC`,
    [channelListingId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    candidateSkuId: row.candidate_sku_id,
    candidateTitle: row.canonical_title,
    confidence: Number(row.confidence),
    status: "pending" as const
  }));
}

export type MatchDecision = "accepted" | "rejected";

/**
 * Applies a seller's decision on a suggestion:
 * - accepted: links the listing to the candidate SKU (`match_status = 'matched'`)
 *   and auto-rejects any other still-pending suggestions for that listing.
 * - rejected: if no pending suggestions remain for the listing, it's registered
 *   as an independent SKU (`match_status = 'independent'`) per PRD F4 acceptance
 *   criteria ("در صورت رد، Listing به‌عنوان SKU مستقل ثبت می‌شود").
 */
export async function decideSkuMatchSuggestion(
  db: QueryExecutor,
  suggestionId: string,
  decision: MatchDecision
): Promise<void> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const sugRes = await client.query(
      `SELECT id, channel_listing_id, candidate_sku_id, status FROM sku_match_suggestion WHERE id = $1 FOR UPDATE`,
      [suggestionId]
    );
    if (sugRes.rowCount === 0) throw new Error(`suggestion not found: ${suggestionId}`);
    const suggestion = sugRes.rows[0];
    if (suggestion.status !== "pending") throw new Error(`suggestion already decided: ${suggestionId}`);

    await client.query(`UPDATE sku_match_suggestion SET status = $1, decided_at = now() WHERE id = $2`, [
      decision,
      suggestionId
    ]);

    if (decision === "accepted") {
      await client.query(`UPDATE channel_listing SET sku_id = $1, match_status = 'matched' WHERE id = $2`, [
        suggestion.candidate_sku_id,
        suggestion.channel_listing_id
      ]);
      await client.query(
        `UPDATE sku_match_suggestion SET status = 'rejected', decided_at = now()
         WHERE channel_listing_id = $1 AND status = 'pending'`,
        [suggestion.channel_listing_id]
      );
    } else {
      const remaining = await client.query(
        `SELECT 1 FROM sku_match_suggestion WHERE channel_listing_id = $1 AND status = 'pending'`,
        [suggestion.channel_listing_id]
      );
      if (remaining.rowCount === 0) {
        await client.query(`UPDATE channel_listing SET match_status = 'independent' WHERE id = $1`, [
          suggestion.channel_listing_id
        ]);
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
