"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { emptyRichDoc, type RichDoc } from "@/lib/rich-text/schema";

const EXTENSIONS = [
  StarterKit.configure({
    heading: false,
    blockquote: false,
    codeBlock: false,
    code: false,
    strike: false,
    underline: false,
    horizontalRule: false,
    link: {
      openOnClick: false,
      protocols: ["http", "https", "mailto"],
      HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
    },
  }),
];

const btn =
  "rounded-md border border-line px-2 py-1 text-xs font-medium text-ink transition hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none";
const btnOn = "border-wine bg-wine/10 text-wine";

function ToolButton({
  editor,
  label,
  title,
  active,
  onClick,
}: {
  editor: Editor;
  label: string;
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={!editor.isEditable}
      className={`${btn} ${active ? btnOn : ""}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function RichEditor({
  value,
  onChange,
}: {
  value: RichDoc | null;
  onChange: (doc: RichDoc) => void;
}) {
  const editor = useEditor({
    extensions: EXTENSIONS,
    content: value ?? emptyRichDoc(),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "min-h-32 outline-none",
        "aria-label": "Description du produit",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as RichDoc),
  });

  if (!editor) {
    return <div className="h-40 rounded-lg border border-stone-300 bg-panel" />;
  }

  function promptLink(ed: Editor) {
    const current = (ed.getAttributes("link").href as string | undefined) ?? "";
    const url = window.prompt("Adresse du lien (https://… ou mailto:…)", current);
    if (url === null) return;
    const chain = ed.chain().focus().extendMarkRange("link");
    if (url.trim() === "") {
      chain.unsetLink().run();
      return;
    }
    if (!/^(https?:\/\/|mailto:)/i.test(url.trim())) {
      window.alert("Lien refusé — commencez par https://, http:// ou mailto:.");
      return;
    }
    chain.setLink({ href: url.trim() }).run();
  }

  return (
    <div className="rounded-lg border border-stone-300 focus-within:border-wine focus-within:ring-2 focus-within:ring-wine/25">
      <div className="flex flex-wrap gap-1.5 border-b border-line p-2">
        <ToolButton
          editor={editor}
          label="G"
          title="Gras"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolButton
          editor={editor}
          label="I"
          title="Italique"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolButton
          editor={editor}
          label="• Liste"
          title="Liste à puces"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolButton
          editor={editor}
          label="1. Liste"
          title="Liste numérotée"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolButton
          editor={editor}
          label="Lien"
          title="Insérer un lien"
          active={editor.isActive("link")}
          onClick={() => promptLink(editor)}
        />
      </div>
      <EditorContent editor={editor} className="admin-rich-text px-3 py-2" />
    </div>
  );
}
