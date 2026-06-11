CREATE TYPE "public"."fulfillment" AS ENUM('retrait', 'poste');--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fulfillment" "fulfillment";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_address" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_postal_code" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_city" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_country" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_number" text;--> statement-breakpoint
UPDATE "orders" SET
  "fulfillment" = CASE WHEN "delivery_address" IS NOT NULL THEN 'poste'::"public"."fulfillment" ELSE 'retrait'::"public"."fulfillment" END,
  "shipping_address" = "delivery_address",
  "shipping_country" = CASE WHEN "delivery_address" IS NOT NULL THEN 'FR' END;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "fulfillment" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "delivery_address";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
UPDATE "orders" SET "status" = CASE
  WHEN "status" = 'delivered' AND "fulfillment" = 'poste' THEN 'shipped'
  WHEN "status" = 'delivered' THEN 'picked_up'
  ELSE "status"
END;--> statement-breakpoint
DROP TYPE "public"."order_status";--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'preparing', 'shipped', 'picked_up', 'cancelled');--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE "public"."order_status" USING "status"::"public"."order_status";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'pending';
