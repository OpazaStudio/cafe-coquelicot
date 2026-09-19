// Domaine commandes côté client : machine d'états + constantes partagées.
// Module pur (aucun import runtime serveur), importable depuis les
// composants client comme depuis le serveur.
import type { Fulfillment, OrderStatus } from "./db/schema";

export type { Fulfillment };

export const MONDIAL_RELAY_FEE_CENTS = 490;
export const COLISSIMO_FEE_CENTS = 790;

export type ShippingFees = { mondialRelay: number; colissimo: number };

export const DEFAULT_SHIPPING_FEES: ShippingFees = {
  mondialRelay: MONDIAL_RELAY_FEE_CENTS,
  colissimo: COLISSIMO_FEE_CENTS,
};

const PRICE_INPUT = /^\d{1,4}([.,]\d{1,2})?$/;

export function parseFeeInput(raw: string): number | null {
  const value = raw.trim();
  if (!PRICE_INPUT.test(value)) return null;
  const [units, decimals = ""] = value.split(/[.,]/);
  return Number(units) * 100 + Number(decimals.padEnd(2, "0"));
}

export function formatFeeInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function shippingFeeFor(fulfillment: Fulfillment, fees: ShippingFees): number {
  switch (fulfillment) {
    case "mondial_relay":
      return fees.mondialRelay;
    case "poste":
      return fees.colissimo;
    case "retrait":
      return 0;
  }
}

export const FULFILLMENT_LABELS: Record<Fulfillment, string> = {
  retrait: "Retrait",
  poste: "Colissimo",
  mondial_relay: "Mondial Relay",
};

export const SHIPPING_LINE_LABELS: Record<Fulfillment, string> = {
  retrait: "Retrait à l'atelier",
  poste: "Livraison Colissimo — à domicile",
  mondial_relay: "Livraison Mondial Relay — point relais",
};

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
