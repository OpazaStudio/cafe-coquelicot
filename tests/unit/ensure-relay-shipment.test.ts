// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { orders } from "@/lib/db/schema";
import { ensureRelayShipment } from "@/lib/mondial-relay/ensure-shipment";
import type { MondialRelayClient } from "@/lib/mondial-relay/types";
import { createTestDb } from "../helpers/db";

async function makeRelayOrder(db: Awaited<ReturnType<typeof createTestDb>>) {
  const [o] = await db.insert(orders).values({
    number: "CQ-TEST-REL1",
    status: "paid",
    customerName: "Camille",
    customerEmail: "c@x.fr",
    customerPhone: "+33612345678",
    fulfillment: "mondial_relay",
    relayPointId: "012345",
    relayPointName: "Tabac",
    shippingAddress: "1 rue X",
    shippingPostalCode: "17000",
    shippingCity: "La Rochelle",
    shippingCountry: "FR",
    subtotalCents: 4800,
    deliveryFeeCents: 490,
    totalCents: 5290,
  }).returning();
  return o;
}

const fakeClient = (): MondialRelayClient & { calls: number } => {
  const c = {
    calls: 0,
    async createShipment() {
      c.calls++;
      return { shipmentNumber: "555", labelUrl: "https://mr/l.pdf", trackingNumber: "555" };
    },
  };
  return c;
};

describe("ensureRelayShipment", () => {
  it("crée l'expédition et persiste n°/étiquette/suivi", async () => {
    const db = await createTestDb({ seed: false });
    const o = await makeRelayOrder(db);
    const client = fakeClient();
    const res = await ensureRelayShipment(db, o.id, client);
    expect(res?.shipmentNumber).toBe("555");
    const [after] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(after.relayShipmentNumber).toBe("555");
    expect(after.relayLabelUrl).toBe("https://mr/l.pdf");
    expect(after.trackingNumber).toBe("555");
  });

  it("est idempotent : 2e appel n'appelle pas le client", async () => {
    const db = await createTestDb({ seed: false });
    const o = await makeRelayOrder(db);
    const client = fakeClient();
    await ensureRelayShipment(db, o.id, client);
    await ensureRelayShipment(db, o.id, client);
    expect(client.calls).toBe(1);
  });

  it("retourne null sans client configuré", async () => {
    const db = await createTestDb({ seed: false });
    const o = await makeRelayOrder(db);
    expect(await ensureRelayShipment(db, o.id, null)).toBeNull();
  });

  it("propage l'erreur si le client échoue", async () => {
    const db = await createTestDb({ seed: false });
    const o = await makeRelayOrder(db);
    const client: MondialRelayClient = { async createShipment() { throw new Error("boom"); } };
    await expect(ensureRelayShipment(db, o.id, client)).rejects.toThrow("boom");
  });
});
