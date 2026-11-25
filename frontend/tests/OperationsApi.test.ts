import { describe, it, expect, vi } from "vitest";
import { ApiClient } from "@/lib/apiClient";
import { demoReplenishment } from "@/lib/demoData";

describe("ApiClient operations endpoints", () => {
  it("falls back to demo replenishment suggestions without a base URL", async () => {
    const client = new ApiClient({ sellerId: "s1" });
    await expect(client.getReplenishmentSuggestions()).resolves.toEqual({
      data: demoReplenishment,
      demo: true
    });
  });

  it("creates purchase orders with the seller scoped in the body", async () => {
    const order = { id: "po1", supplierName: null, status: "ordered", expectedAt: null, notes: null, createdAt: "2026-11-25T00:00:00Z", items: [] };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => order });
    const client = new ApiClient({ sellerId: "seller1", baseUrl: "http://localhost:4000", fetchImpl });

    await expect(client.createPurchaseOrder({ items: [{ skuId: "sku1", quantity: 5 }] })).resolves.toEqual(order);
    expect(fetchImpl.mock.calls[0][0]).toBe("http://localhost:4000/api/purchasing/orders");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      sellerId: "seller1",
      items: [{ skuId: "sku1", quantity: 5 }]
    });
  });

  it("receives a purchase order line", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ quantityReceived: 5, status: "received" }) });
    const client = new ApiClient({ sellerId: "seller1", baseUrl: "http://localhost:4000", fetchImpl });

    await expect(client.receivePurchaseOrderItem("po1", "item1", 5)).resolves.toEqual({
      quantityReceived: 5,
      status: "received"
    });
    expect(fetchImpl.mock.calls[0][0]).toBe("http://localhost:4000/api/purchasing/orders/po1/items/item1/receive");
  });

  it("loads listing health as a summary object", async () => {
    const health = { totalListings: 2, healthy: 1, withWarnings: 0, withErrors: 1, items: [] };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => health });
    const client = new ApiClient({ sellerId: "s1", baseUrl: "http://localhost:4000", fetchImpl });

    await expect(client.getListingHealth()).resolves.toEqual({ data: health, demo: false });
    expect(fetchImpl.mock.calls[0][0]).toContain("/api/listing-health?sellerId=s1");
  });

  it("updates order status with a tracking code", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "shipped", trackingCode: "IR-1" }) });
    const client = new ApiClient({ sellerId: "seller1", baseUrl: "http://localhost:4000", fetchImpl });

    await expect(client.updateOrderStatus("order1", "shipped", "IR-1")).resolves.toEqual({
      status: "shipped",
      trackingCode: "IR-1"
    });
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      sellerId: "seller1",
      status: "shipped",
      trackingCode: "IR-1"
    });
  });

  it("returns empty analytics in demo mode", async () => {
    const client = new ApiClient({ sellerId: "s1" });
    await expect(client.getVelocityReport()).resolves.toMatchObject({ demo: true, data: { items: [] } });
    await expect(client.getCustomerInsights()).resolves.toMatchObject({
      demo: true,
      data: { totalCustomers: 0, topCustomers: [] }
    });
  });
});
