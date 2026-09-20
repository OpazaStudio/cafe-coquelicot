import { describe, expect, it } from "vitest";
import { buildShipmentXml, parseShipmentResponse } from "@/lib/mondial-relay/xml";
import { MondialRelayError, type MondialRelayConfig, type RelayShipmentInput } from "@/lib/mondial-relay/types";

const config: MondialRelayConfig = {
  apiUrl: "https://connect-api-sandbox.mondialrelay.com",
  login: "BDTEST@business-api.mondialrelay.com",
  password: "pw&<secret>",
  customerId: "BDTEST",
  sender: { name: "Coquelicot", street: "rue du Gabut", houseNo: "12", postalCode: "17000", city: "La Rochelle", phone: "+33000000000", email: "shop@x.fr" },
  defaultWeightGr: 1000,
};

const input: RelayShipmentInput = {
  orderNumber: "CQ-260619-ABCD",
  customer: { name: "Camille Martin", email: "c@x.fr", phone: "+33612345678" },
  relay: { id: "012345", name: "Tabac de la Gare", street: "1 rue des Lilas", postalCode: "17000", city: "La Rochelle" },
  weightGr: 1000,
};

describe("buildShipmentXml", () => {
  it("place les identifiants dans Context et le relais en mode 24R", () => {
    const xml = buildShipmentXml(input, config);
    expect(xml).toContain("<CustomerId>BDTEST</CustomerId>");
    expect(xml).toContain("<Login>BDTEST@business-api.mondialrelay.com</Login>");
    expect(xml).toContain('Mode="24R"');
    expect(xml).toContain('Location="FR-012345"');
    expect(xml).toContain("<OrderNo>CQ-260619-ABCD</OrderNo>");
    expect(xml).toContain('<Weight Value="1000" Unit="gr"');
  });

  it("échappe les caractères XML spéciaux", () => {
    const xml = buildShipmentXml(input, config);
    expect(xml).toContain("pw&amp;&lt;secret&gt;");
    expect(xml).not.toContain("pw&<secret>");
  });
});

describe("parseShipmentResponse", () => {
  const ok = `<?xml version="1.0"?><ShipmentCreationResponse><ShipmentsList><Shipment><ShipmentNumber>12345678</ShipmentNumber><LabelList><Label><Output>https://mr/label.pdf</Output></Label></LabelList></Shipment></ShipmentsList></ShipmentCreationResponse>`;
  const err = `<?xml version="1.0"?><ShipmentCreationResponse><StatusList><Status Level="error" Message="Champ invalide"/></StatusList></ShipmentCreationResponse>`;

  it("extrait n° d'expédition + URL d'étiquette", () => {
    const r = parseShipmentResponse(ok);
    expect(r.shipmentNumber).toBe("12345678");
    expect(r.labelUrl).toBe("https://mr/label.pdf");
    expect(r.trackingNumber).toBe("12345678");
  });

  it("lève MondialRelayError sur statut d'erreur", () => {
    expect(() => parseShipmentResponse(err)).toThrow(MondialRelayError);
  });

  it("remonte le message d'une erreur critique XML (réponse réelle de l'API)", () => {
    const critical = `<ShipmentCreationResponse xmlns="http://www.example.org/Response"><StatusList><Status Code="10001" Level="Critical error" Message="Login et/ou mot de passe non valide." /></StatusList></ShipmentCreationResponse>`;
    expect(() => parseShipmentResponse(critical)).toThrow("Login et/ou mot de passe non valide.");
  });

  it("remonte le message d'une erreur renvoyée en JSON (réponse sans en-tête Accept)", () => {
    const json = `{"contextField":null,"outputOptionsField":null,"shipmentsListField":null,"statusListField":[{"codeField":"10066","levelField":"Error","messageField":"Aucun droit d'accès."}]}`;
    expect(() => parseShipmentResponse(json)).toThrow("Aucun droit d'accès.");
  });
});
