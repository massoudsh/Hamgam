import { describe, it, expect } from "vitest";
import { InstagramConnector } from "../../src/connectors/instagram.js";

describe("InstagramConnector (manual entry)", () => {
  it("normalizes a manual order submission into the shared event shape", () => {
    const connector = new InstagramConnector();
    const event = connector.submitManualOrder({
      externalOrderId: "dm-thread-88",
      customerName: "مریم",
      items: [{ skuId: "sku-1", quantity: 2, unitPrice: 30000 }]
    });

    expect(event.eventId).toBe("instagram:dm-thread-88");
    expect(event.totalAmount).toBe(60000);
    expect(event.items).toEqual([{ externalSkuRef: "sku-1", quantity: 2, unitPrice: 30000 }]);
  });

  it("has no external listing catalog and never polls", async () => {
    const connector = new InstagramConnector();
    expect(await connector.fetchListings()).toEqual([]);
    expect(await connector.fetchOrders()).toEqual([]);
    expect(connector.supportsWebhook).toBe(false);
  });
});
