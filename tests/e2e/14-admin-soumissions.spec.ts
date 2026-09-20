import { expect, test } from "@playwright/test";
import { adminLogin } from "./helpers";

const MESSAGE = "Bonjour, je cherche un bouquet pour un anniversaire.";

test.describe("soumissions du formulaire de contact", () => {
  test("un message est retrouvable dans le back-office même sans e-mail envoyé", async ({
    page,
  }) => {
    await page.goto("/");
    const form = page.locator("form.contact-form");
    await form.getByLabel("Nom *").fill("Camille Martin");
    await form.getByLabel("Email *").fill("camille@exemple.fr");
    await form.getByLabel("Téléphone *").fill("06 12 34 56 78");
    await form.getByLabel("Message *").fill(MESSAGE);
    await form.getByRole("button", { name: "Envoyer le message" }).click();

    await expect(page.getByRole("status")).toContainText("bien arrivé");

    await adminLogin(page);
    await page.goto("/admin/soumissions");

    const card = page.locator("li", { hasText: MESSAGE }).first();
    await expect(card).toContainText("Camille Martin");
    await expect(card).toContainText("camille@exemple.fr");
    await expect(card).toContainText("E-mail non envoyé");
    await expect(card).toContainText("Non lu");

    await card.getByRole("button", { name: "Marquer lu" }).click();
    await expect(
      page.locator("li", { hasText: MESSAGE }).first(),
    ).toContainText("Marquer non lu");

    await page
      .locator("li", { hasText: MESSAGE })
      .first()
      .getByRole("button", { name: "Supprimer" })
      .click();
    await expect(page.locator("li", { hasText: MESSAGE })).toHaveCount(0);
  });
});
