// @vitest-environment node
// uploadImage doit refuser un contenu incohérent avec le type déclaré AVANT
// tout appel réseau — la validation ne dépend donc pas d'une config Supabase.
import { describe, expect, it } from "vitest";
import { uploadImage } from "@/lib/storage";

const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function file(content: BlobPart, type: string, name = "a.png"): File {
  return new File([content], name, { type });
}

describe("uploadImage", () => {
  it("refuse un fichier dont le contenu ne correspond pas au type déclaré", async () => {
    const payload = file("<!DOCTYPE html><script>alert(1)</script>", "image/png");
    await expect(uploadImage(payload)).rejects.toThrow(/contenu/i);
  });

  it("refuse un type non autorisé avant même de lire le contenu", async () => {
    await expect(uploadImage(file(PNG_HEAD, "image/gif", "a.gif"))).rejects.toThrow(
      /format/i,
    );
  });

  it("laisse passer la validation pour un vrai PNG (échoue ensuite faute de config)", async () => {
    // Sans SUPABASE_SECRET_KEY, l'échec attendu est « non configuré » :
    // preuve que la validation de contenu a été franchie.
    await expect(uploadImage(file(PNG_HEAD, "image/png"))).rejects.toThrow(
      /non configuré/i,
    );
  });
});
