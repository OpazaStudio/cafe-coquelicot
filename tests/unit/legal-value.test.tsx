import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LegalValue } from "@/components/legal/legal-value";

describe("LegalValue", () => {
  it("affiche la valeur telle quelle quand elle est renseignée", () => {
    render(<LegalValue value="123 456 789 00012" label="SIRET" />);
    expect(screen.getByText("123 456 789 00012")).toBeTruthy();
    expect(screen.queryByText(/à compléter/i)).toBeNull();
  });

  it("affiche un marqueur « à compléter » nommant le champ quand elle est vide", () => {
    render(<LegalValue value="" label="SIRET" />);
    const mark = screen.getByText(/à compléter/i);
    expect(mark.tagName).toBe("MARK");
    expect(mark.textContent).toContain("SIRET");
  });

  it("une valeur composée d'espaces compte comme vide", () => {
    render(<LegalValue value="   " label="Capital" />);
    expect(screen.getByText(/à compléter/i)).toBeTruthy();
  });
});
