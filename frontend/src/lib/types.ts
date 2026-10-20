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

export interface SalesReport {
  byChannel: Array<{
    channelCode: string;
    channelDisplayName: string;
    orderCount: number;
    totalAmount: number;
  }>;
  byStatus: Array<{ status: string; orderCount: number }>;
}


  id: string;
  code: string;
  displayName: string;
  status: "active" | "error" | string;
  lastSyncedAt: string | null;
  lastError: string | null;
}


  skuId: string;
  quantityOnHand: number;
  lowStockThreshold: number;
  internalCode: string;
  canonicalTitle: string;
}

export interface ReturnRequest {
  id: string;
  orderId: string;
  status: string;
  reason: string | null;
  createdAt: string;
  items: Array<{
    orderItemId: string;
    skuId: string;
    quantity: number;
    restock: boolean;
  }>;
}

export interface SyncConnectionError {
  channelConnectionId: string;
  channelCode: string;
  channelDisplayName: string;
  lastError: string | null;
  updatedAt: string;
}

export interface OrderHubFilters {
  channel?: string;
  status?: string;
  from?: string;
  to?: string;
}
