import { describe, it, expect, vi } from "vitest";
import { ApiClient } from "@/lib/apiClient";
import { demoKpis, demoOrders } from "@/lib/demoData";

describe("ApiClient", () => {
  it("falls back to demo KPIs when no baseUrl is configured", async () => {
    const client = new ApiClient({ sellerId: "s1" });
    const result = await client.getDashboardKpis();
    expect(result.demo).toBe(true);
    expect(result.data).toEqual(demoKpis);
  });

  it("falls back to demo data when the backend request fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const client = new ApiClient({ sellerId: "s1", baseUrl: "http://localhost:4000", fetchImpl });
    const result = await client.getDashboardKpis();
    expect(result.demo).toBe(true);
    expect(result.data).toEqual(demoKpis);
  });

  it("uses live backend data when the request succeeds", async () => {
    const liveKpis = { ordersLast30Days: 1, criticalStockSkuCount: 0, overslellingPreventedCount: 0 };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => liveKpis });
    const client = new ApiClient({ sellerId: "s1", baseUrl: "http://localhost:4000", fetchImpl });
    const result = await client.getDashboardKpis();
    expect(result.demo).toBe(false);
    expect(result.data).toEqual(liveKpis);
  });

  it("loads the sales report from the live backend", async () => {
    const report = { byChannel: [], byStatus: [{ status: "new", orderCount: 2 }] };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => report });
    const client = new ApiClient({ sellerId: "s1", baseUrl: "http://localhost:4000", fetchImpl });
    await expect(client.getSalesReport()).resolves.toEqual({ data: report, demo: false });
  });


    const items = [{ id: "c1", code: "woocommerce", displayName: "ووکامرس", status: "active", lastSyncedAt: null, lastError: null }];
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items }) });
    const client = new ApiClient({ sellerId: "s1", baseUrl: "http://localhost:4000", fetchImpl });
    await expect(client.getChannelConnections()).resolves.toEqual({ data: items, demo: false });
  });


    const items = [{ id: "r1", orderId: "o1", status: "received", reason: "خرابی", createdAt: "2026-10-12T00:00:00Z", items: [] }];
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items }) });
    const client = new ApiClient({ sellerId: "s1", baseUrl: "http://localhost:4000", fetchImpl });
    await expect(client.getReturns()).resolves.toEqual({ data: items, demo: false });
  });


    const items = [{ skuId: "sku1", quantityOnHand: 1, lowStockThreshold: 3, internalCode: "SKU-1", canonicalTitle: "کالای تست" }];
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items }) });
    const client = new ApiClient({ sellerId: "s1", baseUrl: "http://localhost:4000", fetchImpl });
    await expect(client.getCriticalStock()).resolves.toEqual({ data: items, demo: false });
  });


    const errors = [{ channelConnectionId: "c1", channelCode: "woocommerce", channelDisplayName: "ووکامرس", lastError: "timeout", updatedAt: "2026-10-12T00:00:00Z" }];
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ errors }) });
    const client = new ApiClient({ sellerId: "s1", baseUrl: "http://localhost:4000", fetchImpl });
    await expect(client.getSyncConnectionErrors()).resolves.toEqual({ data: errors, demo: false });
  });

  it("returns no connection errors in demo mode", async () => {
    const client = new ApiClient({ sellerId: "s1" });
    await expect(client.getSyncConnectionErrors()).resolves.toEqual({ data: [], demo: true });
  });


    const client = new ApiClient({ sellerId: "s1" });
    const { data } = await client.getOrderHub({ channel: "basalam" });
    expect(data.every((o) => o.channelCode === "basalam")).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data.length).toBeLessThan(demoOrders.length);
  });
});
