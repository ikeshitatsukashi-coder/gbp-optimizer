ALTER TABLE "scheduled_posts" ADD COLUMN "gbp_state" varchar(30);--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD COLUMN "gbp_state_checked_at" timestamp with time zone;