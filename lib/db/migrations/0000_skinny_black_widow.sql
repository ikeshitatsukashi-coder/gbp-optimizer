CREATE TYPE "public"."archive_reason" AS ENUM('current', 'deleted', 'manual');--> statement-breakpoint
CREATE TYPE "public"."flag_status" AS ENUM('submitted', 'already_reported', 'failed', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."industry" AS ENUM('btob_logistics', 'bakery', 'funeral', 'restaurant', 'construction', 'staffing', 'buyback', 'general_btoc', 'general_btob');--> statement-breakpoint
CREATE TYPE "public"."store_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TABLE "flag_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"review_name" varchar(300) NOT NULL,
	"location_name" varchar(200) NOT NULL,
	"reviewer_snapshot" text,
	"star_rating_snapshot" integer,
	"comment_snapshot" text,
	"status" "flag_status" NOT NULL,
	"api_response" jsonb,
	"error_message" text,
	"flagged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "industry_defaults" (
	"industry" "industry" PRIMARY KEY NOT NULL,
	"allow_emoji" boolean DEFAULT false NOT NULL,
	"ban_kund_customer" boolean DEFAULT false NOT NULL,
	"style_notes" text NOT NULL,
	"openings" jsonb NOT NULL,
	"closings" jsonb NOT NULL,
	"templates_low_no_comment" jsonb,
	"templates_high_no_comment" jsonb
);
--> statement-breakpoint
CREATE TABLE "review_exclusions" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_name" varchar(200) NOT NULL,
	"review_name" varchar(300),
	"reviewer_name" text,
	"create_time" timestamp with time zone,
	"exclude_auto_reply" boolean DEFAULT true NOT NULL,
	"exclude_auto_flag" boolean DEFAULT true NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews_archive" (
	"review_name" varchar(300) PRIMARY KEY NOT NULL,
	"location_name" varchar(200) NOT NULL,
	"reviewer" text,
	"reviewer_profile_photo_url" text,
	"star_rating" integer,
	"comment" text,
	"create_time" timestamp with time zone,
	"update_time" timestamp with time zone,
	"reply_comment" text,
	"reply_update_time" timestamp with time zone,
	"archive_reason" "archive_reason" DEFAULT 'current' NOT NULL,
	"deleted_detected_at" timestamp with time zone,
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_name" varchar(200) NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"post_type" varchar(30) DEFAULT 'STANDARD' NOT NULL,
	"summary" text NOT NULL,
	"media_urls" jsonb,
	"call_to_action" jsonb,
	"event" jsonb,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"executed_at" timestamp with time zone,
	"result" jsonb,
	"error_message" text,
	"source_sheet_id" varchar(100),
	"source_row" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"location_name" varchar(200) PRIMARY KEY NOT NULL,
	"account_name" varchar(200) NOT NULL,
	"title" text NOT NULL,
	"address" jsonb,
	"primary_phone" varchar(50),
	"primary_category" text,
	"status" "store_status" DEFAULT 'active' NOT NULL,
	"industry" "industry" DEFAULT 'general_btoc' NOT NULL,
	"auto_reply_enabled" boolean DEFAULT false NOT NULL,
	"auto_flag_enabled" boolean DEFAULT false NOT NULL,
	"parent_company" text,
	"notes" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tone_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_name" varchar(200) NOT NULL,
	"addressee_pattern" text,
	"allow_emoji" boolean DEFAULT false NOT NULL,
	"ban_kund_customer" boolean DEFAULT false NOT NULL,
	"style_notes" text,
	"openings" jsonb,
	"closings" jsonb,
	"signature_keywords" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tone_configs_location_name_unique" UNIQUE("location_name")
);
--> statement-breakpoint
ALTER TABLE "flag_history" ADD CONSTRAINT "flag_history_location_name_stores_location_name_fk" FOREIGN KEY ("location_name") REFERENCES "public"."stores"("location_name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_exclusions" ADD CONSTRAINT "review_exclusions_location_name_stores_location_name_fk" FOREIGN KEY ("location_name") REFERENCES "public"."stores"("location_name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews_archive" ADD CONSTRAINT "reviews_archive_location_name_stores_location_name_fk" FOREIGN KEY ("location_name") REFERENCES "public"."stores"("location_name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_location_name_stores_location_name_fk" FOREIGN KEY ("location_name") REFERENCES "public"."stores"("location_name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tone_configs" ADD CONSTRAINT "tone_configs_location_name_stores_location_name_fk" FOREIGN KEY ("location_name") REFERENCES "public"."stores"("location_name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flag_history_review_idx" ON "flag_history" USING btree ("review_name");--> statement-breakpoint
CREATE INDEX "flag_history_location_idx" ON "flag_history" USING btree ("location_name");--> statement-breakpoint
CREATE INDEX "flag_history_flagged_at_idx" ON "flag_history" USING btree ("flagged_at");--> statement-breakpoint
CREATE INDEX "flag_history_status_idx" ON "flag_history" USING btree ("status");--> statement-breakpoint
CREATE INDEX "review_exclusions_location_idx" ON "review_exclusions" USING btree ("location_name");--> statement-breakpoint
CREATE UNIQUE INDEX "review_exclusions_review_name_uniq" ON "review_exclusions" USING btree ("review_name");--> statement-breakpoint
CREATE INDEX "reviews_archive_location_idx" ON "reviews_archive" USING btree ("location_name");--> statement-breakpoint
CREATE INDEX "reviews_archive_create_time_idx" ON "reviews_archive" USING btree ("create_time");--> statement-breakpoint
CREATE INDEX "reviews_archive_star_rating_idx" ON "reviews_archive" USING btree ("star_rating");--> statement-breakpoint
CREATE INDEX "reviews_archive_archive_reason_idx" ON "reviews_archive" USING btree ("archive_reason");--> statement-breakpoint
CREATE INDEX "scheduled_posts_location_idx" ON "scheduled_posts" USING btree ("location_name");--> statement-breakpoint
CREATE INDEX "scheduled_posts_scheduled_for_idx" ON "scheduled_posts" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "scheduled_posts_status_idx" ON "scheduled_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stores_status_idx" ON "stores" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stores_industry_idx" ON "stores" USING btree ("industry");--> statement-breakpoint
CREATE INDEX "stores_parent_company_idx" ON "stores" USING btree ("parent_company");