ALTER TYPE "public"."fulfillment" ADD VALUE 'mondial_relay';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "relay_point_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "relay_point_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "relay_shipment_number" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "relay_label_url" text;