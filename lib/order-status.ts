// Domaine commandes côté client : machine d'états + constantes partagées.
// Module pur (aucun import runtime serveur), importable depuis les
// composants client comme depuis le serveur.
import type { Fulfillment, OrderStatus } from "./db/schema";

export type { Fulfillment };

// Forfait Mondial Relay (point relais) — à caler sur le contrat. Provisoire.
export const MONDIAL_RELAY_FEE_CENTS = 490;

// Supplément carte manuscrite : facturé dès qu'un message est joint à la commande.
export const CARD_FEE_CENTS = 200;

// France uniquement (cf. spec) — aucune expédition à l'étranger.
export const SHIPPING_COUNTRY_CODES = ["FR"] as const;
export type ShippingCountryCode = (typeof SHIPPING_COUNTRY_CODES)[number];

export const SHIPPING_COUNTRY_LABELS: Record<ShippingCountryCode, string> = {
  FR: "France",
};

export function isShippingCountry(code: string): code is ShippingCountryCode {
  return (SHIPPING_COUNTRY_CODES as readonly string[]).includes(code);
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "En attente de paiement",
  paid: "Payée",
  preparing: "En préparation",
  shipped: "Expédiée",
  picked_up: "Retirée",
  cancelled: "Annulée",
};

// Graphe complet. Depuis `preparing`, le statut terminal dépend du mode :
// utiliser statusTransitions(from, fulfillment) pour la liste réellement permise.
const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["paid", "cancelled"],
  paid: ["preparing", "cancelled"],
  preparing: ["shipped", "picked_up", "cancelled"],
  shipped: [],
  picked_up: [],
  cancelled: [],
};

const TERMINAL_BY_FULFILLMENT: Record<Fulfillment, OrderStatus> = {
  poste: "shipped",
  retrait: "picked_up",
  mondial_relay: "shipped",
};

export function statusTransitions(
  from: OrderStatus,
  fulfillment: Fulfillment,
): OrderStatus[] {
  if (from === "preparing") {
    return [TERMINAL_BY_FULFILLMENT[fulfillment], "cancelled"];
  }
  return STATUS_TRANSITIONS[from];
}

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  fulfillment: Fulfillment,
): boolean {
  return statusTransitions(from, fulfillment).includes(to);
}
