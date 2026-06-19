import { expect, test } from "@playwright/test";

test.describe("vitrine — catalogue depuis la base", () => {
  test("la home affiche les 8 produits mis en avant", async ({ page }) => {
    await page.goto("/");
    const cards = page.locator("#shop .product-card");
    await expect(cards).toHaveCount(8);
    await expect(cards.first()).toContainText("rivage");
    await expect(cards.first()).toContainText("dès 48€");
    await expect(page.locator("#shop")).toContainText("embruns");
  });

  test("la boutique affiche les 17 produits avec leurs prix", async ({
    page,
  }) => {
    await page.goto("/boutique");
    await expect(page.locator(".boutique-grid .product-card")).toHaveCount(17);
    await expect(page.getByText("17 compositions")).toBeVisible();
    await expect(
      page.locator(".product-card", { hasText: "carte fleurie" }),
    ).toContainText("dès 25€");
  });

  test("le filtre par catégorie fonctionne", async ({ page }) => {
    await page.goto("/boutique");
    await page.getByRole("button", { name: "Fleurs séchées" }).click();
    const cards = page.locator(".boutique-grid .product-card");
    await expect(cards).toHaveCount(3);
    await expect(page.getByText("3 compositions")).toBeVisible();
    for (const name of ["sirocco", "solana", "alizé"]) {
      await expect(cards.filter({ hasText: name })).toHaveCount(1);
    }

    await page.getByRole("button", { name: "Vases" }).click();
    await expect(cards).toHaveCount(3);
    for (const name of ["galet", "carène", "écume"]) {
      await expect(cards.filter({ hasText: name })).toHaveCount(1);
    }

    await page.getByRole("button", { name: "Tout", exact: true }).click();
    await expect(cards).toHaveCount(17);
  });
});
