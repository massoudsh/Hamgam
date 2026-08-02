export interface DashboardKpis {
  ordersLast30Days: number;
  criticalStockSkuCount: number;
  overslellingPreventedCount: number;
}

export type OrderStatus = "new" | "processing" | "shipped" | "delivered" | "cancelled";
export type ChannelCode = "basalam" | "woocommerce" | "instagram";

export interface OrderHubRow {
  id: string;
  externalOrderId: string;
  status: OrderStatus | string;
  channelCode: ChannelCode | string;
  channelDisplayName: string;
  customerName: string | null;
  totalAmount: number | null;
  placedAt: string;
}

export interface OrderHubFilters {
  channel?: string;
  status?: string;
  from?: string;
  to?: string;
}
