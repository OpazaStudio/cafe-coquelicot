import { expect, test } from "@playwright/test";
import { addToCart } from "./helpers";

test.describe("panier", () => {
  test("ajout, quantités, sous-total et suppression", async ({ page }) => {
    await page.goto("/boutique");
    await expect(page.getByRole("link", { name: "Panier (0)" })).toBeVisible();

    await addToCart(page, "rivage"); // 48€
    await expect(page.getByRole("link", { name: "Panier (1)" })).toBeVisible();
    await addToCart(page, "rivage");
    await addToCart(page, "gabut"); // 38€
    await expect(page.getByRole("link", { name: "Panier (3)" })).toBeVisible();

    await page.getByRole("link", { name: "Panier (3)" }).click();
    await page.waitForURL("**/panier");

    await expect(page.getByTestId("cart-line-rivage")).toBeVisible();
    await expect(page.getByTestId("qty-rivage")).toHaveText("2");
    await expect(page.getByTestId("cart-subtotal")).toHaveText("134€"); // 2×48 + 38

    // + sur gabut → 2×38
    await page
      .getByRole("button", { name: "Augmenter la quantité de gabut" })
      .click();
    await expect(page.getByTestId("qty-gabut")).toHaveText("2");
    await expect(page.getByTestId("cart-subtotal")).toHaveText("172€");

    // − jusqu'à suppression
    await page
      .getByRole("button", { name: "Réduire la quantité de gabut" })
      .click();
    await page
      .getByRole("button", { name: "Réduire la quantité de gabut" })
      .click();
    await expect(page.getByTestId("cart-line-gabut")).toHaveCount(0);

    await page.getByRole("button", { name: "Retirer rivage du panier" }).click();
    await expect(page.getByText("Votre panier est vide")).toBeVisible();
    await expect(page.getByRole("link", { name: "Panier (0)" })).toBeVisible();
  });

  test("le panier survit à la navigation (localStorage)", async ({ page }) => {
    await page.goto("/boutique");
    await addToCart(page, "mistral");
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Panier (1)" })).toBeVisible();
  });
});
