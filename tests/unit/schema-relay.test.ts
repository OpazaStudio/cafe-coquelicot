// @vitest-environment node
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { orders, fulfillmentEnum } from "@/lib/db/schema";
import { createTestDb } from "../helpers/db";

describe("schéma Mondial Relay", () => {
  it("l'enum fulfillment inclut mondial_relay", () => {
    expect(fulfillmentEnum.enumValues).toContain("mondial_relay");
  });

  it("insère et relit une commande mondial_relay avec ses colonnes relais", async () => {
    const db = await createTestDb({ seed: false });
    const [row] = await db
      .insert(orders)
      .values({
        number: "CQ-TEST-0001",
        customerName: "Camille",
        customerEmail: "c@exemple.fr",
        fulfillment: "mondial_relay",
        relayPointId: "FR-012345",
        relayPointName: "Tabac de la Gare",
        shippingAddress: "1 rue des Lilas",
        shippingPostalCode: "17000",
        shippingCity: "La Rochelle",
        shippingCountry: "FR",
        relayShipmentNumber: null,
        relayLabelUrl: null,
        subtotalCents: 4800,
        deliveryFeeCents: 490,
        totalCents: 5290,
      })
      .returning();
    const found = await db.select().from(orders).where(eq(orders.id, row.id));
    expect(found[0].fulfillment).toBe("mondial_relay");
    expect(found[0].relayPointId).toBe("FR-012345");
    expect(found[0].relayPointName).toBe("Tabac de la Gare");
  });
});
