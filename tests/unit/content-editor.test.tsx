import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ContentEditor } from "@/app/(admin)/admin/(panel)/contenu/content-editor";
import { CONTENT_MESSAGE } from "@/lib/content/live";
import { PAGES } from "@/lib/content/registry";

describe("ContentEditor", () => {
  it("le statut d'enregistrement est toujours présent, vide puis rempli après un succès sans modification depuis", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true });
    render(<ContentEditor page="checkout" initial={PAGES.checkout.defaults} action={action} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Contenu enregistré."));
  });

  it("redevient non modifié quand le brouillon revient à la valeur enregistrée (dirty par comparaison de contenu)", () => {
    const action = vi.fn().mockResolvedValue({ ok: true });
    render(<ContentEditor page="checkout" initial={PAGES.checkout.defaults} action={action} />);
    const titre = screen.getByLabelText("Titre");
    fireEvent.change(titre, { target: { value: "régler" } });
    expect(screen.getByText("Modifications non enregistrées")).toBeTruthy();
    fireEvent.change(titre, { target: { value: PAGES.checkout.defaults.hero.title } });
    expect(screen.queryByText("Modifications non enregistrées")).toBeNull();
  });

  it("envoie le brouillon à l'iframe à chaque modification", () => {
    const action = vi.fn().mockResolvedValue({ ok: true });
    render(<ContentEditor page="checkout" initial={PAGES.checkout.defaults} action={action} />);
    const frame = screen.getByTitle("Aperçu de la page") as HTMLIFrameElement;
    const postMessage = vi.fn();
    Object.defineProperty(frame, "contentWindow", { value: { postMessage }, configurable: true });
    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "régler" } });
    expect(postMessage).toHaveBeenLastCalledWith(
      { type: CONTENT_MESSAGE, page: "checkout", data: { ...PAGES.checkout.defaults, hero: { ...PAGES.checkout.defaults.hero, title: "régler" } } },
      window.location.origin,
    );
    expect(screen.getByText("Modifications non enregistrées")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Enregistrer" }).closest("form")?.querySelector('input[name="data"]') as HTMLInputElement).value).toContain("régler");
  });
});
