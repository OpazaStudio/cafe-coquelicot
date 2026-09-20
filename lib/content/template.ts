export function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (token, key: string) =>
    key in vars ? vars[key] : token,
  );
}
