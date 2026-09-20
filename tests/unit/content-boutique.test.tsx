import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BoutiqueShop } from "@/components/boutique";
import { DEFAULT_BOUTIQUE } from "@/lib/content/pages/boutique";

describe("BoutiqueShop", () => {
  it("rend le suffixe de comptage et le message vide depuis le contenu", () => {
    render(<BoutiqueShop catalogue={[]} copy={{ countSuffix: "du jour", empty: "Rien ici.\nRevenez vite." }} />);
    expect(screen.getByText(/0 composition · du jour/)).toBeTruthy();
    expect(screen.getByText(/Revenez vite/).closest("p")?.querySelector("br")).not.toBeNull();
  });
  it("les défauts reprennent le texte actuel", () => {
    render(<BoutiqueShop catalogue={[]} copy={DEFAULT_BOUTIQUE.catalogue} />);
    expect(screen.getByText(/cueillies ou réceptionnées le matin même/)).toBeTruthy();
  });
});
