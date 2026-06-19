import type { MondialRelayConfig, SenderAddress } from "./types";

// Expéditeur (boutique) — statique. À ajuster avec l'adresse réelle.
const SENDER: SenderAddress = {
  name: "Coquelicot",
  street: "rue du Gabut",
  houseNo: "12",
  postalCode: "17000",
  city: "La Rochelle",
  phone: "+33000000000",
  email: "bonjour@coquelicot-lr.fr",
};

export const DEFAULT_PARCEL_WEIGHT_GR = 1000;

/** Config serveur, ou null si les identifiants API ne sont pas fournis. */
export function getMondialRelayConfig(): MondialRelayConfig | null {
  const apiUrl = process.env.MONDIAL_RELAY_API_URL;
  const login = process.env.MONDIAL_RELAY_API_LOGIN;
  const password = process.env.MONDIAL_RELAY_API_PASSWORD;
  const customerId = process.env.MONDIAL_RELAY_CUSTOMER_ID;
  if (!apiUrl || !login || !password || !customerId) return null;
  return {
    apiUrl,
    login,
    password,
    customerId,
    sender: SENDER,
    defaultWeightGr: DEFAULT_PARCEL_WEIGHT_GR,
  };
}
