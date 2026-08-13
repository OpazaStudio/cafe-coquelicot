// @vitest-environment node
// L'upload passe par un Route Handler (et non une Server Action) pour que le
// plafond de corps de requête reste à 1 Mo sur les actions publiques
// (checkout, contact) — cf. serverActions.bodySizeLimit, global à toute l'app.
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: () => getCurrentUser() }));

import { POST } from "@/app/api/admin/product-image/route";

const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function post(body: FormData) {
  return POST(
    new Request("http://localhost/api/admin/product-image", {
      method: "POST",
      body,
    }),
  );
}

function withFile(content: BlobPart, type: string, name = "a.png"): FormData {
  const fd = new FormData();
  fd.set("file", new File([content], name, { type }));
  return fd;
}

beforeEach(() => {
  getCurrentUser.mockReset();
  getCurrentUser.mockResolvedValue({ email: "lea@test.local" });
});

describe("POST /api/admin/product-image", () => {
  it("répond 401 sans session admin (jamais de redirection)", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await post(withFile(PNG_HEAD, "image/png"));
    expect(res.status).toBe(401);
  });

  it("répond 400 quand aucun fichier n'est fourni", async () => {
    const res = await post(new FormData());
    expect(res.status).toBe(400);
  });

  it("répond 400 sur un type non autorisé", async () => {
    const res = await post(withFile(PNG_HEAD, "image/gif", "a.gif"));
    expect(res.status).toBe(400);
  });

  it("répond 400 quand le contenu contredit le type déclaré", async () => {
    const res = await post(withFile("<script>alert(1)</script>", "image/png"));
    expect(res.status).toBe(400);
  });

  it("répond 400 au-delà de la taille maximale", async () => {
    const { MAX_IMAGE_BYTES } = await import("@/lib/product-image");
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(PNG_HEAD);
    const res = await post(withFile(big, "image/png"));
    expect(res.status).toBe(400);
  });
});
