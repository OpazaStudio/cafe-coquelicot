import { expect, test } from "@playwright/test";
import { addToCart } from "./helpers";

test.describe("page produit", () => {
  test("slug inconnu → 404", async ({ page }) => {
    const res = await page.goto("/boutique/inexistant-xyz");
    expect(res?.status()).toBe(404);
  });

  test("produit nu : fil d'Ariane, prix, ajout sans sélecteurs", async ({
    page,
  }) => {
    await page.goto("/boutique");
    await page
      .locator(".product-card", { hasText: "carte fleurie" })
      .first()
      .click();
    await page.waitForURL("**/boutique/carte-fleurie");

    await expect(
      page.getByRole("navigation", { name: "Fil d'Ariane" }),
    ).toContainText("boutique");
    await expect(page.getByTestId("product-price")).toHaveText("25€");
    // Pas de sélecteur de taille pour un produit nu.
    await expect(page.getByRole("button", { name: /^Grand/ })).toHaveCount(0);

    await addToCart(page, "carte fleurie");
    await expect(page.getByRole("link", { name: "Panier (1)" })).toBeVisible();
  });
});
