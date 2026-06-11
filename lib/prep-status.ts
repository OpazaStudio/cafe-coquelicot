// Domaine kanban de préparation : dimension séparée du statut commande.
// Module pur (aucun import runtime serveur), importable depuis les
// composants client comme depuis le serveur.
import type { OrderStatus, PrepStatus } from "./db/schema";

export type { PrepStatus };

// Ordre des colonnes du board, partagé entre UI et tests.
export const PREP_ORDER = [
  "todo",
  "in_progress",
  "done",
] as const satisfies readonly PrepStatus[];

export const PREP_LABELS: Record<PrepStatus, string> = {
  todo: "En attente",
  in_progress: "En cours de traitement",
  done: "Terminée",
};

// Une carte « Terminée » disparaît du board après 48h (filtre à la lecture,
// aucune donnée supprimée — la commande reste dans la table et son détail).
export const DONE_RETENTION_MS = 48 * 60 * 60 * 1000;

// Statuts commande éligibles au board : payées, non annulées.
export const BOARD_ORDER_STATUSES: readonly OrderStatus[] = [
  "paid",
  "preparing",
  "shipped",
  "picked_up",
];

export function isPrepStatus(value: string): value is PrepStatus {
  return (PREP_ORDER as readonly string[]).includes(value);
}

export function isOnBoard(
  order: {
    status: OrderStatus;
    prepStatus: PrepStatus;
    prepDoneAt: Date | null;
  },
  now: Date,
): boolean {
  if (!BOARD_ORDER_STATUSES.includes(order.status)) return false;
  if (order.prepStatus !== "done") return true;
  // `done` sans horodatage : ne doit pas arriver, on garde la carte visible.
  if (!order.prepDoneAt) return true;
  return now.getTime() - order.prepDoneAt.getTime() < DONE_RETENTION_MS;
}
