import { Fragment, type ReactNode } from "react";
import {
  sanitizeRichDoc,
  type BlockNode,
  type RichDoc,
  type RichInlineNode,
  type RichListNode,
  type RichTextNode,
} from "@/lib/rich-text/schema";
import { Lines } from "./content/text";

function withMarks(node: RichTextNode, key: number): ReactNode {
  let out: ReactNode = node.text;
  for (const mark of [...(node.marks ?? [])].reverse()) {
    if (mark.type === "bold") out = <strong>{out}</strong>;
    else if (mark.type === "italic") out = <em>{out}</em>;
    else if (mark.type === "link") {
      out = (
        <a href={mark.attrs.href} target="_blank" rel="noopener noreferrer">
          {out}
        </a>
      );
    }
  }
  return <Fragment key={key}>{out}</Fragment>;
}

function inline(nodes: RichInlineNode[] | undefined): ReactNode {
  return (nodes ?? []).map((n, i) =>
    n.type === "hardBreak" ? <br key={i} /> : withMarks(n, i),
  );
}

function list(node: RichListNode, key: number): ReactNode {
  const Tag = node.type === "bulletList" ? "ul" : "ol";
  return (
    <Tag key={key} start={node.type === "orderedList" ? node.attrs?.start : undefined}>
      {node.content.map((item, i) => (
        <li key={i}>{item.content.map(block)}</li>
      ))}
    </Tag>
  );
}

function block(node: BlockNode, key: number): ReactNode {
  if (node.type === "paragraph") return <p key={key}>{inline(node.content)}</p>;
  return list(node, key);
}

type Props = {
  doc: RichDoc | unknown | null;
  fallback?: string;
  className?: string;
};

export function RichText({ doc, fallback = "", className }: Props) {
  const parsed = sanitizeRichDoc(doc);
  if (!parsed?.content?.length) {
    if (!fallback) return null;
    return (
      <p className={className}>
        <Lines text={fallback} />
      </p>
    );
  }
  return (
    <div className={className}>{(parsed.content as BlockNode[]).map(block)}</div>
  );
}
