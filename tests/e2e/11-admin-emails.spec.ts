import { expect, test } from "@playwright/test";
import { adminLogin } from "./helpers";

const ACK_GROUP = "E-mail envoyé au visiteur (accusé de réception)";
const SUBJECT = "Bien reçu, merci {{nom}} !";

test.describe("textes des e-mails", () => {
  test("un objet modifié est enregistré et survit à l'enregistrement des mentions légales", async ({
    page,
  }) => {
    await adminLogin(page);
    await page.goto("/admin/emails");

    const ack = page.locator("section", {
      has: page.getByRole("heading", { name: ACK_GROUP }),
    });
    await ack.getByLabel("Objet").fill(SUBJECT);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("status")).toHaveText("Textes enregistrés.");

    await page.reload();
    await expect(ack.getByLabel("Objet")).toHaveValue(SUBJECT);

    await page.goto("/admin/parametres");
    await page.getByLabel("Capital social").fill("1 000 €");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("status")).toHaveText("Paramètres enregistrés.");

    await page.goto("/admin/emails");
    await expect(ack.getByLabel("Objet")).toHaveValue(SUBJECT);
  });
});
