import { describe, it, expect, vi } from "vitest";
import { WooCommerceConnector } from "../../src/connectors/woocommerce.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body
  } as Response;
}

describe("WooCommerceConnector", () => {
  it("fetches and normalizes listings", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([{ id: 1, name: "کفش", price: "150000", stock_quantity: 12 }])
    );
    const connector = new WooCommerceConnector({
      siteUrl: "https://shop.test",
      consumerKey: "ck_test",
      consumerSecret: "cs_test",
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    const listings = await connector.fetchListings();
    expect(listings).toEqual([{ externalProductId: "1", title: "کفش", price: 150000, stock: 12 }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/wp-json/wc/v3/products"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.stringContaining("Basic ") }) })
    );
  });

  it("retries on transient HTTP failure then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 503))
      .mockResolvedValueOnce(jsonResponse([]));
    const connector = new WooCommerceConnector({
      siteUrl: "https://shop.test",
      consumerKey: "ck",
      consumerSecret: "cs",
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    const listings = await connector.fetchListings();
    expect(listings).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("normalizes an inbound webhook order payload without calling the network", () => {
    const connector = new WooCommerceConnector({ siteUrl: "https://shop.test", consumerKey: "", consumerSecret: "" });
    const event = connector.handleWebhookPayload({
      id: 77,
      status: "processing",
      billing: { first_name: "سارا", last_name: "ک", phone: "0912" },
      total: "50000",
      date_created: "2026-01-01T10:00:00Z",
      line_items: [{ product_id: 9, quantity: 2, price: "25000" }]
    });

    expect(event?.eventId).toBe("woocommerce:77");
    expect(event?.items).toEqual([{ externalSkuRef: "9", quantity: 2, unitPrice: 25000 }]);
  });

  it("ignores unrelated webhook payloads", () => {
    const connector = new WooCommerceConnector({ siteUrl: "https://shop.test", consumerKey: "", consumerSecret: "" });
    expect(connector.handleWebhookPayload({ foo: "bar" })).toBeNull();
  });
});
