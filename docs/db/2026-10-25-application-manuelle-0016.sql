-- Application manuelle de la migration 0016_confused_gauntlet, avec
-- enregistrement de son passage dans le journal Drizzle.
--
-- À lancer dans l'éditeur SQL de Supabase. Idempotent : le relancer ne fait
-- rien de plus, et il ne touche aucune donnée existante — uniquement l'ajout
-- de colonnes nullables (plus une colonne à défaut 0) et deux contraintes.
--
-- L'enregistrement dans drizzle.__drizzle_migrations est la partie qu'on
-- oublie : sans elle, `drizzle-kit migrate` rejouerait 0016 et échouerait sur
-- un 42P07, comme en septembre où le journal comptait 10 lignes pour
-- 16 migrations.

BEGIN;

ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "stock_reserved_qty" integer DEFAULT 0 NOT NULL;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "stock_reserved_size_id" uuid;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "stock_reserved_product_id" uuid;
ALTER TABLE "product_sizes" ADD COLUMN IF NOT EXISTS "stock_qty" integer;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stock_qty" integer;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_sizes_stock_qty_nonneg'
      AND conrelid = '"product_sizes"'::regclass
  ) THEN
    ALTER TABLE "product_sizes" ADD CONSTRAINT "product_sizes_stock_qty_nonneg"
      CHECK ("product_sizes"."stock_qty" IS NULL OR "product_sizes"."stock_qty" >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_stock_qty_nonneg'
      AND conrelid = '"products"'::regclass
  ) THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_stock_qty_nonneg"
      CHECK ("products"."stock_qty" IS NULL OR "products"."stock_qty" >= 0);
  END IF;
END
$do$;

INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
SELECT
  'b4cbdc89a7da9f5b397c5c011c41f31d5a02f0fc42b0364ca716ad176b5ff86f',
  1792859230033
WHERE NOT EXISTS (
  SELECT 1 FROM drizzle."__drizzle_migrations"
  WHERE "hash" = 'b4cbdc89a7da9f5b397c5c011c41f31d5a02f0fc42b0364ca716ad176b5ff86f'
);

COMMIT;
