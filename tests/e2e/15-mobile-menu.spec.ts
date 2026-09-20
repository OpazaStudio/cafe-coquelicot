import { expect, test } from "@playwright/test";

test.describe("vitrine — menu mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("le burger ouvre le menu et un lien navigue puis referme", async ({
    page,
  }) => {
    await page.goto("/");
    const burger = page.getByRole("button", { name: "Ouvrir le menu" });
    await expect(burger).toBeVisible();
    await expect(burger).toHaveAttribute("aria-expanded", "false");

    const menu = page.getByRole("dialog", { name: "Menu" });
    await expect(menu).toBeHidden();

    await burger.click();
    await expect(menu).toBeVisible();
    await expect(burger).toHaveAttribute("aria-expanded", "true");
    for (const label of ["Boutique", "Galerie", "Prestations", "À propos", "Contact", "Panier"]) {
      await expect(menu.getByRole("link", { name: new RegExp(`^${label}`) })).toBeVisible();
    }

    await menu.getByRole("link", { name: "Boutique" }).click();
    await page.waitForURL("**/boutique");
    await expect(menu).toBeHidden();
    await expect(burger).toHaveAttribute("aria-expanded", "false");
  });

  test("la croix et Échap referment le menu", async ({ page }) => {
    await page.goto("/");
    const burger = page.getByRole("button", { name: "Ouvrir le menu" });
    const menu = page.getByRole("dialog", { name: "Menu" });

    await burger.click();
    await expect(menu).toBeVisible();
    await menu.getByRole("button", { name: "Fermer le menu" }).click();
    await expect(menu).toBeHidden();

    await burger.click();
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(burger).toBeFocused();
  });
});

test.describe("vitrine — menu desktop", () => {
  test("le burger est masqué et la navigation inline reste visible", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Ouvrir le menu" })).toBeHidden();
    await expect(
      page.locator(".site-header__nav").getByRole("link", { name: "Boutique" }),
    ).toBeVisible();
  });
});
