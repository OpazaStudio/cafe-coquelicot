CREATE TYPE "public"."prep_status" AS ENUM('todo', 'in_progress', 'done');--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "prep_status" "prep_status" DEFAULT 'todo' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "prep_done_at" timestamp with time zone;--> statement-breakpoint
UPDATE "orders" SET "prep_status" = 'done', "prep_done_at" = "created_at"
WHERE "status" IN ('shipped', 'picked_up');
