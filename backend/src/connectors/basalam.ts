import type {
  ChannelConnector,
  NormalizedListing,
  NormalizedOrderEvent,
  PushInventoryUpdateInput
} from "./types.js";
import { withRetry } from "./retry.js";
import { TokenBucketLimiter } from "./rateLimiter.js";

/**
 * ⚠️ UNVERIFIED ASSUMPTIONS (docs/prd.md §8 — ریسک API):
 * Basalam's exact public REST paths/payload shapes were not available to verify
 * against a live account during MVP build. The endpoints below follow the
 * documented shape in docs/architecture.md §5 (OAuth2, webhook + polling
 * fallback, PATCH product/variant) but MUST be validated against Basalam's
 * real developer docs / a sandbox seller account before production use.
 * All such assumptions are isolated to this file so they're easy to audit/patch.
 */
export interface BasalamConfig {
  apiBaseUrl?: string; // default assumed base, override once verified
  accessToken: string;
  fetchImpl?: typeof fetch;
  logger?: (msg: string, meta?: Record<string, unknown>) => void;
}

const ASSUMED_BASE_URL = "https://api.basalam.com/v2";

export class BasalamConnector implements ChannelConnector {
  readonly channelCode = "basalam" as const;
  readonly supportsWebhook = true;

  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly limiter = new TokenBucketLimiter(5, 2); // conservative default until real limits confirmed
  private readonly log: (msg: string, meta?: Record<string, unknown>) => void;

  constructor(private readonly config: BasalamConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.baseUrl = config.apiBaseUrl ?? ASSUMED_BASE_URL;
    this.log = config.logger ?? (() => {});
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    if (!this.limiter.tryAcquire()) {
      throw new Error("basalam_rate_limited");
    }
    return withRetry(async (attempt) => {
      this.log("basalam.request", { path, attempt });
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json",
          ...init.headers
        }
      });
      if (!res.ok) throw new Error(`basalam_http_${res.status}`);
      return res;
    });
  }

  async fetchListings(): Promise<NormalizedListing[]> {
    const res = await this.request("/products?limit=100");
    const data = (await res.json()) as { data: BasalamProductPayload[] };
    return (data.data ?? []).map((p) => ({
      externalProductId: String(p.id),
      title: p.title,
      price: p.price,
      stock: p.stock
    }));
  }

  async fetchOrders(sinceIso?: string): Promise<NormalizedOrderEvent[]> {
    const query = sinceIso ? `?since=${encodeURIComponent(sinceIso)}` : "";
    const res = await this.request(`/orders${query}`);
    const data = (await res.json()) as { data: BasalamOrderPayload[] };
    return (data.data ?? []).map(normalizeBasalamOrder);
  }

  async pushInventoryUpdate(input: PushInventoryUpdateInput): Promise<void> {
    const variantSuffix = input.externalVariantId ? `/variants/${input.externalVariantId}` : "";
    await this.request(`/products/${input.externalProductId}${variantSuffix}`, {
      method: "PATCH",
      body: JSON.stringify({ stock: input.stock, is_active: input.stock > 0 })
    });
  }

  handleWebhookPayload(payload: unknown): NormalizedOrderEvent | null {
    if (!payload || typeof payload !== "object") return null;
    const body = payload as { event?: string; data?: BasalamOrderPayload };
    if (body.event !== "order.created" && body.event !== "order.status_changed") return null;
    if (!body.data) return null;
    return normalizeBasalamOrder(body.data);
  }
}

interface BasalamProductPayload {
  id: number;
  title: string;
  price?: number;
  stock?: number;
}

interface BasalamOrderPayload {
  id: number;
  status: string;
  customer_name?: string;
  customer_phone?: string;
  total_price?: number;
  created_at?: string;
  items?: Array<{ product_id: number; variant_id?: number; quantity: number; unit_price: number }>;
}

function normalizeBasalamOrder(order: BasalamOrderPayload): NormalizedOrderEvent {
  return {
    eventId: `basalam:${order.id}`,
    externalOrderId: String(order.id),
    status: order.status,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    totalAmount: order.total_price,
    placedAt: order.created_at ? new Date(order.created_at) : new Date(),
    items: (order.items ?? []).map((item) => ({
      externalSkuRef: item.variant_id ? `${item.product_id}:${item.variant_id}` : String(item.product_id),
      quantity: item.quantity,
      unitPrice: item.unit_price
    }))
  };
}
