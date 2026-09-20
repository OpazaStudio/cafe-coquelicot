import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ContentFields } from "@/app/(admin)/admin/(panel)/contenu/content-fields";
import { f } from "@/lib/content/fields";

const FIELDS = {
  title: f.text({ label: "Titre", hint: "Court." }),
  intro: f.textarea({ label: "Intro", rows: 2 }),
  kind: f.select({ label: "Type", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] }),
  cta: f.group({ label: "Bouton", fields: { label: f.text({ label: "Texte" }), href: f.text({ label: "Lien" }) } }),
  items: f.list({
    label: "Cartes",
    labels: { singular: "carte", plural: "cartes" },
    max: 2,
    fields: { name: f.text({ label: "Nom" }) },
  }),
};

const VALUE = {
  title: "Un",
  intro: "Deux",
  kind: "a",
  cta: { label: "Voir", href: "/x" },
  items: [{ name: "premier" }],
};

describe("ContentFields", () => {
  it("rend un contrôle libellé par champ et remonte les changements", () => {
    const onChange = vi.fn();
    render(<ContentFields fields={FIELDS} value={VALUE} onChange={onChange} idPrefix="t" />);
    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Modifié" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...VALUE, title: "Modifié" });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "b" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...VALUE, kind: "b" });
    fireEvent.change(screen.getByLabelText("Lien"), { target: { value: "/y" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...VALUE, cta: { label: "Voir", href: "/y" } });
    expect(screen.getByText("Court.")).toBeTruthy();
  });

  it("ajoute, déplace et supprime les éléments d'une liste dans les bornes", () => {
    const onChange = vi.fn();
    const { rerender } = render(<ContentFields fields={FIELDS} value={VALUE} onChange={onChange} idPrefix="t" />);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une carte" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...VALUE, items: [{ name: "premier" }, { name: "" }] });
    const two = { ...VALUE, items: [{ name: "premier" }, { name: "second" }] };
    rerender(<ContentFields fields={FIELDS} value={two} onChange={onChange} idPrefix="t" />);
    expect(screen.getByRole("button", { name: "Ajouter une carte" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getAllByRole("button", { name: /Monter/ })[1]);
    expect(onChange).toHaveBeenLastCalledWith({ ...VALUE, items: [{ name: "second" }, { name: "premier" }] });
    fireEvent.click(screen.getAllByRole("button", { name: /Supprimer/ })[0]);
    expect(onChange).toHaveBeenLastCalledWith({ ...VALUE, items: [{ name: "second" }] });
  });

  it("n'offre ni ajout ni suppression sur une liste fixe", () => {
    const fixed = { items: f.list({ label: "Tuiles", labels: { singular: "tuile", plural: "tuiles" }, min: 1, max: 1, fixed: true, fields: { name: f.text({ label: "Nom" }) } }) };
    render(<ContentFields fields={fixed} value={{ items: [{ name: "x" }] }} onChange={() => {}} idPrefix="t" />);
    expect(screen.queryByRole("button", { name: /Ajouter/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Supprimer/ })).toBeNull();
  });
});

describe("ContentFields — aides par élément de liste", () => {
  it("affiche l'aide propre à chaque tuile d'une liste fixe", () => {
    const fields = {
      tiles: f.list({
        label: "Tuiles",
        labels: { singular: "tuile", plural: "tuiles" },
        fixed: true,
        itemHints: ["Cadre paysage 5:4", "Cadre portrait 3:4"],
        fields: { label: f.text({ label: "Mot" }) },
      }),
    };
    render(
      <ContentFields fields={fields} value={{ tiles: [{ label: "" }, { label: "" }] }} onChange={() => {}} idPrefix="g" />,
    );
    expect(screen.getByText("Cadre paysage 5:4")).toBeTruthy();
    expect(screen.getByText("Cadre portrait 3:4")).toBeTruthy();
  });
});
