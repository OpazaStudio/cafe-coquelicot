import { describe, expect, it, vi } from "vitest";
import { createMondialRelayClient } from "@/lib/mondial-relay/client";
import { MondialRelayError, type MondialRelayConfig } from "@/lib/mondial-relay/types";

const config: MondialRelayConfig = {
  apiUrl: "https://sandbox.example.com",
  login: "BDTEST@business-api.mondialrelay.com",
  password: "pw",
  customerId: "BDTEST",
  sender: { name: "Coquelicot", street: "rue du Gabut", houseNo: "12", postalCode: "17000", city: "La Rochelle", phone: "+33000000000", email: "shop@x.fr" },
  defaultWeightGr: 1000,
};
const input = {
  orderNumber: "CQ-260619-ABCD",
  customer: { name: "Camille", email: "c@x.fr", phone: "+33612345678" },
  relay: { id: "012345", name: "Tabac", street: "1 rue X", postalCode: "17000", city: "La Rochelle" },
  weightGr: 1000,
};
const okXml = `<ShipmentCreationResponse><ShipmentsList><Shipment><ShipmentNumber>99887766</ShipmentNumber><LabelList><Label><Output>https://mr/lbl.pdf</Output></Label></LabelList></Shipment></ShipmentsList></ShipmentCreationResponse>`;

describe("createMondialRelayClient", () => {
  it("POST l'XML et renvoie le résultat parsé", async () => {
    const fetchImpl = vi.fn(async () => new Response(okXml, { status: 200 }));
    const client = createMondialRelayClient(config, fetchImpl as unknown as typeof fetch);
    const res = await client.createShipment(input);
    expect(res.shipmentNumber).toBe("99887766");
    expect(res.labelUrl).toBe("https://mr/lbl.pdf");
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("https://sandbox.example.com/api/shipment");
    expect(call[1].method).toBe("POST");
    expect(call[1].headers).toMatchObject({ "Content-Type": "application/xml" });
  });

  it("lève MondialRelayError sur HTTP non-2xx", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    const client = createMondialRelayClient(config, fetchImpl as unknown as typeof fetch);
    await expect(client.createShipment(input)).rejects.toBeInstanceOf(MondialRelayError);
  });
});
