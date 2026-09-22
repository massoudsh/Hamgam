/**
 * Shared contract every channel integration implements (docs/architecture.md §7).
 * Adding a new marketplace = implementing this interface; core services never
 * depend on a specific channel's API shape.
 */

export interface NormalizedListing {
  externalProductId: string;
  externalVariantId?: string;
  title: string;
  price?: number;
  stock?: number;
}

export interface NormalizedOrderItemEvent {
  externalSkuRef: string; // channel's product/variant id — resolved to a Master SKU by the caller
  quantity: number;
  unitPrice: number;
}

export interface NormalizedOrderEvent {
  eventId: string; // idempotency key: `${channelCode}:${externalOrderId}`
  externalOrderId: string;
  status: string;
  customerName?: string;
  customerPhone?: string;
  totalAmount?: number;
  placedAt: Date;
  items: NormalizedOrderItemEvent[];
}

export interface PushInventoryUpdateInput {
  externalProductId: string;
  externalVariantId?: string;
  stock: number;
}

export interface ChannelConnector {
  readonly channelCode: "basalam" | "woocommerce" | "instagram";
  readonly supportsWebhook: boolean;

  fetchListings(): Promise<NormalizedListing[]>;
  fetchOrders(sinceIso?: string): Promise<NormalizedOrderEvent[]>;
  pushInventoryUpdate(input: PushInventoryUpdateInput): Promise<void>;
  /** Verifies + normalizes an inbound webhook payload into a NormalizedOrderEvent, or null if not an order event. */
  handleWebhookPayload?(payload: unknown): NormalizedOrderEvent | null;
}
