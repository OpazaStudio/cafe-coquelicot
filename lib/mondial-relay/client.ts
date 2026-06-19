import { getMondialRelayConfig } from "./config";
import { MondialRelayError, type MondialRelayClient, type MondialRelayConfig } from "./types";
import { buildShipmentXml, parseShipmentResponse } from "./xml";

export function createMondialRelayClient(
  config: MondialRelayConfig,
  fetchImpl: typeof fetch = fetch,
): MondialRelayClient {
  return {
    async createShipment(input) {
      const body = buildShipmentXml(input, config);
      const res = await fetchImpl(`${config.apiUrl}/api/shipment`, {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body,
      });
      if (!res.ok) {
        throw new MondialRelayError(`HTTP ${res.status} de Mondial Relay.`);
      }
      return parseShipmentResponse(await res.text());
    },
  };
}

export function getMondialRelayClient(): MondialRelayClient | null {
  const config = getMondialRelayConfig();
  return config ? createMondialRelayClient(config) : null;
}
