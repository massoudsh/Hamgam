import type {
  ChannelConnection,
  CriticalStockItem,
  CustomerInsights,
  DashboardKpis,
  FulfillmentStatus,
  ListingHealthSummary,
  OrderHubFilters,
  OrderHubRow,
  PurchaseOrder,
  ReplenishmentSuggestion,
  ReturnableOrderItem,
  ReturnRequest,
  SalesReport,
  SyncConnectionError,
  VelocityReport
} from "./types";
import { demoKpis, demoOrders, demoReplenishment } from "./demoData";

export class ApiClientError extends Error {}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export interface ApiClientOptions {
  sellerId: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

/**
 * Typed API boundary for the merchant panel. Falls back to demo/mock data
 * whenever the backend URL isn't configured or the request fails, so the
 * dashboard is always usable during frontend-only development/demos
 * (acceptance criteria: "Typed API boundary with mock/demo fallback until
 * backend integration").
 */
export class ApiClient {
  private readonly sellerId: string;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string | undefined;

  constructor(opts: ApiClientOptions) {
    this.sellerId = opts.sellerId;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.baseUrl = opts.baseUrl ?? API_BASE_URL;
  }

  get isDemoMode(): boolean {
    return !this.baseUrl;
  }

  async getDashboardKpis(): Promise<{ data: DashboardKpis; demo: boolean }> {
    if (!this.baseUrl) return { data: demoKpis, demo: true };
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/dashboard/kpis?sellerId=${this.sellerId}`);
      if (!res.ok) throw new ApiClientError(`kpis_http_${res.status}`);
      return { data: (await res.json()) as DashboardKpis, demo: false };
    } catch {
      return { data: demoKpis, demo: true };
    }
  }

  async getReturnableOrderItems(orderId: string): Promise<ReturnableOrderItem[]> {
    if (!this.baseUrl) return [];
    const res = await this.fetchImpl(`${this.baseUrl}/api/orders/${orderId}/returnable-items?sellerId=${this.sellerId}`);
    if (!res.ok) throw new ApiClientError(`returnable_items_http_${res.status}`);
    return ((await res.json()) as { items: ReturnableOrderItem[] }).items;
  }

  async createReturn(input: { orderId: string; orderItemId: string; quantity: number; reason?: string }): Promise<ReturnRequest> {
    if (!this.baseUrl) throw new ApiClientError("returns_unavailable_in_demo");
    const res = await this.fetchImpl(`${this.baseUrl}/api/returns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sellerId: this.sellerId,
        orderId: input.orderId,
        reason: input.reason || undefined,
        items: [{ orderItemId: input.orderItemId, quantity: input.quantity, restock: true }]
      })
    });
    if (!res.ok) throw new ApiClientError(`create_return_http_${res.status}`);
    return (await res.json()) as ReturnRequest;
  }


  async getSalesReport(): Promise<{ data: SalesReport; demo: boolean }> {
    const empty: SalesReport = { byChannel: [], byStatus: [] };
    if (!this.baseUrl) return { data: empty, demo: true };
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/dashboard/reports/sales?sellerId=${this.sellerId}`);
      if (!res.ok) throw new ApiClientError(`sales_report_http_${res.status}`);
      return { data: (await res.json()) as SalesReport, demo: false };
    } catch {
      return { data: empty, demo: true };
    }
  }


  async getChannelConnections(): Promise<{ data: ChannelConnection[]; demo: boolean }> {
    if (!this.baseUrl) return { data: [], demo: true };
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/connectors?sellerId=${this.sellerId}`);
      if (!res.ok) throw new ApiClientError(`connectors_http_${res.status}`);
      const body = (await res.json()) as { items: ChannelConnection[] };
      return { data: body.items, demo: false };
    } catch {
      return { data: [], demo: true };
    }
  }


  async getReturns(): Promise<{ data: ReturnRequest[]; demo: boolean }> {
    if (!this.baseUrl) return { data: [], demo: true };
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/returns?sellerId=${this.sellerId}`);
      if (!res.ok) throw new ApiClientError(`returns_http_${res.status}`);
      const body = (await res.json()) as { items: ReturnRequest[] };
      return { data: body.items, demo: false };
    } catch {
      return { data: [], demo: true };
    }
  }

  async getCriticalStock(): Promise<{ data: CriticalStockItem[]; demo: boolean }> {
    if (!this.baseUrl) return { data: [], demo: true };
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/inventory/critical?sellerId=${this.sellerId}`);
      if (!res.ok) throw new ApiClientError(`critical_stock_http_${res.status}`);
      const body = (await res.json()) as { items: CriticalStockItem[] };
      return { data: body.items, demo: false };
    } catch {
      return { data: [], demo: true };
    }
  }

  async getSyncConnectionErrors(): Promise<{ data: SyncConnectionError[]; demo: boolean }> {
    if (!this.baseUrl) return { data: [], demo: true };
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/sync/connection-errors?sellerId=${this.sellerId}`);
      if (!res.ok) throw new ApiClientError(`sync_errors_http_${res.status}`);
      const body = (await res.json()) as { errors: SyncConnectionError[] };
      return { data: body.errors, demo: false };
    } catch {
      return { data: [], demo: true };
    }
  }

  async getOrderHub(filters: OrderHubFilters = {}): Promise<{ data: OrderHubRow[]; demo: boolean }> {
    if (!this.baseUrl) return { data: filterDemoOrders(filters), demo: true };
    try {
      const params = new URLSearchParams({ sellerId: this.sellerId, ...stripUndefined(filters) });
      const res = await this.fetchImpl(`${this.baseUrl}/api/orders?${params.toString()}`);
      if (!res.ok) throw new ApiClientError(`orders_http_${res.status}`);
      const body = (await res.json()) as { items: OrderHubRow[] };
      return { data: body.items, demo: false };
    } catch {
      return { data: filterDemoOrders(filters), demo: true };
    }
  }

  async getReplenishmentSuggestions(): Promise<{ data: ReplenishmentSuggestion[]; demo: boolean }> {
    if (!this.baseUrl) return { data: demoReplenishment, demo: true };
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/purchasing/suggestions?sellerId=${this.sellerId}`);
      if (!res.ok) throw new ApiClientError(`replenishment_http_${res.status}`);
      const body = (await res.json()) as { items: ReplenishmentSuggestion[] };
      return { data: body.items, demo: false };
    } catch {
      return { data: demoReplenishment, demo: true };
    }
  }

  async getPurchaseOrders(): Promise<{ data: PurchaseOrder[]; demo: boolean }> {
    if (!this.baseUrl) return { data: [], demo: true };
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/purchasing/orders?sellerId=${this.sellerId}`);
      if (!res.ok) throw new ApiClientError(`purchase_orders_http_${res.status}`);
      const body = (await res.json()) as { items: PurchaseOrder[] };
      return { data: body.items, demo: false };
    } catch {
      return { data: [], demo: true };
    }
  }

  async createPurchaseOrder(input: {
    supplierName?: string;
    items: Array<{ skuId: string; quantity: number; unitCost?: number }>;
  }): Promise<PurchaseOrder> {
    if (!this.baseUrl) throw new ApiClientError("purchasing_unavailable_in_demo");
    const res = await this.fetchImpl(`${this.baseUrl}/api/purchasing/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sellerId: this.sellerId, ...input })
    });
    if (!res.ok) throw new ApiClientError(`create_purchase_order_http_${res.status}`);
    return (await res.json()) as PurchaseOrder;
  }

  async receivePurchaseOrderItem(purchaseOrderId: string, itemId: string, quantity: number) {
    if (!this.baseUrl) throw new ApiClientError("purchasing_unavailable_in_demo");
    const res = await this.fetchImpl(
      `${this.baseUrl}/api/purchasing/orders/${purchaseOrderId}/items/${itemId}/receive`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sellerId: this.sellerId, quantity })
      }
    );
    if (!res.ok) throw new ApiClientError(`receive_purchase_order_http_${res.status}`);
    return (await res.json()) as { quantityReceived: number; status: string };
  }

  async getListingHealth(): Promise<{ data: ListingHealthSummary; demo: boolean }> {
    const empty: ListingHealthSummary = {
      totalListings: 0,
      healthy: 0,
      withWarnings: 0,
      withErrors: 0,
      items: []
    };
    if (!this.baseUrl) return { data: empty, demo: true };
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/listing-health?sellerId=${this.sellerId}`);
      if (!res.ok) throw new ApiClientError(`listing_health_http_${res.status}`);
      return { data: (await res.json()) as ListingHealthSummary, demo: false };
    } catch {
      return { data: empty, demo: true };
    }
  }

  async getVelocityReport(): Promise<{ data: VelocityReport; demo: boolean }> {
    const empty: VelocityReport = { windowDays: 30, items: [] };
    if (!this.baseUrl) return { data: empty, demo: true };
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/analytics/velocity?sellerId=${this.sellerId}`);
      if (!res.ok) throw new ApiClientError(`velocity_http_${res.status}`);
      return { data: (await res.json()) as VelocityReport, demo: false };
    } catch {
      return { data: empty, demo: true };
    }
  }

  async getCustomerInsights(): Promise<{ data: CustomerInsights; demo: boolean }> {
    const empty: CustomerInsights = { totalCustomers: 0, repeatCustomers: 0, repeatRate: 0, topCustomers: [] };
    if (!this.baseUrl) return { data: empty, demo: true };
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/analytics/customers?sellerId=${this.sellerId}`);
      if (!res.ok) throw new ApiClientError(`customers_http_${res.status}`);
      return { data: (await res.json()) as CustomerInsights, demo: false };
    } catch {
      return { data: empty, demo: true };
    }
  }

  async updateOrderStatus(
    orderId: string,
    status: FulfillmentStatus,
    trackingCode?: string
  ): Promise<{ status: string; trackingCode: string | null }> {
    if (!this.baseUrl) throw new ApiClientError("fulfillment_unavailable_in_demo");
    const res = await this.fetchImpl(`${this.baseUrl}/api/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sellerId: this.sellerId, status, trackingCode })
    });
    if (!res.ok) throw new ApiClientError(`update_order_status_http_${res.status}`);
    return (await res.json()) as { status: string; trackingCode: string | null };
  }
}

function stripUndefined(obj: OrderHubFilters): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v) out[k] = v;
  }
  return out;
}

function filterDemoOrders(filters: OrderHubFilters): OrderHubRow[] {
  return demoOrders.filter((order) => {
    if (filters.channel && order.channelCode !== filters.channel) return false;
    if (filters.status && order.status !== filters.status) return false;
    if (filters.from && order.placedAt < filters.from) return false;
    if (filters.to && order.placedAt > filters.to) return false;
    return true;
  });
}
