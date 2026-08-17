import { Router } from "express";
import { z } from "zod";
import type { QueryExecutor } from "../db/pool.js";
import { generateSkuMatchSuggestions, listPendingSuggestions, decideSkuMatchSuggestion } from "../domain/matching.js";

const listingParamSchema = z.object({ channelListingId: z.string().uuid() });
const decisionSchema = z.object({ decision: z.enum(["accepted", "rejected"]) });

export function matchingRouter(db: QueryExecutor): Router {
  const router = Router();

  // Runs the matching engine for one unmatched listing and stores up to 3 suggestions.
  router.post("/matching/:channelListingId/suggest", async (req, res, next) => {
    try {
      const { channelListingId } = listingParamSchema.parse(req.params);
      const suggestions = await generateSkuMatchSuggestions(db, channelListingId);
      res.status(201).json({ suggestions });
    } catch (err) {
      next(err);
    }
  });

  router.get("/matching/:channelListingId/suggestions", async (req, res, next) => {
    try {
      const { channelListingId } = listingParamSchema.parse(req.params);
      const suggestions = await listPendingSuggestions(db, channelListingId);
      res.json({ suggestions });
    } catch (err) {
      next(err);
    }
  });

  router.post("/matching/suggestions/:suggestionId/decide", async (req, res, next) => {
    try {
      const { suggestionId } = z.object({ suggestionId: z.string().uuid() }).parse(req.params);
      const { decision } = decisionSchema.parse(req.body);
      await decideSkuMatchSuggestion(db, suggestionId, decision);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
