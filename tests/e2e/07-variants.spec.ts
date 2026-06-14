import { expect, test } from "@playwright/test";
import { addVariantToCart } from "./helpers";

// `solana` est seedé avec 3 tailles (Petit 29 / Moyen 34 / Grand 42) et
// 2 coloris (Naturel / Blanc) — voir lib/db/seed-data.ts.
test.describe("variantes — page produit & panier", () => {
  test("sélection taille/coloris : prix réactif et lignes distinctes", async ({
    page,
  }) => {
    await page.goto("/boutique");
    await page.locator(".product-card", { hasText: "solana" }).first().click();
    await page.waitForURL("**/boutique/solana");

    // Taille Petit par défaut → 29€ ; Grand → 42€
    await expect(page.getByTestId("product-price")).toHaveText("29€");
    await page.getByRole("button", { name: /^Grand/ }).click();
    await expect(page.getByTestId("product-price")).toHaveText("42€");

    // Le coloris sélectionné est marqué pressé (et change l'illustration).
    const blanc = page.getByRole("button", { name: "Blanc", exact: true });
    await blanc.click();
    await expect(blanc).toHaveAttribute("aria-pressed", "true");

    // Grand·Blanc, Grand·Naturel, puis encore Grand·Blanc (→ qty 2 sur la ligne).
    await addVariantToCart(page, "solana", { size: "Grand", color: "Blanc" });
    await addVariantToCart(page, "solana", { size: "Grand", color: "Naturel" });
    await addVariantToCart(page, "solana", { size: "Grand", color: "Blanc" });
    await expect(page.getByRole("link", { name: "Panier (3)" })).toBeVisible();

    await page.goto("/panier");
    const lines = page.locator('[data-testid^="cart-line-solana"]');
    await expect(lines).toHaveCount(2);
    await expect(lines.filter({ hasText: "Grand · Blanc" })).toContainText("84€");
    await expect(lines.filter({ hasText: "Grand · Naturel" })).toContainText("42€");
    await expect(page.getByTestId("cart-subtotal")).toHaveText("126€");
  });
});
