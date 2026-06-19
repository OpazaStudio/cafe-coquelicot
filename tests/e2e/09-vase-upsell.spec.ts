import { expect, test } from "@playwright/test";
import { addToCart } from "./helpers";

test.describe("vases — vente solo + suggestion panier", () => {
  test("un vase se vend seul (boutique → fiche → panier)", async ({ page }) => {
    await addToCart(page, "galet");
    await expect(page.getByRole("link", { name: "Panier (1)" })).toBeVisible();
    await page.goto("/panier");
    await expect(page.getByTestId("cart-line-galet")).toBeVisible();
    // un vase seul ne déclenche pas la suggestion
    await expect(page.getByTestId("vase-suggestions")).toHaveCount(0);
  });

  test("la suggestion apparaît avec un bouquet sans vase", async ({ page }) => {
    await addToCart(page, "rivage");
    await page.goto("/panier");
    await expect(page.getByTestId("vase-suggestions")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ajouter galet au panier" }),
    ).toBeVisible();
  });

  test("quick-add depuis la suggestion ajoute le vase et masque la section", async ({
    page,
  }) => {
    await addToCart(page, "rivage");
    await page.goto("/panier");
    await page
      .getByRole("button", { name: "Ajouter galet au panier" })
      .click();
    await expect(page.getByTestId("cart-line-galet")).toBeVisible();
    await expect(page.getByTestId("vase-suggestions")).toHaveCount(0);
  });

  test("pas de suggestion sur un panier vide", async ({ page }) => {
    await page.goto("/panier");
    await expect(page.getByText("Votre panier est vide")).toBeVisible();
    await expect(page.getByTestId("vase-suggestions")).toHaveCount(0);
  });
});
