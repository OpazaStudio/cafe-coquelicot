import { expect, test } from "@playwright/test";
import { addVariantToCart } from "./helpers";

// `solana` est seedé avec 3 tailles (Petit 29 / Moyen 34 / Grand 42) et
// 2 coloris (Naturel / Blanc) — voir lib/db/seed-data.ts.
test.describe("variantes — boutique & panier", () => {
  test("sélection taille/coloris : prix réactif et lignes distinctes", async ({
    page,
  }) => {
    await page.goto("/boutique");
    const card = page.locator(".product-card", { hasText: "solana" });
    await expect(card).toBeVisible();

    // Taille Petit par défaut → 29€ ; Grand → 42€
    await expect(card.locator(".product-card__price")).toHaveText("29€");
    await card.getByRole("button", { name: "Grand", exact: true }).click();
    await expect(card.locator(".product-card__price")).toHaveText("42€");

    // Le coloris sélectionné est marqué pressé (et change l'illustration).
    const blanc = card.getByRole("button", { name: "Blanc", exact: true });
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

    const blancLine = lines.filter({ hasText: "Grand · Blanc" });
    await expect(blancLine).toContainText("84€"); // 42 × 2
    const naturelLine = lines.filter({ hasText: "Grand · Naturel" });
    await expect(naturelLine).toContainText("42€");

    await expect(page.getByTestId("cart-subtotal")).toHaveText("126€");
  });
});
