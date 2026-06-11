"use client";

// Lien panier du header : compteur live, hydration-safe (0 côté serveur,
// vrai compte une fois le localStorage relu).

import Link from "next/link";
import { useCart } from "@/lib/cart/cart-context";

export function CartLink() {
  const { count, ready } = useCart();
  return <Link href="/panier">Panier ({ready ? count : 0})</Link>;
}
