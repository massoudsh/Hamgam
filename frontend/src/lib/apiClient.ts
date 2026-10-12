import type { DashboardKpis, OrderHubFilters, OrderHubRow, SyncConnectionError } from "./types";
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
