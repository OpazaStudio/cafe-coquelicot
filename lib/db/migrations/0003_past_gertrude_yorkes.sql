ALTER TYPE "public"."prep_status" ADD VALUE 'ready' BEFORE 'done';--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "prepared_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "order_items" SET "prepared_qty" = "qty"
FROM "orders"
WHERE "order_items"."order_id" = "orders"."id"
  AND "orders"."prep_status" = 'done';
