import { expect, test } from "@playwright/test";
import { addToCart } from "./helpers";

test.describe("vases — vente solo + suggestion toujours proposée", () => {
  test("un vase se vend seul, et la suggestion reste affichée", async ({ page }) => {
    await addToCart(page, "galet");
    await expect(page.getByRole("link", { name: "Panier (1)" })).toBeVisible();
    await page.goto("/panier");
    await expect(page.getByTestId("cart-line-galet")).toBeVisible();
    // Vases toujours proposés : la section reste visible même avec un vase au panier.
    await expect(page.getByTestId("vase-suggestions")).toBeVisible();
  });

  test("la suggestion est proposée avec un bouquet au panier", async ({ page }) => {
    await addToCart(page, "rivage");
    await page.goto("/panier");
    await expect(page.getByTestId("vase-suggestions")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ajouter galet au panier" }),
    ).toBeVisible();
  });

  test("quick-add ajoute le vase et la suggestion reste affichée", async ({
    page,
  }) => {
    await addToCart(page, "rivage");
    await page.goto("/panier");
    await page
      .getByRole("button", { name: "Ajouter galet au panier" })
      .click();
    await expect(page.getByTestId("cart-line-galet")).toBeVisible();
    await expect(page.getByTestId("vase-suggestions")).toBeVisible();
  });

  test("pas de suggestion sur un panier vide", async ({ page }) => {
    await page.goto("/panier");
    await expect(page.getByText("Votre panier est vide")).toBeVisible();
    await expect(page.getByTestId("vase-suggestions")).toHaveCount(0);
  });
});
