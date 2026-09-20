import * as z from "zod";
import { IMAGE_PATH_RE } from "@/lib/product-image";

export const LINK_HREF_RE = /^(\/|#|https?:\/\/)/;
export const URL_RE = /^https?:\/\/\S+$/i;

type Base = { label: string; hint?: string };

export type TextField = Base & {
  type: "text";
  max?: number;
  required?: boolean;
  href?: boolean;
  url?: boolean;
};
export type TextareaField = Base & {
  type: "textarea";
  max?: number;
  rows?: number;
  required?: boolean;
  paragraphs?: boolean;
};
export type ImageField = Base & { type: "image" };
export type SelectField = Base & {
  type: "select";
  options: readonly { value: string; label: string }[];
};
export type ListField<I extends FieldMap = FieldMap> = Base & {
  type: "list";
  fields: I;
  min?: number;
  max?: number;
  fixed?: boolean;
  labels: { singular: string; plural: string; add?: string };
  itemHints?: readonly string[];
};
export type GroupField<G extends FieldMap = FieldMap> = Base & {
  type: "group";
  fields: G;
};
export type Field =
  | TextField
  | TextareaField
  | ImageField
  | SelectField
  | ListField
  | GroupField;
export type FieldMap = { [key: string]: Field };

export type ImageValue = { path: string | null; alt: string };
export type LinkValue = { label: string; href: string };

export type ValueOf<F> = F extends ListField<infer I>
  ? ValuesOf<I>[]
  : F extends GroupField<infer G>
    ? ValuesOf<G>
    : F extends ImageField
      ? ImageValue
      : string;
export type ValuesOf<M extends FieldMap> = { [K in keyof M]: ValueOf<M[K]> };

export type Section<F extends FieldMap = FieldMap> = {
  title: string;
  hint?: string;
  fields: F;
};
export type SectionMap = { [key: string]: Section };
export type PageDef<S extends SectionMap = SectionMap> = {
  label: string;
  previewPath: string;
  revalidate: string[];
  sections: S;
};
export type ContentOf<D extends PageDef> = {
  [K in keyof D["sections"]]: ValuesOf<D["sections"][K]["fields"]>;
};

export const f = {
  text: (o: Omit<TextField, "type">): TextField => ({ type: "text", ...o }),
  textarea: (o: Omit<TextareaField, "type">): TextareaField => ({ type: "textarea", ...o }),
  image: (o: Omit<ImageField, "type">): ImageField => ({ type: "image", ...o }),
  select: (o: Omit<SelectField, "type">): SelectField => ({ type: "select", ...o }),
  list: <I extends FieldMap>(o: Omit<ListField<I>, "type">): ListField<I> => ({ type: "list", ...o }),
  group: <G extends FieldMap>(o: Omit<GroupField<G>, "type">): GroupField<G> => ({ type: "group", ...o }),
};

export function definePage<S extends SectionMap>(def: PageDef<S>): PageDef<S> {
  return def;
}

const MAX_TEXT = 200;
const MAX_TEXTAREA = 2000;

export function fieldMax(field: TextField | TextareaField): number {
  return field.max ?? (field.type === "textarea" ? MAX_TEXTAREA : MAX_TEXT);
}

function selectValues(field: SelectField): [string, ...string[]] {
  return field.options.map((o) => o.value) as [string, ...string[]];
}

function leafShape(field: Field): z.ZodType {
  switch (field.type) {
    case "text":
      if (field.href) return z.string().refine((v) => LINK_HREF_RE.test(v)).catch("/");
      if (field.url) return z.string().refine((v) => v === "" || URL_RE.test(v)).catch("");
      return z.string().catch("");
    case "textarea":
      return z.string().catch("");
    case "select":
      return z.enum(selectValues(field)).catch(() => field.options[0].value);
    case "image":
      return z
        .object({
          path: z.string().regex(IMAGE_PATH_RE).nullable().catch(null),
          alt: z.string().catch(""),
        })
        .catch(() => ({ path: null, alt: "" }));
    case "list":
      return z.array(objectShape(field.fields)).catch([]);
    case "group":
      return objectShape(field.fields).catch(() => emptyItem(field.fields));
  }
}

function objectShape(fields: FieldMap): z.ZodObject<Record<string, z.ZodType>> {
  return z.object(
    Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, leafShape(field)])),
  );
}

function textStrict(field: TextField | TextareaField): z.ZodType {
  const max = fieldMax(field);
  const base = z.string().trim().max(max, { error: `${field.label} : ${max} caractères maximum.` });
  const sized = field.required
    ? base.min(1, { error: `${field.label} : champ obligatoire.` })
    : base;
  if (field.type === "text" && field.href) {
    return sized.refine((v) => LINK_HREF_RE.test(v), {
      error: `${field.label} : le lien doit commencer par /, # ou http(s)://.`,
    });
  }
  if (field.type === "text" && field.url) {
    return sized.refine((v) => v === "" || URL_RE.test(v), {
      error: `${field.label} : l'adresse doit commencer par http:// ou https://.`,
    });
  }
  return sized;
}

function leafStrict(field: Field): z.ZodType {
  switch (field.type) {
    case "text":
    case "textarea":
      return textStrict(field);
    case "select":
      return z.enum(selectValues(field), { error: `${field.label} : valeur inconnue.` });
    case "image":
      return z.object({
        path: z
          .string()
          .regex(IMAGE_PATH_RE, { error: `${field.label} : chemin d'image invalide.` })
          .nullable(),
        alt: z.string().trim().max(MAX_TEXT, { error: `${field.label} : description de ${MAX_TEXT} caractères maximum.` }),
      });
    case "list": {
      const items = z.array(objectStrict(field.fields));
      const withMin =
        field.min !== undefined
          ? items.min(field.min, { error: `${field.label} : au moins ${field.min} ${field.min > 1 ? field.labels.plural : field.labels.singular}.` })
          : items;
      return field.max !== undefined
        ? withMin.max(field.max, { error: `${field.label} : ${field.max} ${field.labels.plural} maximum.` })
        : withMin;
    }
    case "group":
      return objectStrict(field.fields);
  }
}

function objectStrict(fields: FieldMap): z.ZodObject<Record<string, z.ZodType>> {
  return z.object(
    Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, leafStrict(field)])),
  );
}

export function pageShape<D extends PageDef>(def: D): z.ZodType<ContentOf<D>> {
  return z.object(
    Object.fromEntries(
      Object.entries(def.sections).map(([key, section]) => [key, objectShape(section.fields)]),
    ),
  ) as unknown as z.ZodType<ContentOf<D>>;
}

export function pageStrict<D extends PageDef>(def: D): z.ZodType<ContentOf<D>> {
  return z.object(
    Object.fromEntries(
      Object.entries(def.sections).map(([key, section]) => [key, objectStrict(section.fields)]),
    ),
  ) as unknown as z.ZodType<ContentOf<D>>;
}

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Saisie invalide.";
}

export function mergeDefaults<T>(defaults: T, data: unknown): T {
  if (Array.isArray(defaults)) {
    if (!Array.isArray(data)) return defaults as T;
    const model = (defaults as unknown[])[0];
    const merged = data.map((item) => (model === undefined ? item : mergeDefaults(model, item)));
    return merged as T;
  }
  if (defaults !== null && typeof defaults === "object") {
    if (data === null || typeof data !== "object" || Array.isArray(data)) return defaults;
    const source = data as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(defaults as Record<string, unknown>)) {
      out[key] = mergeDefaults(value, source[key]);
    }
    return out as T;
  }
  return (data === undefined ? defaults : data) as T;
}

function collectImagePaths(fields: FieldMap, values: unknown, out: string[]): void {
  if (values === null || typeof values !== "object") return;
  const record = values as Record<string, unknown>;
  for (const [key, field] of Object.entries(fields)) {
    const value = record[key];
    if (field.type === "image") {
      const path = (value as Partial<ImageValue> | undefined)?.path;
      if (typeof path === "string" && path !== "") out.push(path);
    } else if (field.type === "group") {
      collectImagePaths(field.fields, value, out);
    } else if (field.type === "list" && Array.isArray(value)) {
      for (const item of value) collectImagePaths(field.fields, item, out);
    }
  }
}

export function pageImagePaths(def: PageDef, content: unknown): string[] {
  const out: string[] = [];
  if (content === null || typeof content !== "object") return out;
  const record = content as Record<string, unknown>;
  for (const [key, section] of Object.entries(def.sections)) {
    collectImagePaths(section.fields, record[key], out);
  }
  return out;
}

export function emptyValue(field: Field): unknown {
  switch (field.type) {
    case "text":
    case "textarea":
      return "";
    case "select":
      return field.options[0].value;
    case "image":
      return { path: null, alt: "" };
    case "list":
      return [];
    case "group":
      return emptyItem(field.fields);
  }
}

export function emptyItem(fields: FieldMap): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, emptyValue(field)]));
}
