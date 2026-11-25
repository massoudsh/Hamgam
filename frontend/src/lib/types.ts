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
  trackingCode: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
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


export interface ChannelConnection {
  id: string;
  code: string;
  displayName: string;
  status: "active" | "error" | string;
  lastSyncedAt: string | null;
  lastError: string | null;
}


export interface CriticalStockItem {
  skuId: string;
  quantityOnHand: number;
  lowStockThreshold: number;
  internalCode: string;
  canonicalTitle: string;
}

export interface ReturnableOrderItem {
  id: string;
  skuId: string;
  canonicalTitle: string;
  quantity: number;
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

export interface ReplenishmentSuggestion {
  skuId: string;
  internalCode: string;
  canonicalTitle: string;
  quantityOnHand: number;
  lowStockThreshold: number;
  unitsSold: number;
  onOrder: number;
  avgDailySales: number;
  daysOfCover: number | null;
  suggestedQty: number;
}

export interface PurchaseOrderItem {
  id: string;
  skuId: string;
  internalCode: string;
  canonicalTitle: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number | null;
}

export interface PurchaseOrder {
  id: string;
  supplierName: string | null;
  status: "ordered" | "partially_received" | "received" | "cancelled" | string;
  expectedAt: string | null;
  notes: string | null;
  createdAt: string;
  items: PurchaseOrderItem[];
}

export type ListingIssue =
  | "unmatched"
  | "stock_mismatch"
  | "inactive_with_stock"
  | "active_out_of_stock"
  | "stale_sync";

export interface ListingHealthRow {
  channelListingId: string;
  channelCode: string;
  channelDisplayName: string;
  externalProductId: string;
  skuId: string | null;
  internalCode: string | null;
  canonicalTitle: string;
  isActive: boolean;
  channelStock: number | null;
  channelPrice: number | null;
  quantityOnHand: number | null;
  lastSyncedAt: string | null;
  issues: ListingIssue[];
  severity: "error" | "warning" | "ok";
}

export interface ListingHealthSummary {
  totalListings: number;
  healthy: number;
  withWarnings: number;
  withErrors: number;
  items: ListingHealthRow[];
}

export type VelocityStatus = "fast" | "healthy" | "slow" | "dead" | "idle";

export interface VelocityRow {
  skuId: string;
  internalCode: string;
  canonicalTitle: string;
  quantityOnHand: number;
  unitsSold: number;
  revenue: number;
  avgDailySales: number;
  daysOfCover: number | null;
  status: VelocityStatus;
}

export interface VelocityReport {
  windowDays: number;
  items: VelocityRow[];
}

export interface CustomerInsightRow {
  name: string | null;
  phone: string | null;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string;
  isRepeat: boolean;
}

export interface CustomerInsights {
  totalCustomers: number;
  repeatCustomers: number;
  repeatRate: number;
  topCustomers: CustomerInsightRow[];
}

export type FulfillmentStatus = "processing" | "shipped" | "delivered" | "cancelled";
