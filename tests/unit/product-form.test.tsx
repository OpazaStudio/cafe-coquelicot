import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductForm } from "@/app/(admin)/admin/(panel)/produits/product-form";

vi.mock("@/app/(admin)/admin/(panel)/produits/actions", () => ({ uploadProductImage: vi.fn() }));

describe("ProductForm — image", () => {
  it("affiche le contrôle d'image produit", () => {
    render(<ProductForm action={async () => undefined} submitLabel="Créer" />);
    expect(screen.getByText("Image du produit")).toBeTruthy();
  });

  it("expose les champs cachés imagePath/imageBgColor", () => {
    const { container } = render(
      <ProductForm action={async () => undefined} submitLabel="Créer" />,
    );
    expect(container.querySelector('input[name="imagePath"]')).not.toBeNull();
    expect(container.querySelector('input[name="imageBgColor"]')).not.toBeNull();
  });
});
