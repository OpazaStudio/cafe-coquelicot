"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { verifySession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db/client";
import { orderStatus } from "@/lib/db/schema";
import { setTrackingNumber, updateOrderStatus } from "@/lib/orders";

const InputSchema = z.object({
  orderId: z.uuid(),
  to: z.enum(orderStatus.enumValues),
});

export type StatusActionState = { error: string } | undefined;

export async function changeOrderStatus(
  orderId: string,
  to: string,
): Promise<StatusActionState> {
  await verifySession();
  const parsed = InputSchema.safeParse({ orderId, to });
  if (!parsed.success) {
    return { error: "Requête invalide." };
  }
  try {
    const db = await getDb();
    await updateOrderStatus(db, parsed.data.orderId, parsed.data.to);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erreur inconnue." };
  }
  revalidatePath("/admin/commandes");
  revalidatePath(`/admin/commandes/${orderId}`);
  revalidatePath("/admin");
  return undefined;
}

const TrackingSchema = z.object({
  orderId: z.uuid(),
  trackingNumber: z.string().trim().max(40),
});

export async function saveTrackingNumber(
  orderId: string,
  trackingNumber: string,
): Promise<StatusActionState> {
  await verifySession();
  const parsed = TrackingSchema.safeParse({ orderId, trackingNumber });
  if (!parsed.success) {
    return { error: "Requête invalide." };
  }
  try {
    const db = await getDb();
    await setTrackingNumber(
      db,
      parsed.data.orderId,
      parsed.data.trackingNumber || null,
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erreur inconnue." };
  }
  revalidatePath(`/admin/commandes/${orderId}`);
  return undefined;
}
