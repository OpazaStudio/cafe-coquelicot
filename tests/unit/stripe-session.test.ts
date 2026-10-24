// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const stripeMock = vi.hoisted(() => ({
  checkout: { sessions: { expire: vi.fn(), retrieve: vi.fn() } },
}));
const getStripeMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/stripe", () => ({ getStripe: () => getStripeMock() }));

import { expireSessionForCancel } from "@/lib/stripe-session";

const { expire, retrieve } = stripeMock.checkout.sessions;

beforeEach(() => {
  expire.mockReset();
  retrieve.mockReset();
  getStripeMock.mockReset();
  getStripeMock.mockReturnValue(stripeMock);
});

describe("expireSessionForCancel", () => {
  it("renvoie no_session quand la commande n'a pas de session", async () => {
    expect(await expireSessionForCancel(null)).toEqual({ outcome: "no_session" });
    expect(getStripeMock).not.toHaveBeenCalled();
    expect(expire).not.toHaveBeenCalled();
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("renvoie expired quand expire() réussit", async () => {
    expire.mockResolvedValue({ status: "expired" });
    expect(await expireSessionForCancel("cs_1")).toEqual({ outcome: "expired" });
    expect(expire).toHaveBeenCalledWith("cs_1");
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("renvoie already_paid quand expire() échoue et que la session est payée", async () => {
    expire.mockRejectedValue(new Error("not open"));
    retrieve.mockResolvedValue({
      status: "complete",
      payment_status: "paid",
      payment_intent: "pi_9",
    });
    expect(await expireSessionForCancel("cs_2")).toEqual({
      outcome: "already_paid",
      paymentIntent: "pi_9",
    });
    expect(retrieve).toHaveBeenCalledWith("cs_2");
  });

  it("normalise un payment_intent déplié en identifiant", async () => {
    expire.mockRejectedValue(new Error("not open"));
    retrieve.mockResolvedValue({
      status: "complete",
      payment_status: "paid",
      payment_intent: { id: "pi_obj", object: "payment_intent" },
    });
    expect(await expireSessionForCancel("cs_2b")).toEqual({
      outcome: "already_paid",
      paymentIntent: "pi_obj",
    });
  });

  it("renvoie already_paid avec un payment_intent null quand la session n'en porte pas", async () => {
    expire.mockRejectedValue(new Error("not open"));
    retrieve.mockResolvedValue({
      status: "complete",
      payment_status: "paid",
      payment_intent: null,
    });
    expect(await expireSessionForCancel("cs_2c")).toEqual({
      outcome: "already_paid",
      paymentIntent: null,
    });
  });

  it("renvoie awaiting_async pour une session complete mais unpaid", async () => {
    expire.mockRejectedValue(new Error("not open"));
    retrieve.mockResolvedValue({
      status: "complete",
      payment_status: "unpaid",
      payment_intent: "pi_async",
    });
    expect(await expireSessionForCancel("cs_5")).toEqual({
      outcome: "awaiting_async",
    });
  });

  it("renvoie expired quand expire() échoue mais que la session est déjà expirée", async () => {
    expire.mockRejectedValue(new Error("already expired"));
    retrieve.mockResolvedValue({
      status: "expired",
      payment_status: "unpaid",
      payment_intent: null,
    });
    expect(await expireSessionForCancel("cs_6")).toEqual({ outcome: "expired" });
  });

  it("porte l'échec d'expire() quand la session est encore open : une clé restreinte sans droit d'écriture ne ressemble plus à une panne réseau", async () => {
    const refus = new Error("The provided key does not have the required permissions.");
    expire.mockRejectedValue(refus);
    retrieve.mockResolvedValue({ status: "open", payment_status: "unpaid" });
    expect(await expireSessionForCancel("cs_4")).toEqual({
      outcome: "unreachable",
      cause: refus,
    });
  });

  it("porte l'échec de retrieve() quand expire() et retrieve() échouent tous les deux", async () => {
    const panne = new Error("network");
    expire.mockRejectedValue(new Error("network"));
    retrieve.mockRejectedValue(panne);
    expect(await expireSessionForCancel("cs_3")).toEqual({
      outcome: "unreachable",
      cause: panne,
    });
  });

  it("renvoie unreachable avec la cause quand le client Stripe ne peut pas être créé", async () => {
    getStripeMock.mockImplementation(() => {
      throw new Error("STRIPE_RESTRICTED_KEY ou STRIPE_SECRET_KEY manquante");
    });
    expect(await expireSessionForCancel("cs_7")).toEqual({
      outcome: "unreachable",
      cause: new Error("STRIPE_RESTRICTED_KEY ou STRIPE_SECRET_KEY manquante"),
    });
    expect(expire).not.toHaveBeenCalled();
    expect(retrieve).not.toHaveBeenCalled();
  });
});
