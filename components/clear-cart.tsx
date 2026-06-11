"use client";

// Vide le panier une fois le paiement confirmé (monté uniquement sur la
// page de confirmation quand la commande est payée).

import { useEffect } from "react";
import { useCart } from "@/lib/cart/cart-context";

export function ClearCart() {
  const { clear, ready } = useCart();

  useEffect(() => {
    if (ready) clear();
  }, [ready, clear]);

  return null;
}
