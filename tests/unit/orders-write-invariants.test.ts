// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { setOrderStatusIfUnchanged } from "@/lib/orders";

const ROOT = process.cwd();
const ORDERS = path.join("lib", "orders.ts");
const SCHEMA = path.join("lib", "db", "schema.ts");
const ABANDON = path.join("lib", "checkout", "abandon.ts");
const E2E_HOOK = path.join("app", "api", "e2e", "orders", "route.ts");
const RESERVE = path.join("lib", "stock", "reserve.ts");
const RELEASE = path.join("lib", "stock", "release.ts");
const ADMIN_PRODUCTS = path.join(
  "app",
  "(admin)",
  "admin",
  "(panel)",
  "produits",
  "actions.ts",
);

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

function splitArguments(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i += 1) {
    const char = inner[i];
    if (char === "(" || char === "{" || char === "[") depth += 1;
    else if (char === ")" || char === "}" || char === "]") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(inner.slice(start).trim());
  return parts;
}

const DECLARATIONS = /function\s+([A-Za-z_$][\w$]*)/g;

function enclosingFunction(source: string, index: number): string {
  const declared = [...source.slice(0, index).matchAll(DECLARATIONS)];
  return declared.at(-1)?.[1] ?? "<module>";
}

function enclosingBody(source: string, index: number): string {
  const declared = [...source.matchAll(DECLARATIONS)];
  const own = declared.filter((match) => match.index < index).at(-1);
  const from = own === undefined ? 0 : own.index + own[0].length;
  const next = declared.find((match) => match.index >= index);
  return source.slice(from, next?.index ?? source.length);
}

type Chain = { file: string; fn: string; source: string; chain: string; at: number };

function chainsIn(file: string, source: string, call: string): Chain[] {
  const found: Chain[] = [];
  let at = source.indexOf(call);
  while (at !== -1) {
    found.push({
      file,
      fn: enclosingFunction(source, at),
      source,
      chain: statementAt(source, at),
      at,
    });
    at = source.indexOf(call, at + call.length);
  }
  return found;
}

function chainsCalling(call: string): Chain[] {
  return FILES.flatMap((file) =>
    chainsIn(file, readFileSync(path.join(ROOT, file), "utf8"), call),
  );
}

function nearestDeclaration(
  source: string,
  name: string,
  before: number,
): number | null {
  const declared = [...source.matchAll(new RegExp(`const\\s+${name}\\s*=`, "g"))];
  const nearest = declared.filter((match) => match.index < before).at(-1);
  return nearest?.index ?? null;
}

function aliasedStatements(source: string, argument: string, at: number): string[] {
  const statements: string[] = [];
  for (const name of new Set(argument.match(/[A-Za-z_$][\w$]*/g) ?? [])) {
    const declared = nearestDeclaration(source, name, at);
    if (declared !== null) statements.push(statementAt(source, declared));
  }
  return statements;
}

function resolvesTo(
  source: string,
  argument: string,
  token: string,
  at: number,
): boolean {
  if (argument.includes(token)) return true;
  return aliasedStatements(source, argument, at).some((statement) =>
    statement.includes(token),
  );
}

function mayWriteStatus(argument: string): boolean {
  if (/\bstatus\s*[:,}]/.test(argument)) return true;
  const trimmed = argument.trim();
  const isPlainLiteral =
    trimmed.startsWith("{") && trimmed.endsWith("}") && !trimmed.includes("...");
  return !isPlainLiteral;
}

function quotedValue(expression: string): string | null {
  const quoted = /^(["'`])([^"'`]*)\1/.exec(expression.trim());
  return quoted ? quoted[2] : null;
}

function writtenStatus(source: string, argument: string, at: number): string | null {
  const text = [argument, ...aliasedStatements(source, argument, at)].join("\n");
  const keyed = /\bstatus\s*:\s*([^,}]+)/.exec(text);
  if (keyed) return quotedValue(keyed[1]);
  return null;
}

const ORDER_UPDATES = chainsCalling(".update(orders)").map((c) => ({ ...c, values: ".set(" }));
const ORDER_WRITES = [
  ...ORDER_UPDATES,
  ...chainsCalling(".insert(orders)").map((c) => ({ ...c, values: ".values(" })),
];

const paymentIntentWriters = ORDER_WRITES.filter((write) =>
  resolvesTo(
    write.source,
    argumentOf(write.chain, write.values) ?? "",
    "stripePaymentIntent",
    write.at,
  ),
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
  });

  it("n'écrit jamais orders.status par UPDATE sans prédicat de statut", () => {
    const offenders = statusWriters
      .filter((write) => !(argumentOf(write.chain, ".where(") ?? "").includes("orders.status"))
      .map(label);
    expect(
      offenders,
      "Une écriture de `orders.status` ne filtre pas sur le statut attendu. Sans ce " +
        "prédicat l'écriture est un check-then-act : elle peut écraser un `paid` que le " +
        "webhook vient de commiter (paiement perdu), et `RETURNING` renvoie toujours une " +
        "ligne, donc plus rien ne distingue une transition réellement appliquée d'un rejeu. " +
        "Ajouter `eq(orders.status, <attendu>)` au `.where()`, ou passer par " +
        "`setOrderStatusIfUnchanged`.",
    ).toEqual([]);
  });
});

const STOCK_UPDATES = [
  ...chainsCalling(".update(productSizes)"),
  ...chainsCalling(".update(products)"),
];

const stockQtyWriters = STOCK_UPDATES.filter((write) =>
  resolvesTo(write.source, argumentOf(write.chain, ".set(") ?? "", "stockQty", write.at),
);

const STOCK_QTY_WRITERS = [
  { file: RESERVE, fn: "reserveStock" },
  { file: RELEASE, fn: "releaseOrderStock" },
];

describe("invariant : seuls les écrivains déclarés touchent products.stock_qty", () => {
  it("détecte les écrivains connus et atteint les écritures aliasées", () => {
    expect(
      stockQtyWriters.map(label),
      "Des écrivains connus de `stock_qty` ne sont plus détectés. L'invariant " +
        "ci-dessous passerait à vide : réparer le scanner (repères " +
        "`.update(productSizes)` / `.update(products)` et la résolution des alias) " +
        "avant de toucher au reste.",
    ).toEqual(expect.arrayContaining(STOCK_QTY_WRITERS.map(label)));
    expect(
      STOCK_UPDATES.map(label),
      "Le scanner n'atteint plus les écritures de produits du back-office. Un delta " +
        "de stock posé depuis le formulaire passerait donc inaperçu.",
    ).toEqual(
      expect.arrayContaining([
        `${ADMIN_PRODUCTS} → syncChildren()`,
        `${ADMIN_PRODUCTS} → updateProduct()`,
        `${ADMIN_PRODUCTS} → setProductActive()`,
      ]),
    );
    expect(
      STOCK_UPDATES.filter((write) => write.fn === "syncChildren").map((write) =>
        resolvesTo(
          write.source,
          argumentOf(write.chain, ".set(") ?? "",
          "priceCents",
          write.at,
        ),
      ),
      "L'écriture aliasée de `syncChildren` (`.set(values)`) n'est plus résolue : le " +
        "scanner ne voit que les objets littéraux, un `stockQty` posé via un alias " +
        "lui échapperait.",
    ).toContain(true);
  });

  it("résout l'alias sur la déclaration la plus proche avant l'appel", () => {
    const source = [
      "function alpha() {",
      "  const values = { stockQty: 3 };",
      "  tx.update(productSizes).set(values);",
      "}",
      "function beta() {",
      '  const values = { label: "x" };',
      "  tx.update(productSizes).set(values);",
      "}",
    ].join("\n");
    expect(
      chainsIn("synthetique.ts", source, ".update(productSizes)").map((write) => [
        write.fn,
        resolvesTo(
          write.source,
          argumentOf(write.chain, ".set(") ?? "",
          "stockQty",
          write.at,
        ),
      ]),
      "La résolution d'alias ne prend pas la déclaration la plus proche AVANT " +
        "l'appel. Le fichier produits du back-office déclare trois `const values` " +
        "successifs : résoudre sur la première rattacherait un `stockQty` au mauvais " +
        "écrivain, et en masquerait un vrai.",
    ).toEqual([
      ["alpha", true],
      ["beta", false],
    ]);
  });

  it("n'autorise que les écrivains de stock déclarés à décrémenter ou créditer stockQty", () => {
    const offenders = stockQtyWriters
      .filter(
        (write) =>
          !STOCK_QTY_WRITERS.some(
            (allowed) => allowed.file === write.file && allowed.fn === write.fn,
          ),
      )
      .map(label);
    expect(
      offenders,
      "Une fonction hors liste blanche écrit `stock_qty`. Le stock n'est juste que si " +
        "toutes ses écritures sont ordonnées par `compareStockKeys` (sinon deux " +
        "commandes concurrentes se bloquent mutuellement) et gardées contre le passage " +
        "sous zéro : `reserveStock` et `releaseOrderStock` le font, une écriture " +
        "directe non. Passer par ces fonctions, ou inscrire le nouvel écrivain dans " +
        "`STOCK_QTY_WRITERS` après lui avoir donné les mêmes garanties.",
    ).toEqual([]);
  });
});

const CAS = "setOrderStatusIfUnchanged(";
const CAS_PRIMITIVE = { file: ORDERS, fn: "setOrderStatusIfUnchanged" };
const RELEASING_CALLS = ["releaseOrderStock(", "updateOrderStatus("];

function cancels(written: string | null): boolean {
  return written === null || written === "cancelled";
}

const cancellingWrites = [
  ...statusWriters.filter((write) =>
    cancels(
      writtenStatus(write.source, argumentOf(write.chain, write.values) ?? "", write.at),
    ),
  ),
  ...chainsCalling(CAS)
    .filter((call) => !/function\s+$/.test(call.source.slice(0, call.at)))
    .filter((call) =>
      cancels(quotedValue(splitArguments(argumentOf(call.chain, CAS) ?? "")[3] ?? "")),
    ),
];


describe("invariant : toute annulation libère le stock réservé", () => {
  it("détecte les chemins d'annulation connus", () => {
    expect(
      cancellingWrites.map(label),
      "Des chemins d'annulation connus ne sont plus détectés. L'invariant ci-dessous " +
        "passerait à vide : réparer le scanner (statut écrit par `.update(orders)`, " +
        "statut passé à `setOrderStatusIfUnchanged`) avant de toucher au reste.",
    ).toEqual(
      expect.arrayContaining([
        `${ORDERS} → cancelOrderBySession()`,
        `${ABANDON} → abandonPendingOrder()`,
        `${ORDERS} → updateOrderStatus()`,
        `${E2E_HOOK} → POST()`,
      ]),
    );
    expect(
      cancellingWrites
        .filter(
          (write) =>
            write.file === CAS_PRIMITIVE.file && write.fn === CAS_PRIMITIVE.fn,
        )
        .map(label),
      "`setOrderStatusIfUnchanged` n'est plus détecté comme écrivain de statut non " +
        "littéral. Son exemption ci-dessous ne protège donc plus rien et masquerait " +
        "une vraie régression.",
    ).not.toEqual([]);
  });

  it("libère le stock dans toute fonction qui annule une commande", () => {
    const offenders = cancellingWrites
      .filter(
        (write) =>
          !(write.file === CAS_PRIMITIVE.file && write.fn === CAS_PRIMITIVE.fn),
      )
      .filter((write) => {
        const body = enclosingBody(write.source, write.at);
        return !RELEASING_CALLS.some((call) => body.includes(call));
      })
      .map(label);
    expect(
      offenders,
      "Une fonction fait passer une commande en `cancelled` sans libérer le stock " +
        "qu'elle avait réservé. La commande `pending` EST la réservation : annuler sans " +
        "créditer `stock_qty` retire définitivement les unités du catalogue, et la " +
        "boutique affiche « épuisé » sur un produit qu'elle a toujours. Appeler " +
        "`releaseOrderStock(tx, orderId)` dans la même transaction que le passage en " +
        "`cancelled`, ou passer par `updateOrderStatus` qui le fait. " +
        "Seul `setOrderStatusIfUnchanged` est exempté : c'est la primitive de " +
        "compare-and-set, elle ne connaît pas le statut visé, et ses appelants qui " +
        "annulent sont contrôlés par ce même invariant.",
    ).toEqual([]);
  });
});
