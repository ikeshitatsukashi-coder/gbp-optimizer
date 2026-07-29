ALTER TYPE "public"."flag_status" ADD VALUE 'manual';--> statement-breakpoint
ALTER TABLE "flag_history" ADD COLUMN "request_method" varchar(20) DEFAULT 'api' NOT NULL;--> statement-breakpoint
ALTER TABLE "flag_history" ADD COLUMN "requested_by" text;--> statement-breakpoint
ALTER TABLE "flag_history" ADD COLUMN "note" text;