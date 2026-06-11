import Stripe from "stripe";

// Clé restreinte (rk_) de préférence, clé secrète en secours.
// Jamais de clé côté client : seul STRIPE_PUBLIC_KEY est exposable.
let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (client) return client;
  const key =
    process.env.STRIPE_RESTRICTED_KEY ?? process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_RESTRICTED_KEY ou STRIPE_SECRET_KEY manquante dans l'environnement.",
    );
  }
  client = new Stripe(key);
  return client;
}

export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}
