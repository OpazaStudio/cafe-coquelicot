"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { OrderItemRow } from "@/lib/db/schema";
import { formatEuros } from "@/lib/money";
import type { BoardOrder } from "@/lib/orders";
import { PREP_LABELS, PREP_ORDER, type PrepStatus } from "@/lib/prep-status";
import { changePrepStatus, setItemPrepared } from "./actions";
import { StatusBadge } from "./status-badge";

// DnD HTML5 natif : suffisant pour 4 colonnes fixes, zéro dépendance.
// La carte glissée est mémorisée dans l'état React (dataTransfer n'est
// lisible qu'au drop et inutile ici).
type Dragged = { orderId: string; from: PrepStatus } | null;

export function KanbanBoard({ orders }: { orders: BoardOrder[] }) {
  const [error, setError] = useState<string | null>(null);
  const [dragged, setDragged] = useState<Dragged>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ error: string } | undefined>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result?.error) setError(result.error);
    });
  };

  const move = (orderId: string, from: PrepStatus, to: PrepStatus) => {
    if (from === to) return; // no-op : pas d'appel serveur
    run(() => changePrepStatus(orderId, to));
  };

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PREP_ORDER.map((col) => {
          const cards = orders.filter((b) => b.order.prepStatus === col);
          return (
            <section
              key={col}
              aria-labelledby={`kanban-col-titre-${col}`}
              data-testid={`kanban-col-${col}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragged) move(dragged.orderId, dragged.from, col);
                setDragged(null);
              }}
              className="flex min-h-48 flex-col rounded-xl border border-stone-200 bg-stone-50/60 p-3"
            >
              <h2
                id={`kanban-col-titre-${col}`}
                className="mb-3 flex items-baseline justify-between px-1 text-sm font-semibold uppercase tracking-wide text-stone-500"
              >
                {PREP_LABELS[col]}
                <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-600">
                  {cards.length}
                </span>
              </h2>
              <ul className="flex flex-1 flex-col gap-2">
                {cards.map((board) => (
                  <KanbanCard
                    key={board.order.id}
                    board={board}
                    column={col}
                    pending={pending}
                    onDragStart={() =>
                      setDragged({ orderId: board.order.id, from: col })
                    }
                    // dragend suit toujours le drop (ou un drag avorté) :
                    // nettoie l'état pour ne jamais déplacer une carte périmée.
                    onDragEnd={() => setDragged(null)}
                    onMove={(to) => move(board.order.id, col, to)}
                    onSetPrepared={(itemId, qty) =>
                      run(() => setItemPrepared(itemId, qty))
                    }
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function KanbanCard({
  board,
  column,
  pending,
  onDragStart,
  onDragEnd,
  onMove,
  onSetPrepared,
}: {
  board: BoardOrder;
  column: PrepStatus;
  pending: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (to: PrepStatus) => void;
  onSetPrepared: (itemId: string, preparedQty: number) => void;
}) {
  const { order, items } = board;
  const idx = PREP_ORDER.indexOf(column);
  const prev = PREP_ORDER[idx - 1];
  const next = PREP_ORDER[idx + 1];

  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      data-testid={`kanban-card-${order.number}`}
      className="cursor-grab rounded-lg border border-stone-200 bg-white p-3 text-sm shadow-sm active:cursor-grabbing"
    >
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/admin/commandes/${order.id}`}
          className="font-semibold text-wine hover:underline"
        >
          {order.number}
        </Link>
        <StatusBadge status={order.status} />
      </div>
      <p className="mt-1 font-medium">{order.customerName}</p>
      <p className="text-xs text-stone-500">
        {order.fulfillment === "retrait" ? "Retrait" : "Mondial Relay"}
        {order.deliveryDate && <> · souhaité le {order.deliveryDate}</>}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5 border-y border-stone-100 py-2">
        {items.map((item) => (
          <ItemLine
            key={item.id}
            item={item}
            // Cases gelées en « Terminée » (le serveur refuse aussi).
            disabled={pending || column === "done"}
            onSetPrepared={(qty) => onSetPrepared(item.id, qty)}
          />
        ))}
      </ul>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs font-medium text-stone-500">
          {formatEuros(order.totalCents)}
        </span>
        <span className="flex gap-1">
          {prev && (
            <MoveButton
              label={`Déplacer ${order.number} vers ${PREP_LABELS[prev]}`}
              disabled={pending}
              onClick={() => onMove(prev)}
            >
              ←
            </MoveButton>
          )}
          {next && (
            <MoveButton
              label={`Déplacer ${order.number} vers ${PREP_LABELS[next]}`}
              disabled={pending}
              onClick={() => onMove(next)}
            >
              →
            </MoveButton>
          )}
        </span>
      </div>
    </li>
  );
}

// Une checkbox par unité : les `preparedQty` premières sont cochées (les
// unités sont fongibles). Cocher une case vide → +1, décocher → −1 ; le
// serveur recalcule la colonne de la carte à chaque clic.
function ItemLine({
  item,
  disabled,
  onSetPrepared,
}: {
  item: OrderItemRow;
  disabled: boolean;
  onSetPrepared: (preparedQty: number) => void;
}) {
  const variant = [item.sizeLabelSnapshot, item.colorLabelSnapshot]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="font-medium text-stone-700">
        {item.qty > 1 && `${item.qty} × `}
        {item.nameSnapshot}
        {variant && (
          <span className="font-normal text-stone-500"> — {variant}</span>
        )}
      </span>
      <span className="flex shrink-0 flex-wrap justify-end gap-1">
        {Array.from({ length: item.qty }, (_, i) => {
          const checked = i < item.preparedQty;
          return (
            <input
              key={i}
              type="checkbox"
              checked={checked}
              disabled={disabled}
              aria-label={`${item.nameSnapshot} — unité ${i + 1} sur ${item.qty}`}
              onChange={() =>
                onSetPrepared(
                  checked ? item.preparedQty - 1 : item.preparedQty + 1,
                )
              }
              className="size-4 accent-wine"
            />
          );
        })}
      </span>
    </li>
  );
}

function MoveButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-stone-200 px-2 py-1 text-xs font-semibold text-stone-600 transition hover:bg-stone-100 disabled:opacity-60"
    >
      {children}
    </button>
  );
}
