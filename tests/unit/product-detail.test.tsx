import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CartProvider } from "@/lib/cart/cart-context";
import { trackAddToCart } from "@/lib/analytics/gtag";
import { ProductDetail } from "@/components/product-detail";
import { cartAvailability } from "@/app/panier/availability";
import { ADD_CAP_TIMEOUT_MS, BUSY_LABEL_DELAY_MS } from "@/lib/cart/stock-caps";
import type { ShopProduct } from "@/lib/products";

vi.mock("@/lib/analytics/gtag", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/gtag")>()),
  trackAddToCart: vi.fn(),
}));

vi.mock("@/app/panier/availability", () => ({ cartAvailability: vi.fn() }));

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
  imageFrame: "1:1",
  images: [],
  badge: null,
  category: "seche",
  sizes: [
    { id: "s-p", label: "Petit", priceCents: 2900, soldOut: false },
    { id: "s-g", label: "Grand", priceCents: 4200, soldOut: false },
  ],
  colors: [
    { id: "c-n", label: "Naturel", illustrationVariant: 2 },
    { id: "c-b", label: "Blanc", illustrationVariant: 4 },
  ],
  soldOut: false,
};

function renderDetail(p: ShopProduct) {
  return render(
    <CartProvider>
      <ProductDetail product={p} />
    </CartProvider>,
  );
}

const CART_KEY = "coquelicot.cart.v1";

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(trackAddToCart).mockClear();
  vi.mocked(cartAvailability).mockReset();
  vi.mocked(cartAvailability).mockResolvedValue([]);
});

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

describe("ProductDetail — cadre et mobile", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
  });

  it("applique le format de cadre du produit au média", () => {
    const { container } = renderDetail({ ...withGallery, imageFrame: "4:5" });
    const media = container.querySelector<HTMLElement>(".product-page__media")!;
    expect(media.dataset.frame).toBe("4:5");
    expect(media.style.getPropertyValue("--frame-w")).toBe("4");
    expect(media.style.getPropertyValue("--frame-h")).toBe("5");
  });

  it("propose des points de navigation, un par photo visible", () => {
    renderDetail(withGallery);
    const dots = screen.getAllByRole("button", { name: /^Photo \d sur 3$/ });
    expect(dots.length).toBe(3);
    expect(dots[0].getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(dots[2]);
    expect(dots[2].getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Les deux ensemble" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("masque du défilement les photos des autres coloris", () => {
    const colored: ShopProduct = {
      ...withGallery,
      images: [
        ...withGallery.images,
        { id: "i-blanc", path: IMG_D, bgColor: null, alt: "Version blanche", sizeId: null, colorId: "c-b" },
      ],
    };
    const { container } = renderDetail(colored);
    const photos = () => [...container.querySelectorAll(".product-photo")];
    expect(photos().filter((p) => p.classList.contains("is-hidden")).length).toBe(1);
    expect(screen.getAllByRole("button", { name: /^Photo \d sur 3$/ }).length).toBe(3);
    fireEvent.click(screen.getByRole("button", { name: "Blanc" }));
    expect(photos().filter((p) => p.classList.contains("is-hidden")).length).toBe(0);
    expect(screen.getAllByRole("button", { name: /^Photo \d sur 4$/ }).length).toBe(4);
  });

  it("suit le défilement tactile : la photo visible devient active", () => {
    const { container } = renderDetail(withGallery);
    const scroller = container.querySelector<HTMLElement>(".product-photos")!;
    Object.defineProperty(scroller, "clientWidth", { value: 300, configurable: true });
    Object.defineProperty(scroller, "scrollWidth", { value: 900, configurable: true });
    scroller.scrollLeft = 600;
    fireEvent.scroll(scroller);
    expect(mainImageSrc(container)).toContain(IMG_C);
    expect(screen.getByRole("button", { name: "Photo 3 sur 3" }).getAttribute("aria-pressed")).toBe("true");
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

const partlySoldOut: ShopProduct = {
  ...solana,
  sizes: [
    { id: "s-p", label: "Petit", priceCents: 2900, soldOut: true },
    { id: "s-g", label: "Grand", priceCents: 4200, soldOut: false },
  ],
};

const allSoldOut: ShopProduct = {
  ...solana,
  sizes: solana.sizes.map((s) => ({ ...s, soldOut: true })),
  soldOut: true,
};

const bareSoldOut: ShopProduct = {
  ...solana,
  sizes: [],
  colors: [],
  soldOut: true,
};

async function cartReady() {
  await waitFor(() => expect(window.localStorage.getItem(CART_KEY)).toBe("[]"));
}

function ctaButton(name: string) {
  return screen.getByRole("button", { name });
}

describe("ProductDetail — stock épuisé", () => {
  it("présélectionne la première taille disponible", () => {
    renderDetail(partlySoldOut);
    expect(screen.getByRole("button", { name: /^Grand/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^Petit/ }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("product-price").textContent).toBe("42€");
  });

  it("rend les tailles épuisées visibles mais inactives", () => {
    renderDetail(partlySoldOut);
    const petit = screen.getByRole("button", { name: /^Petit/ });
    expect(petit.getAttribute("aria-disabled")).toBe("true");
    expect(petit.hasAttribute("disabled")).toBe(false);
    expect(petit.classList.contains("is-sold-out")).toBe(true);
    expect(petit.textContent).toContain("Épuisé");
    const grand = screen.getByRole("button", { name: /^Grand/ });
    expect(grand.hasAttribute("aria-disabled")).toBe(false);
    expect(grand.classList.contains("is-sold-out")).toBe(false);
    expect(grand.textContent).not.toContain("Épuisé");
  });

  it("un clic sur une taille épuisée ne change ni la sélection ni le prix", () => {
    renderDetail(partlySoldOut);
    fireEvent.click(screen.getByRole("button", { name: /^Petit/ }));
    expect(screen.getByRole("button", { name: /^Grand/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^Petit/ }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("product-price").textContent).toBe("42€");
  });

  it("ajoute la taille disponible après un clic sans effet sur la taille épuisée", async () => {
    renderDetail(partlySoldOut);
    await cartReady();
    fireEvent.click(screen.getByRole("button", { name: /^Petit/ }));
    fireEvent.click(ctaButton("Ajouter solana au panier"));
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(CART_KEY) ?? "[]");
      expect(stored.map((i: { sizeId: string }) => i.sizeId)).toEqual(["s-g"]);
    });
    expect(trackAddToCart).toHaveBeenCalledTimes(1);
  });

  it("handleAdd ne fait rien sur une taille épuisée", async () => {
    renderDetail(allSoldOut);
    await cartReady();
    fireEvent.click(ctaButton("solana, épuisé"));
    expect(trackAddToCart).not.toHaveBeenCalled();
    expect(cartAvailability).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(CART_KEY)).toBe("[]");
    expect(screen.queryByRole("link", { name: /Voir le panier/ })).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.queryByText(/Ajouté/)).toBeNull();
  });

  it("handleAdd ne fait rien sur un produit nu épuisé", async () => {
    renderDetail(bareSoldOut);
    await cartReady();
    fireEvent.click(ctaButton("solana, épuisé"));
    expect(trackAddToCart).not.toHaveBeenCalled();
    expect(cartAvailability).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(CART_KEY)).toBe("[]");
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("le CTA passe à « Épuisé » quand tout est épuisé", () => {
    renderDetail(allSoldOut);
    const cta = ctaButton("solana, épuisé");
    expect(cta.textContent).toBe("Épuisé");
    expect(cta.getAttribute("aria-disabled")).toBe("true");
    expect(cta.hasAttribute("disabled")).toBe(false);
    expect(screen.queryByRole("button", { name: "Ajouter solana au panier" })).toBeNull();
  });

  it("le CTA reste « Ajouter au panier » tant qu'une taille est disponible", () => {
    renderDetail(partlySoldOut);
    const cta = ctaButton("Ajouter solana au panier");
    expect(cta.textContent).toContain("Ajouter au panier");
    expect(cta.hasAttribute("aria-disabled")).toBe(false);
  });

  it("« Épuisé » passe avant le badge admin sur le média", () => {
    const { container } = renderDetail({ ...allSoldOut, badge: "Nouveau" });
    const badges = [...container.querySelectorAll(".product-page__media .product-card__badge")];
    expect(badges.map((b) => b.textContent)).toEqual(["Épuisé"]);
  });

  it("garde le badge admin tant que le produit n'est pas épuisé", () => {
    const { container } = renderDetail({ ...partlySoldOut, badge: "Nouveau" });
    const badges = [...container.querySelectorAll(".product-page__media .product-card__badge")];
    expect(badges.map((b) => b.textContent)).toEqual(["Nouveau"]);
  });
});

type Seed = { sizeId: string | null; colorId: string | null; qty: number };

function seedCart(lines: Seed[]) {
  window.localStorage.setItem(
    CART_KEY,
    JSON.stringify(
      lines.map((line) => ({
        slug: "solana",
        name: "solana",
        priceCents: 4200,
        sizeId: line.sizeId,
        colorId: line.colorId,
        sizeLabel: line.sizeId === "s-g" ? "Grand" : "Petit",
        colorLabel: line.colorId === "c-b" ? "Blanc" : "Naturel",
        qty: line.qty,
      })),
    ),
  );
}

function answers(maxQty: number | null, reason?: "size_required") {
  vi.mocked(cartAvailability).mockResolvedValue([
    { slug: "solana", sizeId: "s-g", maxQty, reason },
  ]);
}

const bare: ShopProduct = { ...solana, sizes: [], colors: [], soldOut: false };

function bareAnswers(maxQty: number | null, reason?: "size_required") {
  vi.mocked(cartAvailability).mockResolvedValue([
    { slug: "solana", sizeId: null, maxQty, reason },
  ]);
}

function dropFocus() {
  const sink = document.createElement("button");
  document.body.appendChild(sink);
  sink.focus();
  sink.remove();
}

function deferred<T>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

async function hydrated() {
  await waitFor(() => expect(window.localStorage.getItem(CART_KEY)).not.toBeNull());
}

const stored = () =>
  JSON.parse(window.localStorage.getItem(CART_KEY) ?? "[]") as Array<{
    key: string;
    qty: number;
  }>;

const notice = () => screen.getByTestId("product-notice");

function clickAdd() {
  fireEvent.click(screen.getByRole("button", { name: "Ajouter solana au panier" }));
}

async function pickGrandBlanc() {
  fireEvent.click(screen.getByRole("button", { name: /^Grand/ }));
  fireEvent.click(screen.getByRole("button", { name: "Blanc" }));
}

describe("ProductDetail — plafond à l'ajout", () => {
  it("déduit ce que le panier contient déjà, tous coloris confondus", async () => {
    seedCart([{ sizeId: "s-g", colorId: "c-n", qty: 1 }]);
    answers(1);
    renderDetail(solana);
    await hydrated();
    await pickGrandBlanc();
    fireEvent.click(screen.getByRole("button", { name: "Augmenter la quantité" }));
    clickAdd();

    await waitFor(() =>
      expect(notice().textContent).toBe(
        "Votre panier contient déjà tout ce qui reste disponible.",
      ),
    );
    expect(stored()).toEqual([
      expect.objectContaining({ key: "solana__s-g__c-n", qty: 1 }),
    ]);
    expect(trackAddToCart).not.toHaveBeenCalled();
    expect(screen.queryByText(/Ajouté ✓/)).toBeNull();
    expect(screen.getByRole("link", { name: /Voir le panier/ })).toBeTruthy();
  });

  it("n'ajoute que la place restante quand le panier en contient déjà", async () => {
    seedCart([{ sizeId: "s-g", colorId: "c-n", qty: 1 }]);
    answers(3);
    renderDetail(solana);
    await hydrated();
    await pickGrandBlanc();
    fireEvent.click(screen.getByRole("button", { name: "Augmenter la quantité" }));
    fireEvent.click(screen.getByRole("button", { name: "Augmenter la quantité" }));
    clickAdd();

    await waitFor(() =>
      expect(notice().textContent).toBe(
        "Stock limité : 2 ajoutés au panier au lieu de 3.",
      ),
    );
    expect(stored()).toEqual([
      expect.objectContaining({ key: "solana__s-g__c-n", qty: 1 }),
      expect.objectContaining({ key: "solana__s-g__c-b", qty: 2 }),
    ]);
    expect(trackAddToCart).toHaveBeenCalledWith(
      expect.objectContaining({ qty: 2, colorLabel: "Blanc" }),
    );
  });

  it("ajuste la quantité sur un panier vide et accorde le singulier", async () => {
    answers(1);
    renderDetail(solana);
    await hydrated();
    await pickGrandBlanc();
    fireEvent.click(screen.getByRole("button", { name: "Augmenter la quantité" }));
    clickAdd();

    await waitFor(() =>
      expect(notice().textContent).toBe(
        "Stock limité : 1 ajouté au panier au lieu de 2.",
      ),
    );
    expect(stored()).toEqual([
      expect.objectContaining({ key: "solana__s-g__c-b", qty: 1 }),
    ]);
    expect(notice().className).toBe("product-page__notice");
  });

  it("n'ajoute rien quand la taille est devenue indisponible entre-temps", async () => {
    answers(0);
    renderDetail(solana);
    await hydrated();
    await pickGrandBlanc();
    clickAdd();

    await waitFor(() =>
      expect(notice().textContent).toBe(
        "Cet article n'est plus disponible : rien n'a été ajouté au panier.",
      ),
    );
    expect(stored()).toEqual([]);
    expect(trackAddToCart).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: /Voir le panier/ })).toBeNull();
  });

  it("renvoie vers la page plutôt que d'ajouter une ligne sans taille", async () => {
    bareAnswers(0, "size_required");
    renderDetail(bare);
    await hydrated();
    clickAdd();

    await waitFor(() =>
      expect(notice().textContent).toBe(
        "Les tailles de cet article ont changé : rechargez la page pour en choisir une.",
      ),
    );
    expect(stored()).toEqual([]);
    expect(trackAddToCart).not.toHaveBeenCalled();
    expect(cartAvailability).toHaveBeenCalledWith([{ slug: "solana", sizeId: null }]);
  });

  it("déduit le panier d'un produit nu, dont la clé de stock n'a pas de taille", async () => {
    seedCart([{ sizeId: null, colorId: null, qty: 1 }]);
    bareAnswers(1);
    renderDetail(bare);
    await hydrated();
    clickAdd();

    await waitFor(() =>
      expect(notice().textContent).toBe(
        "Votre panier contient déjà tout ce qui reste disponible.",
      ),
    );
    expect(stored()).toEqual([expect.objectContaining({ key: "solana", qty: 1 })]);
    expect(trackAddToCart).not.toHaveBeenCalled();
  });

  it("interroge le serveur sur le seul couple slug/taille sélectionné", async () => {
    answers(null);
    renderDetail(solana);
    await hydrated();
    await pickGrandBlanc();
    clickAdd();

    await waitFor(() => expect(stored().length).toBe(1));
    expect(cartAvailability).toHaveBeenCalledWith([{ slug: "solana", sizeId: "s-g" }]);
    expect(notice().className).toBe("sr-only");
    expect(notice().textContent).toBe("solana ajouté au panier.");
  });

  it("ne plafonne pas une taille illimitée", async () => {
    answers(null);
    renderDetail(solana);
    await hydrated();
    fireEvent.click(screen.getByRole("button", { name: "Augmenter la quantité" }));
    fireEvent.click(screen.getByRole("button", { name: "Augmenter la quantité" }));
    clickAdd();

    await waitFor(() => expect(stored()).toEqual([expect.objectContaining({ qty: 3 })]));
    expect(notice().className).toBe("sr-only");
    expect(notice().textContent).toBe("3 × solana ajouté au panier.");
  });

  it("ajoute sans plafonner quand la Server Action échoue", async () => {
    vi.mocked(cartAvailability).mockRejectedValue(new Error("réseau coupé"));
    renderDetail(solana);
    await hydrated();
    fireEvent.click(screen.getByRole("button", { name: "Augmenter la quantité" }));
    clickAdd();

    await waitFor(() => expect(stored()).toEqual([expect.objectContaining({ qty: 2 })]));
    expect(notice().className).toBe("sr-only");
  });

  it.each([
    ["une réponse qui n'est pas un tableau", undefined],
    ["une réponse vide", []],
    ["une ligne qui vise une autre taille", [{ slug: "solana", sizeId: "s-p", maxQty: 0 }]],
    ["un plafond non entier", [{ slug: "solana", sizeId: "s-g", maxQty: 0.5 }]],
  ])("ajoute sans plafonner sur %s", async (_label, answer) => {
    vi.mocked(cartAvailability).mockResolvedValue(
      answer as unknown as Awaited<ReturnType<typeof cartAvailability>>,
    );
    renderDetail(solana);
    await hydrated();
    await pickGrandBlanc();
    fireEvent.click(screen.getByRole("button", { name: "Augmenter la quantité" }));
    clickAdd();

    await waitFor(() => expect(stored()).toEqual([expect.objectContaining({ qty: 2 })]));
    expect(notice().className).toBe("sr-only");
  });

  it("monte la région live vide et unique avant tout clic", async () => {
    answers(1);
    renderDetail(solana);
    await hydrated();

    expect(screen.getAllByRole("status").length).toBe(1);
    expect(notice().getAttribute("role")).toBe("status");
    expect(notice().textContent).toBe("");
  });

  it("vide la région avant de réafficher le même message", async () => {
    answers(0);
    renderDetail(solana);
    await hydrated();
    await pickGrandBlanc();
    clickAdd();
    await waitFor(() => expect(notice().textContent).toMatch(/plus disponible/));

    const live = notice();
    clickAdd();
    expect(live.textContent).toBe("");
    await waitFor(() => expect(live.textContent).toMatch(/plus disponible/));
    expect(notice()).toBe(live);
  });

  it("rend le focus au bouton que la désactivation lui a pris", async () => {
    const gate = deferred<Awaited<ReturnType<typeof cartAvailability>>>();
    vi.mocked(cartAvailability).mockReturnValue(gate.promise);
    renderDetail(solana);
    await hydrated();
    await pickGrandBlanc();
    const cta = screen.getByRole("button", { name: "Ajouter solana au panier" });
    cta.focus();
    expect(document.activeElement).toBe(cta);

    clickAdd();
    dropFocus();
    expect(document.activeElement).toBe(document.body);

    gate.settle([{ slug: "solana", sizeId: "s-g", maxQty: 5 }]);
    await waitFor(() => expect(document.activeElement).toBe(cta));
  });

  it("ne vole pas le focus parti ailleurs pendant la vérification", async () => {
    const gate = deferred<Awaited<ReturnType<typeof cartAvailability>>>();
    vi.mocked(cartAvailability).mockReturnValue(gate.promise);
    renderDetail(solana);
    await hydrated();
    await pickGrandBlanc();
    clickAdd();
    const elsewhere = screen.getByRole("button", { name: "Augmenter la quantité" });
    elsewhere.focus();

    gate.settle([{ slug: "solana", sizeId: "s-g", maxQty: 5 }]);
    await waitFor(() => expect(stored().length).toBe(1));
    expect(document.activeElement).toBe(elsewhere);
  });

  it("ignore un second clic tant que la vérification est en vol", async () => {
    const gate = deferred<Awaited<ReturnType<typeof cartAvailability>>>();
    vi.mocked(cartAvailability).mockReturnValue(gate.promise);
    renderDetail(solana);
    await hydrated();
    await pickGrandBlanc();
    clickAdd();
    clickAdd();
    gate.settle([{ slug: "solana", sizeId: "s-g", maxQty: 5 }]);

    await waitFor(() => expect(stored()).toEqual([expect.objectContaining({ qty: 1 })]));
    expect(cartAvailability).toHaveBeenCalledTimes(1);
  });
});

describe("ProductDetail — bouton pendant la vérification", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const cta = () => screen.getByRole("button", { name: "Ajouter solana au panier" });

  async function startSlowAdd() {
    const gate = deferred<Awaited<ReturnType<typeof cartAvailability>>>();
    vi.mocked(cartAvailability).mockReturnValue(gate.promise);
    renderDetail(solana);
    await hydrated();
    await pickGrandBlanc();
    clickAdd();
    return gate;
  }

  it("désarme le bouton dès le premier instant, sans rien changer d'autre", async () => {
    const gate = await startSlowAdd();

    expect((cta() as HTMLButtonElement).disabled).toBe(true);
    expect(cta().textContent).toContain("Ajouter au panier");
    expect(cta().getAttribute("aria-busy")).toBeNull();
    expect(cta().className).toContain("is-quiet");

    await act(async () => { await vi.advanceTimersByTimeAsync(BUSY_LABEL_DELAY_MS - 50); });
    expect(cta().textContent).toContain("Ajouter au panier");
    expect(cta().getAttribute("aria-busy")).toBeNull();

    gate.settle([{ slug: "solana", sizeId: "s-g", maxQty: 5 }]);
    await waitFor(() => expect(cta().textContent).toBe("Ajouté ✓"));
    expect(cta().className).not.toContain("is-quiet");
  });

  it("n'affiche jamais « Vérification… » sur une réponse rapide", async () => {
    const gate = await startSlowAdd();
    gate.settle([{ slug: "solana", sizeId: "s-g", maxQty: 5 }]);
    await act(async () => { await vi.advanceTimersByTimeAsync(BUSY_LABEL_DELAY_MS - 50); });

    expect(cta().textContent).toBe("Ajouté ✓");
    expect(cta().getAttribute("aria-busy")).toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(BUSY_LABEL_DELAY_MS * 4); });
    expect(cta().textContent).toBe("Ajouté ✓");
    expect(cta().getAttribute("aria-busy")).toBeNull();
  });

  it("affiche « Vérification… » passé le seuil, puis le retire", async () => {
    const gate = await startSlowAdd();

    await act(async () => { await vi.advanceTimersByTimeAsync(BUSY_LABEL_DELAY_MS); });
    expect(cta().textContent).toBe("Vérification…");
    expect(cta().getAttribute("aria-busy")).toBe("true");
    expect((cta() as HTMLButtonElement).disabled).toBe(true);
    expect(cta().className).not.toContain("is-quiet");

    gate.settle([{ slug: "solana", sizeId: "s-g", maxQty: 5 }]);
    await waitFor(() => expect(cta().textContent).toBe("Ajouté ✓"));
    expect(cta().getAttribute("aria-busy")).toBeNull();
    expect((cta() as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("ProductDetail — plafond à l'ajout, délai dépassé", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ajoute la quantité demandée quand la vérification traîne", async () => {
    const gate = deferred<Awaited<ReturnType<typeof cartAvailability>>>();
    vi.mocked(cartAvailability).mockReturnValue(gate.promise);
    renderDetail(solana);
    await hydrated();
    await pickGrandBlanc();
    fireEvent.click(screen.getByRole("button", { name: "Augmenter la quantité" }));
    clickAdd();

    expect(stored()).toEqual([]);
    await vi.advanceTimersByTimeAsync(ADD_CAP_TIMEOUT_MS);
    await waitFor(() => expect(stored()).toEqual([expect.objectContaining({ qty: 2 })]));
    expect(notice().className).toBe("sr-only");
  });

  it("n'ajoute pas une seconde fois quand la réponse arrive après le délai", async () => {
    const gate = deferred<Awaited<ReturnType<typeof cartAvailability>>>();
    vi.mocked(cartAvailability).mockReturnValue(gate.promise);
    renderDetail(solana);
    await hydrated();
    await pickGrandBlanc();
    fireEvent.click(screen.getByRole("button", { name: "Augmenter la quantité" }));
    clickAdd();
    await vi.advanceTimersByTimeAsync(ADD_CAP_TIMEOUT_MS);
    await waitFor(() => expect(stored()).toEqual([expect.objectContaining({ qty: 2 })]));

    gate.settle([{ slug: "solana", sizeId: "s-g", maxQty: 1 }]);
    await vi.advanceTimersByTimeAsync(50);
    expect(stored()).toEqual([expect.objectContaining({ qty: 2 })]);
    expect(notice().className).toBe("sr-only");
  });
});
