// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseBcc } from "@/lib/email/resend";

describe("parseBcc", () => {
  it("met celine.brahic@outlook.com en copie cachée par défaut", () => {
    expect(parseBcc(undefined)).toEqual(["celine.brahic@outlook.com"]);
  });

  it("accepte une liste séparée par des virgules", () => {
    expect(parseBcc(" a@ex.fr, b@ex.fr ,,")).toEqual(["a@ex.fr", "b@ex.fr"]);
  });

  it("désactive la copie quand la variable est vide", () => {
    expect(parseBcc("")).toEqual([]);
  });
});
