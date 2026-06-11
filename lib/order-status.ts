// Domaine commandes côté client : machine d'états + constantes partagées.
// Module pur (aucun import runtime serveur), importable depuis les
// composants client comme depuis le serveur.
import type { OrderStatus } from "./db/schema";

export const DELIVERY_FEE_CENTS = 900; // livraison vélo La Rochelle
export type Fulfillment = "retrait" | "livraison";

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "En attente de paiement",
  paid: "Payée",
  preparing: "En préparation",
  delivered: "Livrée",
  cancelled: "Annulée",
};

export const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["paid", "cancelled"],
  paid: ["preparing", "cancelled"],
  preparing: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}
