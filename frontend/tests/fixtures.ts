import type { ListingHealthSummary } from "@/lib/types";

export const listingHealthFixture: ListingHealthSummary = {
  totalListings: 2,
  healthy: 1,
  withWarnings: 0,
  withErrors: 1,
  items: [
    {
      channelListingId: "l1",
      channelCode: "basalam",
      channelDisplayName: "باسلام",
      externalProductId: "ext-1",
      skuId: "s1",
      internalCode: "NK-1",
      canonicalTitle: "کتونی رانینگ",
      isActive: true,
      channelStock: 3,
      channelPrice: 900000,
      quantityOnHand: 8,
      lastSyncedAt: "2026-11-24T00:00:00Z",
      issues: ["stock_mismatch"],
      severity: "error"
    },
    {
      channelListingId: "l2",
      channelCode: "woocommerce",
      channelDisplayName: "ووکامرس",
      externalProductId: "ext-2",
      skuId: "s2",
      internalCode: "BG-1",
      canonicalTitle: "کیف چرم",
      isActive: true,
      channelStock: 5,
      channelPrice: 400000,
      quantityOnHand: 5,
      lastSyncedAt: "2026-11-24T00:00:00Z",
      issues: [],
      severity: "ok"
    }
  ]
};
