import "server-only";
import { cookies } from "next/headers";
import {
  abandonPendingOrder,
  type AbandonHeldOutcome,
} from "@/lib/checkout/abandon";
import { getDb } from "@/lib/db/client";
import { isUuid } from "@/lib/uuid";

export const RESERVATION_COOKIE = "coquelicot.reservation";

export type ReservationRelease =
  | { orderId: string; outcome: "released" }
  | { orderId: string; outcome: AbandonHeldOutcome; heldKeys: string[] };

export async function readReservedOrderId(): Promise<string | null> {
  const value = (await cookies()).get(RESERVATION_COOKIE)?.value;
  return isUuid(value) ? value : null;
}

export async function rememberReservedOrder(
  orderId: string,
  maxAgeSeconds: number,
): Promise<void> {
  (await cookies()).set(RESERVATION_COOKIE, orderId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export async function abandonReservedOrder(): Promise<ReservationRelease | null> {
  let orderId: string | null = null;
  try {
    orderId = await readReservedOrderId();
    if (orderId === null) return null;
    const verdict = await abandonPendingOrder(await getDb(), orderId);
    if (verdict.outcome === "released" || verdict.outcome === "not_pending") {
      (await cookies()).delete(RESERVATION_COOKIE);
      return { orderId, outcome: "released" };
    }
    return { orderId, outcome: verdict.outcome, heldKeys: verdict.heldKeys };
  } catch (err) {
    console.error("[checkout] libération de la réservation précédente impossible", err);
    return orderId === null
      ? null
      : { orderId, outcome: "held_release_failed", heldKeys: [] };
  }
}
