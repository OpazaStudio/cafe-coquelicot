ALTER TABLE "product_images" ADD COLUMN "color_id" uuid;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_color_id_product_colors_id_fk" FOREIGN KEY ("color_id") REFERENCES "public"."product_colors"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "product_images" ("product_id", "color_id", "path", "bg_color", "sort_order")
SELECT "product_id", "id", "image_path", "image_bg_color", 1000 + "sort_order"
FROM "product_colors" WHERE "image_path" IS NOT NULL;--> statement-breakpoint
UPDATE "product_colors" SET "image_path" = NULL, "image_bg_color" = NULL
WHERE "image_path" IS NOT NULL;
