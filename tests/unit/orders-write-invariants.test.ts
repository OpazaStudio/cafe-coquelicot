// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { setOrderStatusIfUnchanged } from "@/lib/orders";

const ROOT = process.cwd();
const ORDERS = path.join("lib", "orders.ts");
const SCHEMA = path.join("lib", "db", "schema.ts");
const E2E_HOOK = path.join("app", "api", "e2e", "orders", "route.ts");

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(relative, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(relative);
  }
  return found;
}

const FILES = ["lib", "app"]
  .flatMap((dir) => sourceFiles(dir))
  .filter((file) => file !== SCHEMA);

function statementAt(source: string, from: number): string {
  let depth = 0;
  for (let i = from; i < source.length; i += 1) {
    const char = source[i];
    if (char === "(" || char === "{" || char === "[") depth += 1;
    else if (char === ")" || char === "}" || char === "]") depth -= 1;
    else if (char === ";" && depth === 0) return source.slice(from, i);
  }
  return source.slice(from);
}

function argumentOf(chain: string, method: string): string | null {
  const found = chain.indexOf(method);
  if (found === -1) return null;
  const open = found + method.length - 1;
  let depth = 0;
  for (let i = open; i < chain.length; i += 1) {
    if (chain[i] === "(") depth += 1;
    else if (chain[i] === ")") {
      depth -= 1;
      if (depth === 0) return chain.slice(open + 1, i);
    }
  }
  return null;
}

function enclosingFunction(source: string, index: number): string {
  const declared = [...source.slice(0, index).matchAll(/function\s+([A-Za-z_$][\w$]*)/g)];
  return declared.at(-1)?.[1] ?? "<module>";
}

type Chain = { file: string; fn: string; source: string; chain: string };

function chainsCalling(call: string): Chain[] {
  const found: Chain[] = [];
  for (const file of FILES) {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    let at = source.indexOf(call);
    while (at !== -1) {
      found.push({
        file,
        fn: enclosingFunction(source, at),
        source,
        chain: statementAt(source, at),
      });
      at = source.indexOf(call, at + call.length);
    }
  }
  return found;
}

function resolvesTo(source: string, argument: string, token: string): boolean {
  if (argument.includes(token)) return true;
  for (const name of new Set(argument.match(/[A-Za-z_$][\w$]*/g) ?? [])) {
    const declared = source.match(new RegExp(`const\\s+${name}\\s*=`));
    if (declared?.index === undefined) continue;
    if (statementAt(source, declared.index).includes(token)) return true;
  }
  return false;
}

function mayWriteStatus(argument: string): boolean {
  if (/\bstatus\s*[:,}]/.test(argument)) return true;
  const trimmed = argument.trim();
  const isPlainLiteral =
    trimmed.startsWith("{") && trimmed.endsWith("}") && !trimmed.includes("...");
  return !isPlainLiteral;
}

const ORDER_UPDATES = chainsCalling(".update(orders)").map((c) => ({ ...c, values: ".set(" }));
const ORDER_WRITES = [
  ...ORDER_UPDATES,
  ...chainsCalling(".insert(orders)").map((c) => ({ ...c, values: ".values(" })),
];

const paymentIntentWriters = ORDER_WRITES.filter((write) =>
  resolvesTo(write.source, argumentOf(write.chain, write.values) ?? "", "stripePaymentIntent"),
);

const statusWriters = ORDER_UPDATES.filter((write) =>
  mayWriteStatus(argumentOf(write.chain, write.values) ?? ""),
);

function label(write: { file: string; fn: string }): string {
  return `${write.file} → ${write.fn}()`;
}

describe("invariant : un seul écrivain de orders.stripe_payment_intent", () => {
  it("trouve au moins une écriture (garde contre un scanner qui ne matche plus)", () => {
    expect(
      ORDER_WRITES.length,
      "Le scanner ne trouve plus aucune écriture sur `orders` dans lib/ et app/. " +
        "Les deux invariants de ce fichier ne vérifient alors plus rien : réparer le scanner " +
        "(repères `.update(orders)` / `.insert(orders)`) avant de toucher au reste.",
    ).toBeGreaterThan(0);
    expect(
      paymentIntentWriters.map(label),
      "Aucune écriture de `stripePaymentIntent` n'est détectée, alors que " +
        "`markOrderPaidBySession` en fait une. La résolution des alias `const` est cassée : " +
        "l'invariant ci-dessous passerait à vide.",
    ).not.toEqual([]);
  });

  it("n'autorise que markOrderPaidBySession à écrire stripePaymentIntent", () => {
    const offenders = paymentIntentWriters
      .filter((write) => write.file !== ORDERS || write.fn !== "markOrderPaidBySession")
      .map(label);
    expect(
      offenders,
      "Une autre fonction écrit `orders.stripe_payment_intent`. Toute la distinction " +
        "entre `replay` (rejeu de webhook anodin) et `paid_on_cancelled` (argent encaissé " +
        "sur une commande annulée, qui doit alerter la boutique) repose sur le fait que " +
        "cette colonne n'est posée que par `markOrderPaidBySession` : un second écrivain " +
        "transforme silencieusement une vraie alerte en rejeu ignoré. " +
        "Passer par `markOrderPaidBySession`, ou revoir `reconcilePaidSession`.",
    ).toEqual([]);
  });

  it("n'offre pas de second écrivain par le paramètre extra de setOrderStatusIfUnchanged", () => {
    type Extra = Parameters<typeof setOrderStatusIfUnchanged>[4];
    // @ts-expect-error stripePaymentIntent doit rester hors du type extra : un appelant qui le poserait dégraderait une alerte paid_on_cancelled en replay
    const refused: Extra = { stripePaymentIntent: "pi_second_ecrivain" };
    expect(refused).toBeTruthy();
  });
});

describe("invariant : toute écriture de orders.status porte un prédicat de statut", () => {
  it("détecte bien les écrivains connus, y compris derrière un alias ou un spread", () => {
    expect(
      statusWriters.map((write) => write.fn),
      "Des écrivains connus de `orders.status` ne sont plus détectés. L'invariant " +
        "ci-dessous ne vérifierait plus que les écritures restantes : réparer " +
        "`mayWriteStatus` avant de continuer.",
    ).toEqual(
      expect.arrayContaining([
        "markOrderPaidBySession",
        "cancelOrderBySession",
        "setOrderStatusIfUnchanged",
      ]),
    );
    expect(
      statusWriters.filter((write) => write.file === E2E_HOOK).map(label),
      "Le hook e2e n'est plus détecté comme écrivain sans prédicat. Son exemption " +
        "ci-dessous ne protège donc plus rien et masquerait une vraie régression.",
    ).not.toEqual([]);
  });

  it("n'écrit jamais orders.status par UPDATE sans prédicat de statut, hors hook e2e", () => {
    const offenders = statusWriters
      .filter((write) => write.file !== E2E_HOOK)
      .filter((write) => !(argumentOf(write.chain, ".where(") ?? "").includes("orders.status"))
      .map(label);
    expect(
      offenders,
      "Une écriture de `orders.status` ne filtre pas sur le statut attendu. Sans ce " +
        "prédicat l'écriture est un check-then-act : elle peut écraser un `paid` que le " +
        "webhook vient de commiter (paiement perdu), et `RETURNING` renvoie toujours une " +
        "ligne, donc plus rien ne distingue une transition réellement appliquée d'un rejeu. " +
        "Ajouter `eq(orders.status, <attendu>)` au `.where()`, ou passer par " +
        "`setOrderStatusIfUnchanged`. Seul `app/api/e2e/orders/route.ts` est exempté " +
        "(route de test fermée par trois gardes d'environnement).",
    ).toEqual([]);
  });
});
