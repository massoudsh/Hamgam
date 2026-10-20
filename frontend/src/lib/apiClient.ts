import type { ChannelConnection, CriticalStockItem, DashboardKpis, OrderHubFilters, OrderHubRow, ReturnableOrderItem, ReturnRequest, SalesReport, SyncConnectionError } from "./types";
import { demoKpis, demoOrders } from "./demoData";

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
