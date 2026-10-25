import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProductForm } from "@/app/(admin)/admin/(panel)/produits/product-form";
import type { ProductRow } from "@/lib/db/schema";

vi.mock("@/app/(admin)/admin/(panel)/produits/actions", () => ({ uploadProductImage: vi.fn() }));

const base: ProductRow = {
  id: "p1",
  slug: "solana",
  name: "solana",
  tag: null,
  description: "Ligne 1\nLigne 2",
  descriptionRich: null,
  priceCents: 3400,
  category: "seche",
  badge: null,
  illustrationVariant: 2,
  imagePath: null,
  imageBgColor: null,
  imageFrame: "1:1",
  active: true,
  stockQty: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function hidden(container: HTMLElement, name: string) {
  return container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
}

describe("ProductForm", () => {
  it("n'expose plus de champ sous-titre", () => {
    const { container } = render(<ProductForm action={async () => undefined} submitLabel="Créer" />);
    expect(screen.queryByText("Sous-titre")).toBeNull();
    expect(hidden(container, "tag")).toBeNull();
  });

  it("sérialise la description riche et la galerie en champs cachés", () => {
    const { container } = render(<ProductForm action={async () => undefined} submitLabel="Créer" />);
    expect(hidden(container, "descriptionRich")).not.toBeNull();
    expect(hidden(container, "images")).not.toBeNull();
    expect(JSON.parse(hidden(container, "images")!.value)).toEqual([]);
  });

  it("n'envoie plus imagePath/imageBgColor : la couverture vient de la galerie", () => {
    const { container } = render(<ProductForm action={async () => undefined} submitLabel="Créer" />);
    expect(hidden(container, "imagePath")).toBeNull();
    expect(hidden(container, "imageBgColor")).toBeNull();
  });

  it("amorce l'éditeur avec la description texte d'un produit antérieur", () => {
    const { container } = render(
      <ProductForm action={async () => undefined} product={base} submitLabel="Enregistrer" />,
    );
    expect(JSON.parse(hidden(container, "descriptionRich")!.value)).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Ligne 1" }] },
        { type: "paragraph", content: [{ type: "text", text: "Ligne 2" }] },
      ],
    });
  });

  it("préfère le document riche déjà enregistré", () => {
    const rich = {
      type: "doc" as const,
      content: [
        {
          type: "paragraph" as const,
          content: [{ type: "text" as const, text: "En gras", marks: [{ type: "bold" as const }] }],
        },
      ],
    };
    const { container } = render(
      <ProductForm
        action={async () => undefined}
        product={{ ...base, descriptionRich: rich }}
        submitLabel="Enregistrer"
      />,
    );
    expect(JSON.parse(hidden(container, "descriptionRich")!.value)).toEqual(rich);
  });

  it("liste les photos existantes, marque la couverture et propose les tailles", () => {
    const { container } = render(
      <ProductForm
        action={async () => undefined}
        product={base}
        sizes={[
          { id: "11111111-1111-1111-1111-111111111111", productId: "p1", label: "Petit", priceCents: 2900, sortOrder: 0, active: true, stockQty: null, createdAt: new Date() },
        ]}
        images={[
          { id: "22222222-2222-2222-2222-222222222222", productId: "p1", sizeId: "11111111-1111-1111-1111-111111111111", colorId: null, path: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp", bgColor: null, alt: "De face", sortOrder: 0, createdAt: new Date() },
        ]}
        submitLabel="Enregistrer"
      />,
    );
    expect(screen.getByTestId("image-row-0")).toBeTruthy();
    expect(screen.getByText("couverture")).toBeTruthy();
    const select = screen.getByLabelText("Taille montrée photo 1") as HTMLSelectElement;
    expect(select.value).toBe("11111111-1111-1111-1111-111111111111");
    expect([...select.options].map((o) => o.textContent)).toEqual(["Toutes", "Petit"]);
    expect(JSON.parse(hidden(container, "images")!.value)[0]).toMatchObject({
      alt: "De face",
      sizeKey: "11111111-1111-1111-1111-111111111111",
    });
  });

  it("réinjecte la couverture quand la galerie est vide (migration 0012 partielle)", () => {
    const { container } = render(
      <ProductForm
        action={async () => undefined}
        product={{ ...base, imagePath: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp", imageBgColor: "#eee" }}
        images={[]}
        submitLabel="Enregistrer"
      />,
    );
    expect(JSON.parse(hidden(container, "images")!.value)).toMatchObject([
      { path: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp", bgColor: "#eee", sizeKey: null },
    ]);
    expect(JSON.parse(hidden(container, "images")!.value)[0].id).toBeUndefined();
  });

  it("propose un format de cadre, carré par défaut, et recadre les vignettes en conséquence", () => {
    const { container } = render(
      <ProductForm
        action={async () => undefined}
        product={{ ...base, imageFrame: "3:4" }}
        images={[
          { id: "22222222-2222-2222-2222-222222222222", productId: "p1", sizeId: null, colorId: null, path: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp", bgColor: null, alt: null, sortOrder: 0, createdAt: new Date() },
        ]}
        submitLabel="Enregistrer"
      />,
    );
    const select = screen.getByLabelText("Format du cadre") as HTMLSelectElement;
    expect(select.name).toBe("imageFrame");
    expect(select.value).toBe("3:4");
    expect([...select.options].map((o) => o.value)).toContain("16:9");
    expect(screen.getByTestId("image-frame-0").style.aspectRatio).toBe("3 / 4");

    fireEvent.change(select, { target: { value: "4:3" } });
    expect(screen.getByTestId("image-frame-0").style.aspectRatio).toBe("4 / 3");
    expect(container.querySelector<HTMLSelectElement>('select[name="imageFrame"]')!.value).toBe("4:3");
  });

  it("retombe sur le carré quand le produit n'a pas encore de format", () => {
    render(<ProductForm action={async () => undefined} submitLabel="Créer" />);
    expect((screen.getByLabelText("Format du cadre") as HTMLSelectElement).value).toBe("1:1");
  });

  it("expose un champ de stock par taille, en texte, et les unités retenues", () => {
    const { container } = render(
      <ProductForm
        action={async () => undefined}
        product={base}
        sizes={[
          { id: "11111111-1111-1111-1111-111111111111", productId: "p1", label: "Petit", priceCents: 2900, sortOrder: 0, active: true, stockQty: 3, createdAt: new Date() },
          { id: "11111111-1111-1111-1111-111111111112", productId: "p1", label: "Grand", priceCents: 4200, sortOrder: 1, active: true, stockQty: null, createdAt: new Date() },
        ]}
        pendingBySizeId={new Map([["11111111-1111-1111-1111-111111111111", 2]])}
        submitLabel="Enregistrer"
      />,
    );
    const petit = screen.getByLabelText("Stock taille 1") as HTMLInputElement;
    expect(petit.type).toBe("text");
    expect(petit.inputMode).toBe("numeric");
    expect(petit.value).toBe("3");
    expect((screen.getByLabelText("Stock taille 2") as HTMLInputElement).value).toBe("");
    expect(
      screen.getByText("+ 2 retenues par des commandes en attente de paiement"),
    ).toBeTruthy();
    expect(screen.queryByText(/^dont /)).toBeNull();
    expect(JSON.parse(hidden(container, "sizes")!.value)).toMatchObject([
      { stockQty: "3", stockQtyInitial: "3" },
      { stockQty: "", stockQtyInitial: "" },
    ]);
  });

  it("n'offre le compteur du produit que lorsqu'il n'a aucune taille", () => {
    const { container } = render(
      <ProductForm
        action={async () => undefined}
        product={{ ...base, stockQty: 4 }}
        pendingProductQty={1}
        submitLabel="Enregistrer"
      />,
    );
    const field = screen.getByLabelText("Stock du produit") as HTMLInputElement;
    expect(field.name).toBe("stockQty");
    expect(field.value).toBe("4");
    expect(field.placeholder).toBe("Illimité");
    expect(hidden(container, "stockQtyInitial")!.value).toBe("4");
    expect(
      screen.getByText("+ 1 retenue par des commandes en attente de paiement"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter une taille" }));
    expect(screen.queryByLabelText("Stock du produit")).toBeNull();
    expect(hidden(container, "stockQtyInitial")).toBeNull();
  });

  it("garde la valeur initiale figée quand la saisie de stock change", () => {
    const { container } = render(
      <ProductForm
        action={async () => undefined}
        product={base}
        sizes={[
          { id: "11111111-1111-1111-1111-111111111111", productId: "p1", label: "Petit", priceCents: 2900, sortOrder: 0, active: true, stockQty: 3, createdAt: new Date() },
        ]}
        submitLabel="Enregistrer"
      />,
    );
    fireEvent.change(screen.getByLabelText("Stock taille 1"), { target: { value: "07" } });
    expect(JSON.parse(hidden(container, "sizes")!.value)[0]).toMatchObject({
      stockQty: "07",
      stockQtyInitial: "3",
    });
  });

  it("monte la barre d'outils de l'éditeur riche", async () => {
    render(<ProductForm action={async () => undefined} submitLabel="Créer" />);
    await waitFor(() => expect(screen.getByLabelText("Gras")).toBeTruthy());
    expect(screen.getByLabelText("Italique")).toBeTruthy();
    expect(screen.getByLabelText("Liste à puces")).toBeTruthy();
    expect(screen.getByLabelText("Liste numérotée")).toBeTruthy();
    expect(screen.getByLabelText("Insérer un lien")).toBeTruthy();
  });
});
