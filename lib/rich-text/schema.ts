import * as z from "zod";

const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

const LinkMark = z.object({
  type: z.literal("link"),
  attrs: z.object({
    href: z
      .string()
      .trim()
      .max(2000)
      .regex(SAFE_HREF, { error: "Lien non autorisé." }),
  }),
});

const MarkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bold") }),
  z.object({ type: z.literal("italic") }),
  LinkMark,
]);

const TextNode = z.object({
  type: z.literal("text"),
  text: z.string().max(5000),
  marks: z.array(MarkSchema).max(3).optional(),
});

const HardBreakNode = z.object({ type: z.literal("hardBreak") });

const InlineNode = z.union([TextNode, HardBreakNode]);

const ParagraphNode = z.object({
  type: z.literal("paragraph"),
  content: z.array(InlineNode).max(200).optional(),
});

const MAX_LIST_DEPTH = 4;

function blockAtDepth(depth: number): z.ZodType<BlockNode> {
  if (depth >= MAX_LIST_DEPTH) return ParagraphNode as z.ZodType<BlockNode>;
  const listItem = z.object({
    type: z.literal("listItem"),
    content: z.array(z.lazy(() => blockAtDepth(depth + 1))).max(50),
  });
  return z.union([
    ParagraphNode,
    z.object({
      type: z.literal("bulletList"),
      content: z.array(listItem).max(50),
    }),
    z.object({
      type: z.literal("orderedList"),
      content: z.array(listItem).max(50),
      attrs: z.object({ start: z.number().int().min(1).max(999) }).optional(),
    }),
  ]) as z.ZodType<BlockNode>;
}

export const RichDocSchema = z.object({
  type: z.literal("doc"),
  content: z.array(blockAtDepth(0)).max(100).optional(),
});

export type RichMark = z.infer<typeof MarkSchema>;
export type RichTextNode = z.infer<typeof TextNode>;
export type RichInlineNode = z.infer<typeof InlineNode>;
export type RichParagraphNode = z.infer<typeof ParagraphNode>;
export type RichListItemNode = { type: "listItem"; content: BlockNode[] };
export type RichListNode = {
  type: "bulletList" | "orderedList";
  content: RichListItemNode[];
  attrs?: { start: number };
};
export type BlockNode = RichParagraphNode | RichListNode;
export type RichDoc = { type: "doc"; content?: BlockNode[] };

export function emptyRichDoc(): RichDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function sanitizeMarks(value: unknown): RichMark[] {
  if (!Array.isArray(value)) return [];
  const out: RichMark[] = [];
  for (const m of value.slice(0, 3)) {
    const parsed = MarkSchema.safeParse(m);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

function sanitizeInline(value: unknown): RichInlineNode[] {
  if (!Array.isArray(value)) return [];
  const out: RichInlineNode[] = [];
  for (const n of value.slice(0, 200)) {
    if (!isRecord(n)) continue;
    if (n.type === "hardBreak") out.push({ type: "hardBreak" });
    else if (n.type === "text" && typeof n.text === "string") {
      const marks = sanitizeMarks(n.marks);
      out.push({ type: "text", text: n.text.slice(0, 5000), ...(marks.length ? { marks } : {}) });
    }
  }
  return out;
}

function sanitizeBlocks(value: unknown, depth: number): BlockNode[] {
  if (!Array.isArray(value)) return [];
  const out: BlockNode[] = [];
  for (const n of value.slice(0, 100)) {
    if (!isRecord(n)) continue;
    if (n.type === "paragraph") {
      out.push({ type: "paragraph", content: sanitizeInline(n.content) });
      continue;
    }
    if ((n.type === "bulletList" || n.type === "orderedList") && depth < MAX_LIST_DEPTH) {
      const items = Array.isArray(n.content) ? n.content.slice(0, 50) : [];
      const content = items.flatMap((item) =>
        isRecord(item) && item.type === "listItem"
          ? [{ type: "listItem" as const, content: sanitizeBlocks(item.content, depth + 1) }]
          : [],
      );
      if (content.length) out.push({ type: n.type, content });
    }
  }
  return out;
}

export function sanitizeRichDoc(value: unknown): RichDoc | null {
  if (!isRecord(value) || value.type !== "doc") return null;
  const content = sanitizeBlocks(value.content, 0);
  return content.length ? { type: "doc", content } : null;
}

export function richDocFromPlainText(text: string): RichDoc {
  const lines = text.split("\n");
  const content: BlockNode[] = lines.map((line) => ({
    type: "paragraph",
    content: line === "" ? [] : [{ type: "text", text: line }],
  }));
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

export function parseRichDoc(value: unknown): RichDoc | null {
  if (value == null) return null;
  const parsed = RichDocSchema.safeParse(value);
  return parsed.success ? (parsed.data as RichDoc) : null;
}

function blockToLines(node: BlockNode): string[] {
  if (node.type === "paragraph") {
    const raw = (node.content ?? [])
      .map((n) => (n.type === "text" ? n.text : "\n"))
      .join("");
    return raw.split("\n");
  }
  return node.content.flatMap((item) => item.content.flatMap(blockToLines));
}

export function richDocToPlainText(doc: RichDoc | null | undefined): string {
  if (!doc?.content) return "";
  return (doc.content as BlockNode[])
    .flatMap(blockToLines)
    .map((line) => line.trim())
    .filter((line, i, all) => line !== "" || (i > 0 && i < all.length - 1))
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

export function isRichDocEmpty(doc: RichDoc | null | undefined): boolean {
  return richDocToPlainText(doc).trim() === "";
}
