// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  DONE_RETENTION_MS,
  isOnBoard,
  isPrepStatus,
  PREP_LABELS,
  PREP_ORDER,
} from "@/lib/prep-status";

const now = new Date("2026-06-11T12:00:00Z");
const hours = (n: number) => n * 60 * 60 * 1000;

function order(over: Partial<Parameters<typeof isOnBoard>[0]> = {}) {
  return {
    status: "paid" as const,
    prepStatus: "todo" as const,
    prepDoneAt: null,
    ...over,
  };
}

describe("isOnBoard", () => {
  it("affiche les commandes payées en attente ou en cours", () => {
    expect(isOnBoard(order(), now)).toBe(true);
    expect(
      isOnBoard(order({ status: "preparing", prepStatus: "in_progress" }), now),
    ).toBe(true);
  });

  it("masque les commandes non payées ou annulées", () => {
    expect(isOnBoard(order({ status: "pending" }), now)).toBe(false);
    expect(isOnBoard(order({ status: "cancelled" }), now)).toBe(false);
  });

  it("fenêtre 48h pour les terminées", () => {
    const done = (ageMs: number) =>
      order({
        status: "picked_up",
        prepStatus: "done",
        prepDoneAt: new Date(now.getTime() - ageMs),
      });
    expect(isOnBoard(done(hours(47)), now)).toBe(true);
    expect(isOnBoard(done(DONE_RETENTION_MS - 1), now)).toBe(true);
    expect(isOnBoard(done(DONE_RETENTION_MS), now)).toBe(false); // pile 48h
    expect(isOnBoard(done(hours(49)), now)).toBe(false);
  });

  it("une terminée sans date reste visible (cas défensif)", () => {
    expect(isOnBoard(order({ prepStatus: "done" }), now)).toBe(true);
  });
});

describe("constantes du board", () => {
  it("colonnes ordonnées et libellées en français", () => {
    expect(PREP_ORDER).toEqual(["todo", "in_progress", "ready", "done"]);
    expect(PREP_LABELS.todo).toBe("En attente");
    expect(PREP_LABELS.in_progress).toBe("En cours de traitement");
    expect(PREP_LABELS.ready).toBe("À expédier");
    expect(PREP_LABELS.done).toBe("Terminée");
  });

  it("isPrepStatus garde les valeurs inconnues", () => {
    expect(isPrepStatus("done")).toBe(true);
    expect(isPrepStatus("shipped")).toBe(false);
  });
});
