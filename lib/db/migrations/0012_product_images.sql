CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"size_id" uuid,
	"path" text NOT NULL,
	"bg_color" text,
	"alt" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "tag" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "description_rich" jsonb;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_size_id_product_sizes_id_fk" FOREIGN KEY ("size_id") REFERENCES "public"."product_sizes"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "product_images" ("product_id", "path", "bg_color", "sort_order")
SELECT "id", "image_path", "image_bg_color", 0 FROM "products" WHERE "image_path" IS NOT NULL;
