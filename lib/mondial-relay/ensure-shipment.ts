import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import { DEFAULT_PARCEL_WEIGHT_GR } from "./config";
import { getMondialRelayClient } from "./client";
import type { MondialRelayClient, RelayShipmentResult } from "./types";

/**
 * Crée l'expédition Mondial Relay pour une commande payée, idempotent.
 * Retourne null si : déjà expédiée, pas de point relais, ou client non
 * configuré (env MR absente). Throw si l'appel API échoue (le bouton admin
 * affiche l'erreur ; les appels webhook/confirmation l'avalent).
 */
export async function ensureRelayShipment(
  db: Db,
  orderId: string,
  client: MondialRelayClient | null = getMondialRelayClient(),
): Promise<RelayShipmentResult | null> {
  if (!client) return null;
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return null;
  if (order.relayShipmentNumber) return null; // idempotent
  if (!order.relayPointId || !order.shippingAddress || !order.shippingCity || !order.shippingPostalCode) {
    return null; // pas un point relais exploitable
  }

  const result = await client.createShipment({
    orderNumber: order.number,
    customer: {
      name: order.customerName,
      email: order.customerEmail,
      phone: order.customerPhone ?? "",
    },
    relay: {
      id: order.relayPointId,
      name: order.relayPointName ?? "",
      street: order.shippingAddress,
      postalCode: order.shippingPostalCode,
      city: order.shippingCity,
    },
    weightGr: DEFAULT_PARCEL_WEIGHT_GR,
  });

  // Garde idempotente concurrente : n'écrit que si toujours sans n°.
  await db
    .update(orders)
    .set({
      relayShipmentNumber: result.shipmentNumber,
      relayLabelUrl: result.labelUrl,
      trackingNumber: result.trackingNumber,
    })
    .where(and(eq(orders.id, orderId), isNull(orders.relayShipmentNumber)));

  return result;
}
