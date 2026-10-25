-- Reparation de drizzle.__drizzle_migrations — cafe coquelicot, 2026-10-24
--
-- POURQUOI. La table ne contient que 10 lignes (0000 a 0009) alors que le schema
-- porte bel et bien tous les objets de 0010 a 0015. drizzle-kit delegue a
-- drizzle-orm/postgres-js/migrator, qui ne lit qu'UNE ligne (celle au created_at
-- le plus grand) et applique tout ce qui lui est posterieur, dans UNE transaction.
-- Il tente donc 0010, dont la premiere instruction est un CREATE TABLE "settings"
-- nu : erreur 42P07, rollback de tout. Et le CLI masque l'erreur avant de sortir
-- en code 1 (bin.cjs, renderWithTask7 : terminal.reject(err) puis process.exit(1)).
-- Resultat : db:migrate ne dit rien, ne fait rien, et 0016 ne s'appliquera jamais.
--
-- CE QUE FAIT CE SCRIPT. Il n'applique aucun DDL. Il enregistre les 6 lignes de
-- comptabilite manquantes, pour que le migrateur reparte de 0015 et puisse
-- appliquer 0016. Le hash est le sha256 du texte brut de chaque .sql, comme le
-- calcule drizzle (migrator.js:15-23) ; seul created_at est relu par le migrateur,
-- le hash n'est la que pour la fidelite de la table.
--
-- VERIFIE le 2026-10-24 sur une replique PGlite montee dans l'etat exact de la
-- prod (16 migrations appliquees, puis suppression des lignes > 0009, soit 10
-- lignes et max 1786546185140) :
--   - AVANT ce script, db:migrate echoue sur CREATE TABLE "settings" (42P07),
--     la table reste a 10 lignes et la colonne de 0016 n'est pas creee ;
--   - APRES, db:migrate applique la seule 0016 : 17 lignes et colonne creee ;
--   - un second passage de ce script est refuse par le garde-fou.
--
-- GARDE-FOU. Le bloc DO refuse de poursuivre si une seule de ses conditions
-- echoue. Ne contourne pas un refus : enregistrer une migration dont les objets
-- n'existent pas la sauterait definitivement.

begin;

do $$
declare
  n_rows        bigint;
  max_created   bigint;
  orphan_images bigint;
  colors_left   bigint;
  n_fks         bigint;
begin
  select count(*), coalesce(max(created_at), 0)
    into n_rows, max_created
    from drizzle.__drizzle_migrations;

  if n_rows <> 10 then
    raise exception 'REFUS : % lignes dans __drizzle_migrations, 10 attendues.', n_rows;
  end if;

  if max_created <> 1786546185140 then
    raise exception 'REFUS : max(created_at) = %, 1786546185140 (0009) attendu.', max_created;
  end if;

  if to_regclass('public.settings') is null
     or to_regclass('public.page_content') is null
     or to_regclass('public.product_images') is null
     or to_regclass('public.contact_submissions') is null then
    raise exception 'REFUS : une table de 0010-0014 manque. Le DDL doit etre applique AVANT la comptabilite.';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'products'
                    and column_name = 'image_frame')
     or not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'products'
                    and column_name = 'description_rich')
     or not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'product_images'
                    and column_name = 'color_id') then
    raise exception 'REFUS : une colonne de 0012, 0013 ou 0015 manque.';
  end if;

  select count(*) into n_fks
    from information_schema.table_constraints
   where table_schema = 'public' and constraint_type = 'FOREIGN KEY'
     and constraint_name in ('product_images_product_id_products_id_fk',
                             'product_images_size_id_product_sizes_id_fk',
                             'product_images_color_id_product_colors_id_fk');
  if n_fks <> 3 then
    raise exception 'REFUS : % cles etrangeres de product_images sur 3 attendues.', n_fks;
  end if;

  select count(*) into orphan_images
    from products p
   where p.image_path is not null
     and not exists (select 1 from product_images i
                      where i.product_id = p.id and i.path = p.image_path);
  if orphan_images > 0 then
    raise exception 'REFUS : % produit(s) avec image_path sans ligne product_images. Le DML de 0012 n a pas tourne.', orphan_images;
  end if;

  select count(*) into colors_left
    from product_colors where image_path is not null;
  if colors_left > 0 then
    raise exception 'REFUS : % coloris portent encore image_path. Le DML de 0013 n a pas tourne.', colors_left;
  end if;

  raise notice 'Conditions reunies : 10 lignes, max 0009, DDL et DML de 0010-0015 presents.';
end $$;

-- Les six lignes manquantes, dans l'ordre du journal :
--   0010_settings  ->  created_at 1789811423430
--   0011_page_content  ->  created_at 1789837592827
--   0012_product_images  ->  created_at 1789886753415
--   0013_image_colors  ->  created_at 1789890603002
--   0014_contact_submissions  ->  created_at 1789907403308
--   0015_product_frame  ->  created_at 1789914243063
insert into drizzle.__drizzle_migrations (hash, created_at)
values
    ('a8192a530d8dcb0b1c76b3911cd2d4ce0e1f1d68efa7374b2bd32a6d96f53904', 1789811423430),
    ('a3e850e935fc55cfbcdcfa5bc5a33399a1aa31ead608113dd46309a461d271be', 1789837592827),
    ('aa0183e65c54bcc9b2ec3442b0c70ad0dfc72d3d1a527f01a1590ebde40b3982', 1789886753415),
    ('ad559aae3f8f4f70e0daf711353674f5731fd72f1f59674c16909baf307a834a', 1789890603002),
    ('5fd06a41e593e6790b7329fffd88e7c1c2d667195c2edccc2a3f216ece20aca7', 1789907403308),
    ('38386760685c9445845554195088dcd470d9d5c1c7df07bb225722a35c342823', 1789914243063);

-- Controle final : doit renvoyer 16 et 1789914243063 (0015).
select count(*) as lignes, max(created_at) as max_created_at
  from drizzle.__drizzle_migrations;

commit;
