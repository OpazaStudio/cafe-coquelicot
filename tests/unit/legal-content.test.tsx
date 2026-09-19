import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings";
import { MentionsLegalesContent } from "@/components/legal/mentions-legales";
import { CgvContent } from "@/components/legal/cgv";
import { LivraisonRetoursContent } from "@/components/legal/livraison-retours";
import { ConfidentialiteContent } from "@/components/legal/confidentialite";

const filled: Settings = {
  ...DEFAULT_SETTINGS,
  legal_form: "Entreprise individuelle",
  siret: "123 456 789 00012",
  publication_director: "Céline B.",
  contact_phone: "+33 5 46 00 00 00",
  mediator_name: "CM2C",
  mediator_website: "https://www.cm2c.net",
  mediator_address: "14 rue Saint-Jean, 75017 Paris",
  preparation_delay: "24 à 48 h ouvrées",
  shipping_delay: "2 à 4 jours ouvrés",
  shipping_delay_colissimo: "2 à 3 jours ouvrés",
  shipping_fee_mondial_relay: "4,90",
  shipping_fee_colissimo: "9,50",
};

describe("Mentions légales", () => {
  it("signale les champs manquants avec les défauts", () => {
    render(<MentionsLegalesContent settings={DEFAULT_SETTINGS} />);
    const todos = screen.getAllByText(/à compléter/i);
    expect(todos.length).toBeGreaterThan(0);
    expect(todos.some((m) => m.textContent?.includes("SIRET"))).toBe(true);
    expect(screen.getByText(/Vercel Inc\./)).toBeTruthy();
  });

  it("affiche les valeurs renseignées", () => {
    render(<MentionsLegalesContent settings={filled} />);
    expect(screen.getByText("123 456 789 00012")).toBeTruthy();
    expect(screen.getByText("Céline B.")).toBeTruthy();
    expect(screen.queryByText(/à compléter : SIRET/i)).toBeNull();
  });
});

describe("CGV", () => {
  it("mentionne l'exception au droit de rétractation pour les fleurs fraîches et le médiateur", () => {
    render(<CgvContent settings={filled} />);
    expect(screen.getByText(/L\.\s?221-28/)).toBeTruthy();
    expect(screen.getAllByText(/périssables/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /cm2c\.net/i })).toBeTruthy();
    expect(screen.getByText(/24 à 48 h ouvrées/)).toBeTruthy();
  });

  it("le lien médiateur est absent tant que l'URL n'est pas renseignée", () => {
    render(<CgvContent settings={DEFAULT_SETTINGS} />);
    expect(screen.queryByRole("link", { name: /http/ })).toBeNull();
  });

  it("liste les deux frais de livraison depuis les paramètres", () => {
    render(<CgvContent settings={filled} />);
    expect(screen.getByText(/point relais Mondial Relay 4,90€/)).toBeTruthy();
    expect(screen.getByText(/domicile par Colissimo 9,50€/)).toBeTruthy();
  });
});

describe("Livraison & retours", () => {
  it("décrit Mondial Relay et Colissimo avec leurs délais et frais", () => {
    render(<LivraisonRetoursContent settings={filled} />);
    expect(screen.getAllByText(/Mondial Relay/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Colissimo/).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 à 4 jours ouvrés/)).toBeTruthy();
    expect(screen.getByText(/2 à 3 jours ouvrés/)).toBeTruthy();
    expect(screen.getByText(/4,90€/)).toBeTruthy();
    expect(screen.getByText(/9,50€/)).toBeTruthy();
  });

  it("signale le délai Colissimo à compléter quand il est vide", () => {
    render(<LivraisonRetoursContent settings={DEFAULT_SETTINGS} />);
    expect(screen.getByText(/à compléter : délai d'acheminement Colissimo/)).toBeTruthy();
  });
});

describe("Confidentialité", () => {
  it("cite les sous-traitants réels et les droits RGPD", () => {
    render(<ConfidentialiteContent settings={filled} />);
    for (const name of ["Stripe", "Mondial Relay", "La Poste", "Resend", "Google Analytics", "Supabase", "Vercel"]) {
      expect(screen.getAllByText(new RegExp(name)).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/CNIL/)).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /bonjour@coquelicot-lr\.fr/ }).length).toBeGreaterThan(0);
  });
});
