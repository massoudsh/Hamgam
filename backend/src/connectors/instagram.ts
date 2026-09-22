import type {
  ChannelConnector,
  NormalizedListing,
  NormalizedOrderEvent,
  PushInventoryUpdateInput
} from "./types.js";

/**
 * Instagram has no official DM/order API (docs/prd.md §4 — نیمه‌دستی). This
 * "connector" formalizes the seller's manual entry flow into the same
 * ChannelConnector contract so manual orders flow through the exact same
 * Order Hub / Inventory pipeline as API-connected channels.
 */
export interface ManualOrderInput {
  externalOrderId: string; // seller-provided reference, e.g. a DM thread id or free text
  customerName?: string;
  customerPhone?: string;
  placedAt?: Date;
  items: Array<{ skuId: string; quantity: number; unitPrice: number }>;
}

export class InstagramConnector implements ChannelConnector {
  readonly channelCode = "instagram" as const;
  readonly supportsWebhook = false;

  /** No external listing catalog exists — the seller picks from the seller's own SKU list in the UI. */
  async fetchListings(): Promise<NormalizedListing[]> {
    return [];
  }

  /** Orders only enter the system via `submitManualOrder`, never polled. */
  async fetchOrders(): Promise<NormalizedOrderEvent[]> {
    return [];
  }

  /** There is nothing to push to — the seller manually reflects the stock change in their DM/story. */
  async pushInventoryUpdate(_input: PushInventoryUpdateInput): Promise<void> {
    return;
  }

  /** Normalizes a manual form submission into the same NormalizedOrderEvent shape as API channels. */
  submitManualOrder(input: ManualOrderInput): NormalizedOrderEvent {
    return {
      eventId: `instagram:${input.externalOrderId}`,
      externalOrderId: input.externalOrderId,
      status: "new",
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      placedAt: input.placedAt ?? new Date(),
      totalAmount: input.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0),
      items: input.items.map((i) => ({ externalSkuRef: i.skuId, quantity: i.quantity, unitPrice: i.unitPrice }))
    };
  }
}
