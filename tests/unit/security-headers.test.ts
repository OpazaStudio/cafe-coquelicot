import { describe, expect, it } from "vitest";
import { securityHeaders } from "@/lib/security-headers";

function asMap(isProduction: boolean): Map<string, string> {
  return new Map(securityHeaders(isProduction).map((h) => [h.key, h.value]));
}

describe("securityHeaders", () => {
  it("interdit la mise en iframe (anti-clickjacking du back-office)", () => {
    const h = asMap(true);
    expect(h.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(h.get("X-Frame-Options")).toBe("DENY");
  });

  it("pose nosniff et une Referrer-Policy stricte", () => {
    const h = asMap(true);
    expect(h.get("X-Content-Type-Options")).toBe("nosniff");
    expect(h.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("envoie HSTS en production", () => {
    const value = asMap(true).get("Strict-Transport-Security");
    expect(value).toContain("max-age=31536000");
    expect(value).toContain("includeSubDomains");
  });

  it("n'envoie pas HSTS hors production (dev en http)", () => {
    expect(asMap(false).has("Strict-Transport-Security")).toBe(false);
  });

  // Le widget Mondial Relay propose « autour de moi » : la géolocalisation
  // doit rester disponible, contrairement à la caméra et au micro.
  it("neutralise caméra et micro sans toucher à la géolocalisation", () => {
    const value = asMap(true).get("Permissions-Policy")!;
    expect(value).toContain("camera=()");
    expect(value).toContain("microphone=()");
    expect(value).not.toContain("geolocation");
  });
});
