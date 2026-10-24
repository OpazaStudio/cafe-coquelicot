import type { Db } from "@/lib/db/client";
import { notifyOrderPaid } from "@/lib/email/notify-order";
import { ensureRelayShipment } from "@/lib/mondial-relay/ensure-shipment";

export async function applyPaidSideEffects(db: Db, orderId: string): Promise<void> {
  try {
    await ensureRelayShipment(db, orderId);
  } catch (err) {
    console.error("[mondial-relay] étiquette non générée", err);
  }
  try {
    await notifyOrderPaid(db, orderId);
  } catch (err) {
    console.error("[commande] e-mails non envoyés", err);
  }
}
