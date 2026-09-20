import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CartProvider } from "@/lib/cart/cart-context";
import { ProductDetail } from "@/components/product-detail";
import type { ShopProduct } from "@/lib/products";

const solana: ShopProduct = {
  id: "p1",
  slug: "solana",
  name: "solana",
  desc: "Immortelles, statice.",
  descRich: null,
  price: "dès 29€",
  priceCents: 2900,
  variant: 2,
  imagePath: null,
  imageBgColor: null,
  images: [],
  badge: null,
  category: "seche",
  sizes: [
    { id: "s-p", label: "Petit", priceCents: 2900 },
    { id: "s-g", label: "Grand", priceCents: 4200 },
  ],
  colors: [
    { id: "c-n", label: "Naturel", illustrationVariant: 2 },
    { id: "c-b", label: "Blanc", illustrationVariant: 4 },
  ],
};

function renderDetail(p: ShopProduct) {
  return render(
    <CartProvider>
      <ProductDetail product={p} />
    </CartProvider>,
  );
}

beforeEach(() => window.localStorage.clear());

describe("ProductDetail", () => {
  it("prix par défaut = 1ʳᵉ taille, réactif au changement de taille", () => {
    renderDetail(solana);
    expect(screen.getByTestId("product-price").textContent).toBe("29€");
    fireEvent.click(screen.getByRole("button", { name: /^Grand/ }));
    expect(screen.getByTestId("product-price").textContent).toBe("42€");
  });

  it("le stepper borne la quantité à 1 minimum", () => {
    renderDetail(solana);
    fireEvent.click(screen.getByRole("button", { name: "Réduire la quantité" }));
    expect(screen.getByTestId("product-qty").textContent).toBe("1");
  });

  it("ajoute la variante sélectionnée avec la quantité au panier", async () => {
    renderDetail(solana);
    fireEvent.click(screen.getByRole("button", { name: /^Grand/ }));
    fireEvent.click(screen.getByRole("button", { name: "Blanc" }));
    fireEvent.click(screen.getByRole("button", { name: "Augmenter la quantité" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Ajouter solana au panier" }),
    );
    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem("coquelicot.cart.v1") ?? "[]",
      );
      expect(stored).toEqual([
        {
          key: "solana__s-g__c-b",
          slug: "solana",
          name: "solana",
          priceCents: 4200,
          sizeId: "s-g",
          colorId: "c-b",
          sizeLabel: "Grand",
          colorLabel: "Blanc",
          qty: 2,
        },
      ]);
    });
  });
});

const IMG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp";
const IMG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.webp";
const IMG_C = "cccccccc-cccc-cccc-cccc-cccccccccccc.webp";
const IMG_D = "dddddddd-dddd-dddd-dddd-dddddddddddd.webp";

const withGallery: ShopProduct = {
  ...solana,
  imagePath: IMG_A,
  images: [
    { id: "i-a", path: IMG_A, bgColor: null, alt: "Le petit", sizeId: "s-p", colorId: null },
    { id: "i-b", path: IMG_B, bgColor: null, alt: "Le grand", sizeId: "s-g", colorId: null },
    { id: "i-c", path: IMG_C, bgColor: null, alt: "Les deux ensemble", sizeId: null, colorId: null },
  ],
};

function mainImageSrc(container: HTMLElement): string {
  const media = container.querySelector(".product-page__media")!;
  const img =
    media.querySelector(".is-active img") ?? media.querySelector("img")!;
  return img.getAttribute("src") ?? "";
}

describe("ProductDetail — galerie", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
  });

  it("n'affiche pas de vignettes quand il n'y a qu'une photo", () => {
    renderDetail({ ...withGallery, images: [withGallery.images[0]] });
    expect(screen.queryByRole("group", { name: /Photos de/ })).toBeNull();
  });

  it("affiche une vignette par photo et montre la première", () => {
    const { container } = renderDetail(withGallery);
    expect(screen.getAllByRole("button", { pressed: false, name: /Le grand|Les deux/ }).length).toBe(2);
    expect(mainImageSrc(container)).toContain(IMG_A);
  });

  it("change la photo principale au clic sur une vignette", () => {
    const { container } = renderDetail(withGallery);
    fireEvent.click(screen.getByRole("button", { name: "Les deux ensemble" }));
    expect(mainImageSrc(container)).toContain(IMG_C);
  });

  it("saute sur la photo rattachée à la taille choisie", () => {
    const { container } = renderDetail(withGallery);
    fireEvent.click(screen.getByRole("button", { name: /^Grand/ }));
    expect(mainImageSrc(container)).toContain(IMG_B);
  });

  it("laisse la photo en place quand la taille choisie n'en a aucune", () => {
    const noLink = {
      ...withGallery,
      images: withGallery.images.map((i) => ({ ...i, sizeId: null })),
    };
    const { container } = renderDetail(noLink);
    fireEvent.click(screen.getByRole("button", { name: "Les deux ensemble" }));
    fireEvent.click(screen.getByRole("button", { name: /^Grand/ }));
    expect(mainImageSrc(container)).toContain(IMG_C);
  });

  it("n'affiche que les photos du coloris choisi et celles qui ne visent personne", () => {
    const colored: ShopProduct = {
      ...withGallery,
      images: [
        ...withGallery.images,
        { id: "i-blanc", path: IMG_D, bgColor: null, alt: "Version blanche", sizeId: null, colorId: "c-b" },
      ],
    };
    const { container } = renderDetail(colored);
    expect(screen.queryByRole("button", { name: "Version blanche" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Blanc" }));
    expect(mainImageSrc(container)).toContain(IMG_D);
    expect(screen.getByRole("button", { name: "Version blanche" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Les deux ensemble" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Naturel" }));
    expect(screen.queryByRole("button", { name: "Version blanche" })).toBeNull();
    expect(mainImageSrc(container)).toContain(IMG_A);
  });

  it("croise taille et coloris pour choisir la photo la plus précise", () => {
    const colored: ShopProduct = {
      ...withGallery,
      images: [
        ...withGallery.images,
        { id: "i-blanc-g", path: IMG_D, bgColor: null, alt: "Blanc grand format", sizeId: "s-g", colorId: "c-b" },
      ],
    };
    const { container } = renderDetail(colored);
    fireEvent.click(screen.getByRole("button", { name: "Blanc" }));
    fireEvent.click(screen.getByRole("button", { name: /^Grand/ }));
    expect(mainImageSrc(container)).toContain(IMG_D);
  });
});

describe("ProductDetail — description", () => {
  it("rend la description riche quand elle existe", () => {
    const { container } = renderDetail({
      ...solana,
      descRich: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Tenue ", marks: [] }, { type: "text", text: "longue", marks: [{ type: "bold" }] }] },
          { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Sans eau" }] }] }] },
        ],
      },
    });
    expect(container.querySelector(".product-page__desc strong")?.textContent).toBe("longue");
    expect(container.querySelector(".product-page__desc li")?.textContent).toBe("Sans eau");
  });

  it("retombe sur le texte brut avec ses sauts de ligne", () => {
    const { container } = renderDetail({ ...solana, desc: "Ligne 1\nLigne 2" });
    const desc = container.querySelector(".product-page__desc")!;
    expect(desc.querySelectorAll("br").length).toBe(1);
    expect(desc.textContent).toBe("Ligne 1Ligne 2");
  });

  it("n'affiche plus de sous-titre", () => {
    const { container } = renderDetail(solana);
    expect(container.querySelector(".eyebrow")).toBeNull();
  });
});
