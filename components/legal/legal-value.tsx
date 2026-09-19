export function LegalValue({ value, label }: { value: string; label: string }) {
  const v = value.trim();
  if (v) return <>{v}</>;
  return <mark className="legal__todo">[à compléter : {label}]</mark>;
}
