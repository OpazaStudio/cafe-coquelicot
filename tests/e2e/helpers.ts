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
