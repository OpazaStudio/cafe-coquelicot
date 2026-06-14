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

export async function addToCart(page: Page, name: string): Promise<void> {
  await page
    .getByRole("button", { name: `Ajouter ${name} au panier` })
    .click();
}

// Ajoute un produit en sélectionnant d'abord taille et/ou coloris sur sa carte.
export async function addVariantToCart(
  page: Page,
  name: string,
  opts: { size?: string; color?: string } = {},
): Promise<void> {
  const card = page.locator(".product-card", { hasText: name });
  if (opts.size) {
    await card.getByRole("button", { name: opts.size, exact: true }).click();
  }
  if (opts.color) {
    await card.getByRole("button", { name: opts.color, exact: true }).click();
  }
  await card
    .getByRole("button", { name: `Ajouter ${name} au panier` })
    .click();
}
