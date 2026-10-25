-- Vérification que la migration 0016 est bien appliquée ET enregistrée.
-- À lancer après le script d'application. Tout doit valoir `true`, et la
-- dernière ligne doit donner 17.

SELECT
  -- Les cinq colonnes ajoutées par 0016
  (SELECT count(*) = 3 FROM information_schema.columns
     WHERE table_name = 'order_items'
       AND column_name IN ('stock_reserved_qty', 'stock_reserved_size_id', 'stock_reserved_product_id')
  ) AS colonnes_order_items,

  (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name = 'product_sizes' AND column_name = 'stock_qty'
  ) AS colonne_product_sizes,

  (SELECT count(*) = 1 FROM information_schema.columns
     WHERE table_name = 'products' AND column_name = 'stock_qty'
  ) AS colonne_products,

  -- stock_reserved_qty doit être NOT NULL avec défaut 0
  (SELECT is_nullable = 'NO' AND column_default LIKE '0%'
     FROM information_schema.columns
     WHERE table_name = 'order_items' AND column_name = 'stock_reserved_qty'
  ) AS retenue_non_nulle_defaut_zero,

  -- Les deux contraintes de non-négativité
  (SELECT count(*) = 2 FROM pg_constraint
     WHERE conname IN ('product_sizes_stock_qty_nonneg', 'products_stock_qty_nonneg')
  ) AS contraintes_nonneg,

  -- Le passage de 0016 est enregistré dans le journal Drizzle
  (SELECT count(*) = 1 FROM drizzle."__drizzle_migrations"
     WHERE "hash" = 'b4cbdc89a7da9f5b397c5c011c41f31d5a02f0fc42b0364ca716ad176b5ff86f'
  ) AS journal_0016_enregistre,

  -- Et le journal est complet : 17 migrations, de 0000 à 0016
  (SELECT count(*) FROM drizzle."__drizzle_migrations") AS lignes_journal;
