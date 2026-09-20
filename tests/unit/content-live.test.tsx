import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { CONTENT_MESSAGE, READY_MESSAGE, useLiveContent } from "@/lib/content/live";
import { PAGES } from "@/lib/content/registry";

function Probe({ initial }: { initial?: (typeof PAGES)["checkout"]["defaults"] }) {
  const c = useLiveContent("checkout", initial ?? PAGES.checkout.defaults);
  return <h1>{c.hero.title}</h1>;
}

function post(data: unknown, origin = window.location.origin) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data, origin }));
  });
}

const draft = { hero: { title: "régler", script: "" } };

describe("useLiveContent", () => {
  let originalParent: PropertyDescriptor | undefined;
  let postMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalParent = Object.getOwnPropertyDescriptor(window, "parent");
    postMessage = vi.fn();
    Object.defineProperty(window, "parent", { configurable: true, value: { postMessage } });
  });

  afterEach(() => {
    if (originalParent) Object.defineProperty(window, "parent", originalParent);
    vi.restoreAllMocks();
  });

  it("rend la valeur initiale", () => {
    render(<Probe />);
    expect(screen.getByRole("heading").textContent).toBe("commander");
  });

  it("applique un brouillon valide de la bonne page", async () => {
    render(<Probe />);
    post({ type: CONTENT_MESSAGE, page: "checkout", data: draft });
    await screen.findByText("régler");
  });

  it("ignore une autre origine, une autre page, un autre type et des données malformées", async () => {
    render(<Probe />);
    post({ type: CONTENT_MESSAGE, page: "checkout", data: draft }, "https://evil.example");
    post({ type: CONTENT_MESSAGE, page: "panier", data: draft });
    post({ type: "autre", page: "checkout", data: draft });
    post({ type: CONTENT_MESSAGE, page: "checkout", data: "foo" });
    post({ type: CONTENT_MESSAGE, page: "checkout", data: {} });
    await waitFor(() => expect(screen.getByRole("heading").textContent).toBe("commander"));
  });

  it("signale sa présence au parent quand il est embarqué", () => {
    render(<Probe />);
    expect(postMessage).toHaveBeenCalledWith({ type: READY_MESSAGE, page: "checkout" }, window.location.origin);
  });

  it("hors iframe, un message valide est ignoré", async () => {
    if (originalParent) Object.defineProperty(window, "parent", originalParent);
    render(<Probe />);
    expect(postMessage).not.toHaveBeenCalled();
    post({ type: CONTENT_MESSAGE, page: "checkout", data: draft });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByRole("heading").textContent).toBe("commander");
  });

  it("suit un nouvel initial quand la référence change", () => {
    const { rerender } = render(<Probe initial={PAGES.checkout.defaults} />);
    expect(screen.getByRole("heading").textContent).toBe("commander");
    const next = { ...PAGES.checkout.defaults, hero: { ...PAGES.checkout.defaults.hero, title: "autre" } };
    rerender(<Probe initial={next} />);
    expect(screen.getByRole("heading").textContent).toBe("autre");
  });
});
