"use client";

import type { ReactNode } from "react";
import { emptyItem, fieldMax, type Field, type FieldMap, type ImageValue, type ListField } from "@/lib/content/fields";
import { input, rowAction } from "../ui";
import { ImageField } from "./image-field";

type Doc = Record<string, unknown>;

export function ContentFields({
  fields,
  value,
  onChange,
  idPrefix,
}: {
  fields: FieldMap;
  value: Doc;
  onChange: (next: Doc) => void;
  idPrefix: string;
}) {
  const set = (key: string, next: unknown) => onChange({ ...value, [key]: next });
  return (
    <div className="grid gap-4">
      {Object.entries(fields).map(([key, field]) => (
        <FieldControl
          key={key}
          id={`${idPrefix}-${key}`}
          field={field}
          value={value[key]}
          onChange={(next) => set(key, next)}
        />
      ))}
    </div>
  );
}

function FieldControl({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: Field;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  switch (field.type) {
    case "text":
      return (
        <Labelled id={id} label={field.label} hint={field.hint}>
          <input
            id={id}
            type="text"
            value={String(value ?? "")}
            maxLength={fieldMax(field)}
            onChange={(e) => onChange(e.target.value)}
            className={input}
          />
        </Labelled>
      );
    case "textarea":
      return (
        <Labelled
          id={id}
          label={field.label}
          hint={[field.hint, field.paragraphs ? "Une ligne vide sépare deux paragraphes." : undefined].filter(Boolean).join(" ")}
        >
          <textarea
            id={id}
            value={String(value ?? "")}
            rows={field.rows ?? 3}
            maxLength={fieldMax(field)}
            onChange={(e) => onChange(e.target.value)}
            className={input}
          />
        </Labelled>
      );
    case "select":
      return (
        <Labelled id={id} label={field.label} hint={field.hint}>
          <select id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={input}>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Labelled>
      );
    case "image":
      return (
        <ImageField
          id={id}
          label={field.label}
          hint={field.hint}
          value={(value as ImageValue | undefined) ?? { path: null, alt: "" }}
          onChange={onChange}
        />
      );
    case "group":
      return (
        <fieldset className="rounded-lg border border-line-soft p-3">
          <legend className="px-1 text-sm font-medium text-ink">{field.label}</legend>
          {field.hint && <p className="mb-2 text-xs text-muted">{field.hint}</p>}
          <ContentFields fields={field.fields} value={(value as Doc) ?? {}} onChange={onChange} idPrefix={id} />
        </fieldset>
      );
    case "list":
      return <ListControl id={id} field={field} items={Array.isArray(value) ? (value as Doc[]) : []} onChange={onChange} />;
  }
}

function Labelled({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

function itemTitle(fields: FieldMap, item: Doc, index: number, singular: string): string {
  const firstText = Object.entries(fields).find(([, f]) => f.type === "text" || f.type === "textarea");
  const text = firstText ? String(item[firstText[0]] ?? "").trim() : "";
  return text !== "" ? text : `${singular} ${index + 1}`;
}

function ListControl({
  id,
  field,
  items,
  onChange,
}: {
  id: string;
  field: ListField;
  items: Doc[];
  onChange: (next: Doc[]) => void;
}) {
  const canAdd = !field.fixed && (field.max === undefined || items.length < field.max);
  const canRemove = !field.fixed && (field.min === undefined || items.length > field.min);
  const move = (from: number, to: number) => {
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium text-ink">{field.label}</legend>
      {field.hint && <p className="text-xs text-muted">{field.hint}</p>}
      {items.map((item, i) => {
        const title = itemTitle(field.fields, item, i, field.labels.singular);
        return (
          <details key={i} className="rounded-lg border border-line bg-panel">
            <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-ink">
              <span>{title}</span>
              {!field.fixed && (
                <span className="flex gap-1">
                  <button type="button" aria-label={`Monter ${title}`} disabled={i === 0} onClick={(e) => { e.preventDefault(); move(i, i - 1); }} className={`${rowAction} text-ink disabled:opacity-40`}>▲</button>
                  <button type="button" aria-label={`Descendre ${title}`} disabled={i === items.length - 1} onClick={(e) => { e.preventDefault(); move(i, i + 1); }} className={`${rowAction} text-ink disabled:opacity-40`}>▼</button>
                  {canRemove && (
                    <button type="button" aria-label={`Supprimer ${title}`} onClick={(e) => { e.preventDefault(); onChange(items.filter((_, j) => j !== i)); }} className={`${rowAction} text-danger`}>✕</button>
                  )}
                </span>
              )}
            </summary>
            <div className="border-t border-line-soft p-3">
              {field.itemHints?.[i] && <p className="mb-3 text-xs text-muted">{field.itemHints[i]}</p>}
              <ContentFields
                fields={field.fields}
                value={item}
                onChange={(next) => onChange(items.map((it, j) => (j === i ? next : it)))}
                idPrefix={`${id}-${i}`}
              />
            </div>
          </details>
        );
      })}
      {!field.fixed && (
        <button
          type="button"
          disabled={!canAdd}
          onClick={() => onChange([...items, emptyItem(field.fields)])}
          className={`${rowAction} self-start border border-line text-ink disabled:opacity-40`}
        >
          {field.labels.add ?? `Ajouter une ${field.labels.singular}`}
        </button>
      )}
    </fieldset>
  );
}
