import { describe, it, expect, vi } from "vitest";
import { BasalamConnector } from "../../src/connectors/basalam.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

describe("BasalamConnector (assumed contract — see file header disclaimer)", () => {
  it("fetches and normalizes listings using the assumed response envelope", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 5, title: "شال", price: 90000, stock: 3 }] }));
    const connector = new BasalamConnector({ accessToken: "tok", fetchImpl: fetchImpl as unknown as typeof fetch });

    const listings = await connector.fetchListings();
    expect(listings).toEqual([{ externalProductId: "5", title: "شال", price: 90000, stock: 3 }]);
  });

  it("pushes inventory updates with PATCH to the product/variant path", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    const connector = new BasalamConnector({ accessToken: "tok", fetchImpl: fetchImpl as unknown as typeof fetch });

    await connector.pushInventoryUpdate({ externalProductId: "5", externalVariantId: "9", stock: 0 });

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/products/5/variants/9"),
      expect.objectContaining({ method: "PATCH" })
    );
    const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ stock: 0, is_active: false });
  });

  it("normalizes an order.created webhook event", () => {
    const connector = new BasalamConnector({ accessToken: "tok" });
    const event = connector.handleWebhookPayload({
      event: "order.created",
      data: {
        id: 42,
        status: "new",
        customer_name: "علی",
        total_price: 200000,
        created_at: "2026-02-01T00:00:00Z",
        items: [{ product_id: 5, variant_id: 9, quantity: 1, unit_price: 200000 }]
      }
    });
    expect(event?.eventId).toBe("basalam:42");
    expect(event?.items[0].externalSkuRef).toBe("5:9");
  });

  it("ignores webhook events it doesn't recognize", () => {
    const connector = new BasalamConnector({ accessToken: "tok" });
    expect(connector.handleWebhookPayload({ event: "product.stock_changed", data: {} })).toBeNull();
  });
});
