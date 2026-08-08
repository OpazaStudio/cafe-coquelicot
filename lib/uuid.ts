// Garde uuid partagée. Les colonnes `id` sont en `uuid` Postgres : passer une
// chaîne mal formée lève « invalid input syntax for type uuid » côté serveur
// (500) au lieu du 404/null attendu. À utiliser avant tout lookup par id
// provenant d'une URL ou d'une charge utile externe.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
