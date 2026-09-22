import type { ChannelConnector } from "./types.js";
import { WooCommerceConnector } from "./woocommerce.js";
import { BasalamConnector } from "./basalam.js";
import { InstagramConnector } from "./instagram.js";

/**
 * Builds the right connector instance for a `channel_connection` row's stored
 * credentials. Credentials are currently stored as raw JSONB (encryption at
 * rest is a known MVP gap — see docs/qa-report.md), so this only shapes them
 * into each connector's config, it doesn't add security.
 */
export function createConnectorForChannel(channelCode: string, credentials: unknown): ChannelConnector {
  const creds = (credentials ?? {}) as Record<string, unknown>;
  switch (channelCode) {
    case "woocommerce":
      return new WooCommerceConnector({
        siteUrl: String(creds.siteUrl ?? ""),
        consumerKey: String(creds.consumerKey ?? ""),
        consumerSecret: String(creds.consumerSecret ?? "")
      });
    case "basalam":
      return new BasalamConnector({
        accessToken: String(creds.accessToken ?? ""),
        apiBaseUrl: creds.apiBaseUrl ? String(creds.apiBaseUrl) : undefined
      });
    case "instagram":
      return new InstagramConnector();
    default:
      throw new Error(`Unknown channel code: ${channelCode}`);
  }
}
