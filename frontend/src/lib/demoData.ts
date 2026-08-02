import type { DashboardKpis, OrderHubRow } from "./types";

/**
 * Demo/offline fallback data — used when NEXT_PUBLIC_API_URL is unset or the
 * backend is unreachable, so the dashboard is always demonstrable
 * (docs acceptance criteria: "Typed API boundary with mock/demo fallback
 * until backend integration").
 */
export const demoKpis: DashboardKpis = {
  ordersLast30Days: 128,
  criticalStockSkuCount: 4,
  overslellingPreventedCount: 7
};

export const demoOrders: OrderHubRow[] = [
  {
    id: "demo-1",
    externalOrderId: "BAS-1042",
    status: "new",
    channelCode: "basalam",
    channelDisplayName: "باسلام",
    customerName: "سارا احمدی",
    totalAmount: 480000,
    placedAt: "2026-08-01T09:12:00Z"
  },
  {
    id: "demo-2",
    externalOrderId: "WC-2210",
    status: "processing",
    channelCode: "woocommerce",
    channelDisplayName: "ووکامرس",
    customerName: "رضا محمدی",
    totalAmount: 1250000,
    placedAt: "2026-08-01T07:40:00Z"
  },
  {
    id: "demo-3",
    externalOrderId: "IG-DM-77",
    status: "shipped",
    channelCode: "instagram",
    channelDisplayName: "اینستاگرام (دستی)",
    customerName: "مریم کریمی",
    totalAmount: 320000,
    placedAt: "2026-07-31T18:05:00Z"
  },
  {
    id: "demo-4",
    externalOrderId: "BAS-1039",
    status: "delivered",
    channelCode: "basalam",
    channelDisplayName: "باسلام",
    customerName: "امیر توکلی",
    totalAmount: 610000,
    placedAt: "2026-07-30T11:20:00Z"
  }
];
