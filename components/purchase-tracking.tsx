"use client";

import { useEffect, useRef } from "react";
import { trackPurchase, type GaItem } from "@/lib/analytics/gtag";

type Props = {
  transactionId: string;
  valueCents: number;
  shippingCents: number;
  items: GaItem[];
};

/**
 * Émet l'événement GA4 `purchase` une seule fois par commande. La page de
 * confirmation est `force-dynamic` et peut être rechargée (filet de sécurité
 * sans webhook) : la garde sessionStorage évite de compter deux fois la même
 * conversion. Aucun rendu visuel.
 */
export function PurchaseTracking({
  transactionId,
  valueCents,
  shippingCents,
  items,
}: Props) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    const guardKey = `ga_purchase_${transactionId}`;
    try {
      if (window.sessionStorage.getItem(guardKey)) return;
      window.sessionStorage.setItem(guardKey, "1");
    } catch {
      // sessionStorage indisponible (navigation privée…) : on tire quand même,
      // la garde mémoire `fired` couvre le re-render dans la même page.
    }
    fired.current = true;
    trackPurchase({ transactionId, valueCents, shippingCents, items });
  }, [transactionId, valueCents, shippingCents, items]);

  return null;
}
