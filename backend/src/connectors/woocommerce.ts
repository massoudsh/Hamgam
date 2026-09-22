import type {
  ChannelConnector,
  NormalizedListing,
  NormalizedOrderEvent,
  PushInventoryUpdateInput
} from "./types.js";
import { withRetry } from "./retry.js";
import { TokenBucketLimiter } from "./rateLimiter.js";

export interface WooCommerceConfig {
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
  /** Injectable for tests — defaults to global fetch. */
  fetchImpl?: typeof fetch;
  logger?: (msg: string, meta?: Record<string, unknown>) => void;
}

/**
 * WooCommerce REST API adapter (docs/architecture.md §5 — ووکامرس).
 * Auth: Consumer Key/Secret as Basic Auth. Webhook support depends on the
 * seller's WP plugin config, so `fetchOrders` also works as a polling fallback.
 */
export class WooCommerceConnector implements ChannelConnector {
  readonly channelCode = "woocommerce" as const;
  readonly supportsWebhook = true;

  private readonly fetchImpl: typeof fetch;
  private readonly limiter = new TokenBucketLimiter(10, 5); // 10 burst, 5 req/s sustained
  private readonly log: (msg: string, meta?: Record<string, unknown>) => void;

  constructor(private readonly config: WooCommerceConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.log = config.logger ?? (() => {});
  }

  private authHeader(): string {
    const token = Buffer.from(`${this.config.consumerKey}:${this.config.consumerSecret}`).toString("base64");
    return `Basic ${token}`;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    if (!this.limiter.tryAcquire()) {
      throw new Error("woocommerce_rate_limited");
    }
    return withRetry(async (attempt) => {
      this.log("woocommerce.request", { path, attempt });
      const res = await this.fetchImpl(`${this.config.siteUrl}/wp-json/wc/v3${path}`, {
        ...init,
        headers: { Authorization: this.authHeader(), "Content-Type": "application/json", ...init.headers }
      });
      if (!res.ok) throw new Error(`woocommerce_http_${res.status}`);
      return res;
    });
  }

  async fetchListings(): Promise<NormalizedListing[]> {
    const res = await this.request("/products?per_page=100");
    const data = (await res.json()) as Array<{
      id: number;
      name: string;
      price: string;
      stock_quantity: number | null;
    }>;
    return data.map((p) => ({
      externalProductId: String(p.id),
      title: p.name,
      price: p.price ? Number(p.price) : undefined,
      stock: p.stock_quantity ?? undefined
    }));
  }

  async fetchOrders(sinceIso?: string): Promise<NormalizedOrderEvent[]> {
    const query = sinceIso ? `&after=${encodeURIComponent(sinceIso)}` : "";
    const res = await this.request(`/orders?per_page=50${query}`);
    const data = (await res.json()) as WooOrderPayload[];
    return data.map(normalizeWooOrder);
  }

  async pushInventoryUpdate(input: PushInventoryUpdateInput): Promise<void> {
    await this.request(`/products/${input.externalProductId}`, {
      method: "PUT",
      body: JSON.stringify({
        stock_quantity: input.stock,
        stock_status: input.stock > 0 ? "instock" : "outofstock"
      })
    });
  }

  handleWebhookPayload(payload: unknown): NormalizedOrderEvent | null {
    if (!payload || typeof payload !== "object" || !("id" in payload)) return null;
    return normalizeWooOrder(payload as WooOrderPayload);
  }
}

interface WooOrderPayload {
  id: number;
  status: string;
  billing?: { first_name?: string; last_name?: string; phone?: string };
  total?: string;
  date_created?: string;
  line_items?: Array<{ product_id: number; quantity: number; price: string }>;
}

function normalizeWooOrder(order: WooOrderPayload): NormalizedOrderEvent {
  return {
    eventId: `woocommerce:${order.id}`,
    externalOrderId: String(order.id),
    status: order.status,
    customerName: [order.billing?.first_name, order.billing?.last_name].filter(Boolean).join(" ") || undefined,
    customerPhone: order.billing?.phone,
    totalAmount: order.total ? Number(order.total) : undefined,
    placedAt: order.date_created ? new Date(order.date_created) : new Date(),
    items: (order.line_items ?? []).map((item) => ({
      externalSkuRef: String(item.product_id),
      quantity: item.quantity,
      unitPrice: Number(item.price)
    }))
  };
}
