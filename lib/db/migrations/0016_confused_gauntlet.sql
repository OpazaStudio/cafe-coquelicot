ALTER TABLE "order_items" ADD COLUMN "stock_reserved_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "stock_reserved_size_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "stock_reserved_product_id" uuid;--> statement-breakpoint
ALTER TABLE "product_sizes" ADD COLUMN "stock_qty" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "stock_qty" integer;--> statement-breakpoint
ALTER TABLE "product_sizes" ADD CONSTRAINT "product_sizes_stock_qty_nonneg" CHECK ("product_sizes"."stock_qty" IS NULL OR "product_sizes"."stock_qty" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_stock_qty_nonneg" CHECK ("products"."stock_qty" IS NULL OR "products"."stock_qty" >= 0);