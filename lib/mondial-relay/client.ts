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
        headers: { "Content-Type": "application/xml", Accept: "application/xml" },
        body,
      });
      if (!res.ok) {
        throw new MondialRelayError(`HTTP ${res.status} de Mondial Relay.`);
      }
      const text = await res.text();
      try {
        return parseShipmentResponse(text);
      } catch (err) {
        // Diagnostic : la structure XML réelle n'a pas encore été confirmée
        // contre la sandbox. On logge la réponse brute (serveur) pour pouvoir
        // ajuster les sélecteurs de parseShipmentResponse.
        console.error("[mondial-relay] échec parsing réponse expédition :\n", text);
        throw err;
      }
    },
  };
}

export function getMondialRelayClient(): MondialRelayClient | null {
  const config = getMondialRelayConfig();
  return config ? createMondialRelayClient(config) : null;
}
