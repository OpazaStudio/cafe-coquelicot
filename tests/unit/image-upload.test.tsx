import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImageUpload } from "@/app/(admin)/admin/(panel)/produits/image-upload";

describe("ImageUpload", () => {
  it("affiche le fallback quand aucune image", () => {
    render(
      <ImageUpload
        value={null}
        bgColor={null}
        onChange={() => {}}
        fallback={<svg data-testid="fallback" />}
        label="Image du produit"
      />,
    );
    expect(screen.getByTestId("fallback")).toBeTruthy();
    expect(screen.getByText("Image du produit")).toBeTruthy();
  });

  it("affiche l'image quand value est fourni", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    const { container } = render(
      <ImageUpload
        value="uuid.png"
        bgColor="#eee"
        onChange={() => {}}
        fallback={<svg />}
      />,
    );
    expect(container.querySelector("img")).not.toBeNull();
  });
});
