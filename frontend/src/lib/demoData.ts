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
    placedAt: "2026-08-01T09:12:00Z",
    trackingCode: null,
    shippedAt: null,
    deliveredAt: null
  },
  {
    id: "demo-2",
    externalOrderId: "WC-2210",
    status: "processing",
    channelCode: "woocommerce",
    channelDisplayName: "ووکامرس",
    customerName: "رضا محمدی",
    totalAmount: 1250000,
    placedAt: "2026-08-01T07:40:00Z",
    trackingCode: null,
    shippedAt: null,
    deliveredAt: null
  },
  {
    id: "demo-3",
    externalOrderId: "IG-DM-77",
    status: "shipped",
    channelCode: "instagram",
    channelDisplayName: "اینستاگرام (دستی)",
    customerName: "مریم کریمی",
    totalAmount: 320000,
    placedAt: "2026-07-31T18:05:00Z",
    trackingCode: "IR-778812",
    shippedAt: null,
    deliveredAt: null
  },
  {
    id: "demo-4",
    externalOrderId: "BAS-1039",
    status: "delivered",
    channelCode: "basalam",
    channelDisplayName: "باسلام",
    customerName: "امیر توکلی",
    totalAmount: 610000,
    placedAt: "2026-07-30T11:20:00Z",
    trackingCode: null,
    shippedAt: null,
    deliveredAt: null
  }
];

export const demoReplenishment = [
  {
    skuId: "demo-sku-1",
    internalCode: "NK-RN-BK-40",
    canonicalTitle: "کتونی رانینگ مشکی ۴۰",
    quantityOnHand: 2,
    lowStockThreshold: 3,
    unitsSold: 34,
    onOrder: 0,
    avgDailySales: 1.13,
    daysOfCover: 1.8,
    suggestedQty: 40
  },
  {
    skuId: "demo-sku-2",
    internalCode: "BAG-LT-01",
    canonicalTitle: "کیف چرم طبیعی",
    quantityOnHand: 0,
    lowStockThreshold: 2,
    unitsSold: 9,
    onOrder: 5,
    avgDailySales: 0.3,
    daysOfCover: 0,
    suggestedQty: 12
  }
];
