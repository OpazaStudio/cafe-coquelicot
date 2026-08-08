import { describe, expect, it } from "vitest";
import {
  productImageUrl,
  validateImageFile,
  MAX_IMAGE_BYTES,
} from "@/lib/product-image";

describe("productImageUrl", () => {
  it("construit l'URL publique du bucket", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    expect(productImageUrl("uuid.png")).toBe(
      "https://abc.supabase.co/storage/v1/object/public/coquelicot-bucket/uuid.png",
    );
  });
});

describe("validateImageFile", () => {
  it("accepte un png sous la limite", () => {
    expect(validateImageFile({ type: "image/png", size: 1000 })).toEqual({ ok: true });
  });
  it("refuse un type non autorisé", () => {
    const r = validateImageFile({ type: "image/gif", size: 1000 });
    expect(r.ok).toBe(false);
  });
  it("refuse au-dessus de la taille max", () => {
    const r = validateImageFile({ type: "image/png", size: MAX_IMAGE_BYTES + 1 });
    expect(r.ok).toBe(false);
  });
});
