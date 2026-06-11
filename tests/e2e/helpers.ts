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
