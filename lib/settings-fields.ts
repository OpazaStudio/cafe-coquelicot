import * as z from "zod";
import type { OrderEmailContext } from "./email/order";
import {
  DEFAULT_EMAIL_TEMPLATES,
  NAME_PLACEHOLDER,
  NUMBER_PLACEHOLDER,
  type EmailTemplates,
} from "./email/templates";
import {
  DEFAULT_SHIPPING_FEES,
  formatFeeInput,
  parseFeeInput,
  type ShippingFees,
} from "./order-status";

export type SettingGroup =
  | "identity"
  | "address"
  | "contact"
  | "host"
  | "mediator"
  | "shipping"
  | "email_ack"
  | "email_shop"
  | "email_order_ack"
  | "email_order_shop";

export type SettingField = {
  key: SettingKey;
  label: string;
  group: SettingGroup;
  hint?: string;
  multiline?: boolean;
  rows?: number;
  max?: number;
  kind?: "text" | "email" | "tel" | "url" | "price";
};

export const SETTING_GROUPS: Record<SettingGroup, string> = {
  identity: "Identité de l'entreprise",
  address: "Adresse du siège / de l'atelier",
  contact: "Contact",
  host: "Hébergeur du site",
  mediator: "Médiateur de la consommation",
  shipping: "Livraison",
  email_ack: "E-mail envoyé au visiteur (accusé de réception)",
  email_shop: "E-mail de notification reçu par la boutique",
  email_order_ack: "E-mail de confirmation de commande envoyé au client",
  email_order_shop: "E-mail de commande reçu par la boutique",
};

export const LEGAL_SETTING_GROUPS: SettingGroup[] = [
  "identity",
  "address",
  "contact",
  "host",
  "mediator",
  "shipping",
];

export const EMAIL_SETTING_GROUPS: SettingGroup[] = [
  "email_order_ack",
  "email_order_shop",
  "email_ack",
  "email_shop",
];

export const SETTING_KEYS = [
  "legal_name",
  "legal_form",
  "capital",
  "siret",
  "rcs",
  "vat_number",
  "publication_director",
  "address_street",
  "address_postal_code",
  "address_city",
  "contact_email",
  "contact_phone",
  "host_name",
  "host_address",
  "mediator_name",
  "mediator_website",
  "mediator_address",
  "preparation_delay",
  "shipping_delay",
  "shipping_delay_colissimo",
  "shipping_fee_mondial_relay",
  "shipping_fee_colissimo",
  "email_ack_subject",
  "email_ack_body",
  "email_ack_signature",
  "email_shop_subject",
  "email_shop_heading",
  "email_order_ack_subject",
  "email_order_ack_body",
  "email_order_ack_signature",
  "email_order_shop_subject",
  "email_order_shop_heading",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];
export type Settings = Record<SettingKey, string>;

const ORDER_PLACEHOLDER_HINT = `${NAME_PLACEHOLDER} est remplacé par le nom du client et ${NUMBER_PLACEHOLDER} par le numéro de commande.`;

export const SETTING_FIELDS: SettingField[] = [
  { key: "legal_name", label: "Raison sociale / nom commercial", group: "identity" },
  {
    key: "legal_form",
    label: "Forme juridique",
    group: "identity",
    hint: "Ex. Entreprise individuelle, SARL, SAS…",
  },
  { key: "capital", label: "Capital social", group: "identity", hint: "Laisser vide pour une entreprise individuelle." },
  { key: "siret", label: "SIRET", group: "identity" },
  {
    key: "rcs",
    label: "Immatriculation",
    group: "identity",
    hint: "Ex. RCS La Rochelle 123 456 789, ou RM 17 pour un artisan.",
  },
  { key: "vat_number", label: "N° de TVA intracommunautaire", group: "identity", hint: "Laisser vide en franchise de TVA." },
  { key: "publication_director", label: "Directeur·rice de la publication", group: "identity" },
  { key: "address_street", label: "Rue", group: "address" },
  { key: "address_postal_code", label: "Code postal", group: "address" },
  { key: "address_city", label: "Ville", group: "address" },
  { key: "contact_email", label: "E-mail", group: "contact", kind: "email" },
  { key: "contact_phone", label: "Téléphone", group: "contact", kind: "tel" },
  { key: "host_name", label: "Nom de l'hébergeur", group: "host" },
  { key: "host_address", label: "Adresse de l'hébergeur", group: "host", multiline: true },
  { key: "mediator_name", label: "Nom du médiateur", group: "mediator" },
  { key: "mediator_website", label: "Site web du médiateur", group: "mediator", kind: "url" },
  { key: "mediator_address", label: "Adresse postale du médiateur", group: "mediator", multiline: true },
  {
    key: "preparation_delay",
    label: "Délai de préparation",
    group: "shipping",
    hint: "Ex. 24 à 48 h ouvrées.",
  },
  {
    key: "shipping_fee_mondial_relay",
    label: "Frais Mondial Relay (€)",
    group: "shipping",
    kind: "price",
    max: 10,
    hint: "Ex. 4,90 — appliqué aux nouvelles commandes.",
  },
  {
    key: "shipping_delay",
    label: "Délai d'acheminement Mondial Relay",
    group: "shipping",
    hint: "Ex. 2 à 4 jours ouvrés après dépôt.",
  },
  {
    key: "shipping_fee_colissimo",
    label: "Frais Colissimo (€)",
    group: "shipping",
    kind: "price",
    max: 10,
    hint: "Ex. 7,90 — appliqué aux nouvelles commandes.",
  },
  {
    key: "shipping_delay_colissimo",
    label: "Délai d'acheminement Colissimo",
    group: "shipping",
    hint: "Ex. 2 à 3 jours ouvrés après dépôt.",
  },
  {
    key: "email_ack_subject",
    label: "Objet",
    group: "email_ack",
    max: 200,
    hint: `${NAME_PLACEHOLDER} est remplacé par le nom du visiteur.`,
  },
  {
    key: "email_ack_body",
    label: "Message",
    group: "email_ack",
    multiline: true,
    rows: 8,
    max: 4000,
    hint: `${NAME_PLACEHOLDER} est remplacé par le nom du visiteur. Une ligne vide sépare deux paragraphes.`,
  },
  {
    key: "email_ack_signature",
    label: "Signature",
    group: "email_ack",
    multiline: true,
    rows: 3,
    max: 500,
  },
  {
    key: "email_shop_subject",
    label: "Objet",
    group: "email_shop",
    max: 200,
    hint: `${NAME_PLACEHOLDER} est remplacé par le nom du visiteur.`,
  },
  {
    key: "email_shop_heading",
    label: "Titre affiché en haut du message",
    group: "email_shop",
    max: 200,
    hint: "Les coordonnées et le message du visiteur sont ajoutés automatiquement en dessous.",
  },
  {
    key: "email_order_ack_subject",
    label: "Objet",
    group: "email_order_ack",
    max: 200,
    hint: ORDER_PLACEHOLDER_HINT,
  },
  {
    key: "email_order_ack_body",
    label: "Message d'introduction",
    group: "email_order_ack",
    multiline: true,
    rows: 8,
    max: 4000,
    hint: `${ORDER_PLACEHOLDER_HINT} Le récapitulatif (articles, totaux, livraison) est ajouté automatiquement en dessous.`,
  },
  {
    key: "email_order_ack_signature",
    label: "Signature",
    group: "email_order_ack",
    multiline: true,
    rows: 3,
    max: 500,
  },
  {
    key: "email_order_shop_subject",
    label: "Objet",
    group: "email_order_shop",
    max: 200,
    hint: ORDER_PLACEHOLDER_HINT,
  },
  {
    key: "email_order_shop_heading",
    label: "Titre affiché en haut du message",
    group: "email_order_shop",
    max: 200,
    hint: "Les coordonnées du client et le récapitulatif sont ajoutés automatiquement en dessous.",
  },
];

export const DEFAULT_SETTINGS: Settings = {
  legal_name: "Café Coquelicot",
  legal_form: "",
  capital: "",
  siret: "",
  rcs: "",
  vat_number: "",
  publication_director: "",
  address_street: "12 rue du Gabut",
  address_postal_code: "17000",
  address_city: "La Rochelle",
  contact_email: "bonjour@coquelicot-lr.fr",
  contact_phone: "",
  host_name: "Vercel Inc.",
  host_address: "440 N Barranca Ave #4133, Covina, CA 91723, États-Unis",
  mediator_name: "",
  mediator_website: "",
  mediator_address: "",
  preparation_delay: "",
  shipping_delay: "",
  shipping_delay_colissimo: "",
  shipping_fee_mondial_relay: formatFeeInput(DEFAULT_SHIPPING_FEES.mondialRelay),
  shipping_fee_colissimo: formatFeeInput(DEFAULT_SHIPPING_FEES.colissimo),
  email_ack_subject: DEFAULT_EMAIL_TEMPLATES.ackSubject,
  email_ack_body: DEFAULT_EMAIL_TEMPLATES.ackBody,
  email_ack_signature: DEFAULT_EMAIL_TEMPLATES.ackSignature,
  email_shop_subject: DEFAULT_EMAIL_TEMPLATES.shopSubject,
  email_shop_heading: DEFAULT_EMAIL_TEMPLATES.shopHeading,
  email_order_ack_subject: DEFAULT_EMAIL_TEMPLATES.orderAckSubject,
  email_order_ack_body: DEFAULT_EMAIL_TEMPLATES.orderAckBody,
  email_order_ack_signature: DEFAULT_EMAIL_TEMPLATES.orderAckSignature,
  email_order_shop_subject: DEFAULT_EMAIL_TEMPLATES.orderShopSubject,
  email_order_shop_heading: DEFAULT_EMAIL_TEMPLATES.orderShopHeading,
};

const MAX_SHORT = 500;
const MAX_LONG = 2000;

export function fieldMaxLength(field: SettingField): number {
  return field.max ?? (field.multiline ? MAX_LONG : MAX_SHORT);
}

function fieldSchema(field: SettingField) {
  const max = fieldMaxLength(field);
  let schema = z
    .string()
    .trim()
    .max(max, { error: `${field.label} : ${max} caractères maximum.` });
  if (field.kind === "url") {
    schema = schema.refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), {
      error: `${field.label} : l'adresse doit commencer par http:// ou https://.`,
    }) as unknown as typeof schema;
  }
  if (field.kind === "email") {
    schema = schema.refine((v) => v === "" || z.email().safeParse(v).success, {
      error: `${field.label} : adresse e-mail invalide.`,
    }) as unknown as typeof schema;
  }
  if (field.kind === "price") {
    schema = schema.refine((v) => v === "" || parseFeeInput(v) !== null, {
      error: `${field.label} : montant invalide (ex. 4,90).`,
    }) as unknown as typeof schema;
  }
  return z.preprocess((v) => (v == null ? "" : v), schema);
}

const FIELD_SCHEMAS = Object.fromEntries(
  SETTING_FIELDS.map((f) => [f.key, fieldSchema(f)]),
) as Record<SettingKey, ReturnType<typeof fieldSchema>>;

export type SettingsFormResult =
  | { ok: true; data: Partial<Settings> }
  | { ok: false; error: string };

export function fieldsForGroups(groups: readonly SettingGroup[]): SettingField[] {
  return SETTING_FIELDS.filter((f) => groups.includes(f.group));
}

export function keysForGroups(groups: readonly SettingGroup[]): SettingKey[] {
  return fieldsForGroups(groups).map((f) => f.key);
}

export function readSettingsForm(
  formData: FormData,
  keys: readonly SettingKey[] = SETTING_KEYS,
): SettingsFormResult {
  const schema = z.object(
    Object.fromEntries(keys.map((key) => [key, FIELD_SCHEMAS[key]])),
  );
  const raw = Object.fromEntries(keys.map((key) => [key, formData.get(key)]));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }
  return { ok: true, data: parsed.data as Partial<Settings> };
}

export function emailTemplatesFromSettings(values: Settings): EmailTemplates {
  return {
    ackSubject: values.email_ack_subject,
    ackBody: values.email_ack_body,
    ackSignature: values.email_ack_signature,
    shopSubject: values.email_shop_subject,
    shopHeading: values.email_shop_heading,
    orderAckSubject: values.email_order_ack_subject,
    orderAckBody: values.email_order_ack_body,
    orderAckSignature: values.email_order_ack_signature,
    orderShopSubject: values.email_order_shop_subject,
    orderShopHeading: values.email_order_shop_heading,
  };
}

export function orderEmailContextFromSettings(values: Settings): OrderEmailContext {
  const city = [values.address_postal_code, values.address_city].filter(Boolean).join(" ");
  return {
    pickupAddress: [values.address_street, city].filter(Boolean).join(", "),
    preparationDelay: values.preparation_delay,
    shippingDelay: values.shipping_delay,
    shippingDelayColissimo: values.shipping_delay_colissimo,
  };
}

export function shippingFeesFromSettings(values: Settings): ShippingFees {
  return {
    mondialRelay:
      parseFeeInput(values.shipping_fee_mondial_relay) ?? DEFAULT_SHIPPING_FEES.mondialRelay,
    colissimo:
      parseFeeInput(values.shipping_fee_colissimo) ?? DEFAULT_SHIPPING_FEES.colissimo,
  };
}

export function isSettingKey(key: string): key is SettingKey {
  return (SETTING_KEYS as readonly string[]).includes(key);
}

export function parseSettings(rows: Array<{ key: string; value: string }>): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (isSettingKey(row.key) && row.value !== "") out[row.key] = row.value;
  }
  return out;
}
