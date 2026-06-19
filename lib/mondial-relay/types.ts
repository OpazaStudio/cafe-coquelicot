export type RelayShipmentInput = {
  orderNumber: string; // → OrderNo (≤15, [0-9A-Z_-])
  customer: { name: string; email: string; phone: string };
  relay: {
    id: string; // ID nu du point relais (sans préfixe pays)
    name: string;
    street: string;
    postalCode: string;
    city: string;
  };
  weightGr: number;
};

export type RelayShipmentResult = {
  shipmentNumber: string;
  labelUrl: string;
  trackingNumber: string;
};

export interface MondialRelayClient {
  createShipment(input: RelayShipmentInput): Promise<RelayShipmentResult>;
}

export type SenderAddress = {
  name: string;
  street: string;
  houseNo: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
};

export type MondialRelayConfig = {
  apiUrl: string;
  login: string;
  password: string;
  customerId: string;
  sender: SenderAddress;
  defaultWeightGr: number;
};

export class MondialRelayError extends Error {}
