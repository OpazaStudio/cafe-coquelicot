import { XMLParser } from "fast-xml-parser";
import {
  MondialRelayError,
  type MondialRelayConfig,
  type RelayShipmentInput,
  type RelayShipmentResult,
} from "./types";

function esc(v: string): string {
  return v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Construit la requête XML ShipmentCreationRequest (API Connect v2).
 * Auth = bloc Context dans le corps. Mode 24R = livraison en point relais ;
 * la Location est l'ID relais préfixé du pays (FR uniquement).
 * Pour le 24R, l'adresse destinataire = celle du point relais (pas de
 * domicile client requis) ; le client est identifié par nom/tél/email.
 */
export function buildShipmentXml(
  input: RelayShipmentInput,
  config: MondialRelayConfig,
): string {
  const s = config.sender;
  const c = input.customer;
  const r = input.relay;
  // Découpe nom : tout en Lastname (≤32 avec Title+Firstname) pour rester simple.
  const lastname = c.name.slice(0, 32);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ShipmentCreationRequest xmlns="http://www.example.org/Request" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Context>
    <Login>${esc(config.login)}</Login>
    <Password>${esc(config.password)}</Password>
    <CustomerId>${esc(config.customerId)}</CustomerId>
    <Culture>fr-FR</Culture>
    <VersionAPI>1.0</VersionAPI>
  </Context>
  <OutputOptions>
    <OutputFormat>A4</OutputFormat>
    <OutputType>PdfUrl</OutputType>
  </OutputOptions>
  <ShipmentsList>
    <Shipment>
      <OrderNo>${esc(input.orderNumber)}</OrderNo>
      <ParcelCount>1</ParcelCount>
      <CollectionMode Mode="CCC"/>
      <DeliveryMode Mode="24R" Location="FR-${esc(r.id)}"/>
      <Parcels>
        <Parcel>
          <Content>Composition florale</Content>
          <Weight Value="${input.weightGr}" Unit="gr"/>
        </Parcel>
      </Parcels>
      <Sender>
        <Address>
          <Lastname>${esc(s.name)}</Lastname>
          <Streetname>${esc(s.street)}</Streetname>
          <HouseNo>${esc(s.houseNo)}</HouseNo>
          <CountryCode>FR</CountryCode>
          <PostCode>${esc(s.postalCode)}</PostCode>
          <City>${esc(s.city)}</City>
          <MobileNo>${esc(s.phone)}</MobileNo>
          <Email>${esc(s.email)}</Email>
        </Address>
      </Sender>
      <Recipient>
        <Address>
          <Lastname>${esc(lastname)}</Lastname>
          <Streetname>${esc(r.street)}</Streetname>
          <CountryCode>FR</CountryCode>
          <PostCode>${esc(r.postalCode)}</PostCode>
          <City>${esc(r.city)}</City>
          <MobileNo>${esc(c.phone)}</MobileNo>
          <Email>${esc(c.email)}</Email>
        </Address>
      </Recipient>
    </Shipment>
  </ShipmentsList>
</ShipmentCreationRequest>`;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

/**
 * Parse la réponse. NB : noms d'éléments à confirmer contre la sandbox
 * (cf. Task 4, step de vérification). On gère plusieurs casses courantes.
 */
export function parseShipmentResponse(xml: string): RelayShipmentResult {
  const doc = parser.parse(xml) as Record<string, unknown>;
  // Recherche tolérante des statuts d'erreur.
  const flat = JSON.stringify(doc);
  if (/"@_Level"\s*:\s*"error"/i.test(flat)) {
    const msg = flat.match(/"@_Message"\s*:\s*"([^"]*)"/i)?.[1] ?? "Erreur Mondial Relay";
    throw new MondialRelayError(msg);
  }
  const shipmentNumber = flat.match(/"ShipmentNumber"\s*:\s*"?([0-9A-Z-]+)"?/i)?.[1];
  const labelUrl = flat.match(/"Output"\s*:\s*"(https?:\/\/[^"]+)"/i)?.[1];
  if (!shipmentNumber || !labelUrl) {
    throw new MondialRelayError("Réponse Mondial Relay inattendue (n° ou étiquette absents).");
  }
  return { shipmentNumber, labelUrl, trackingNumber: shipmentNumber };
}
