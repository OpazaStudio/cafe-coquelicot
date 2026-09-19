import { expect, type Page } from "@playwright/test";

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

export async function adminLogin(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Mot de passe").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/admin");
  await expect(
    page.getByRole("heading", { name: "Dashboard" }),
  ).toBeVisible();
}

// Ajout depuis la grille : la carte mène à la page produit, où vit le bouton.
export async function addToCart(page: Page, name: string): Promise<void> {
  await page.goto("/boutique");
  await page.locator(".product-card", { hasText: name }).first().click();
  await page
    .getByRole("button", { name: `Ajouter ${name} au panier` })
    .click();
}

// Ouvre la page produit puis sélectionne taille/coloris avant d'ajouter.
// (Le bouton taille affiche « Label · prix » → match par préfixe.)
export async function addVariantToCart(
  page: Page,
  name: string,
  opts: { size?: string; color?: string } = {},
): Promise<void> {
  await page.goto("/boutique");
  await page.locator(".product-card", { hasText: name }).first().click();
  if (opts.size) {
    await page.getByRole("button", { name: new RegExp(`^${opts.size}`) }).click();
  }
  if (opts.color) {
    await page.getByRole("button", { name: opts.color, exact: true }).click();
  }
  await page
    .getByRole("button", { name: `Ajouter ${name} au panier` })
    .click();
}

/** Cherche le champ carte dans la page OU dans une iframe Stripe. */
async function findCardFrame(page: Page) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const input = frame.locator('input[name="cardNumber"]');
      if (await input.isVisible().catch(() => false)) return frame;
    }
    await page.waitForTimeout(400);
  }
  throw new Error("Champ cardNumber introuvable (page Stripe).");
}

export async function fillStripeCheckout(page: Page) {
  // La page Stripe est hébergée sur checkout.stripe.com. Le bouton « Payer
  // par carte » a une zone de clic étendue en pseudo-élément : Playwright le
  // juge invisible alors qu'il intercepte les clics → dispatchEvent direct.
  await page.waitForLoadState("domcontentloaded");
  const directCard = page.locator('input[name="cardNumber"]');
  if (!(await directCard.isVisible().catch(() => false))) {
    const accordion = page.locator(
      '[data-testid="card-accordion-item-button"]',
    );
    await accordion.waitFor({ state: "attached", timeout: 45_000 });
    await accordion.dispatchEvent("click");
  }

  const frame = await findCardFrame(page);
  await frame.locator('input[name="cardNumber"]').fill("4242 4242 4242 4242");
  await frame.locator('input[name="cardExpiry"]').fill("12 / 34");
  await frame.locator('input[name="cardCvc"]').fill("123");
  const name = frame.locator('input[name="billingName"]');
  if (await name.isVisible().catch(() => false)) {
    await name.fill("Camille Martin");
  }
  const postal = frame.locator('input[name="billingPostalCode"]');
  if (await postal.isVisible().catch(() => false)) {
    await postal.fill("17000");
  }
  await page
    .locator('[data-testid="hosted-payment-submit-button"]')
    .or(page.getByRole("button", { name: "Payer", exact: true }))
    .first()
    .click();
}
