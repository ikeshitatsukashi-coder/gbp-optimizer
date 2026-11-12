CREATE TABLE "monthly_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar(64) NOT NULL,
	"location_name" varchar(200) NOT NULL,
	"month" varchar(7) NOT NULL,
	"snapshot" jsonb NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_intake_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar(64) NOT NULL,
	"location_name" varchar(200) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_intake_uploads" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_name" varchar(200) NOT NULL,
	"url" text NOT NULL,
	"file_name" text,
	"sender_name" text,
	"note" text,
	"seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_notices" (
	"review_name" varchar(300) PRIMARY KEY NOT NULL,
	"location_name" varchar(200) NOT NULL,
	"reviewer" text,
	"star_rating" integer,
	"comment" text,
	"review_create_time" timestamp with time zone,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" varchar(20) DEFAULT 'new' NOT NULL,
	"notified_at" timestamp with time zone,
	"notified_by" text,
	"notified_to" text,
	"handled_at" timestamp with time zone,
	"handled_by" text
);
--> statement-breakpoint
CREATE TABLE "review_reply_drafts" (
	"review_name" varchar(300) PRIMARY KEY NOT NULL,
	"location_name" varchar(200) NOT NULL,
	"draft" text NOT NULL,
	"source" varchar(20) DEFAULT 'template' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_at" timestamp with time zone,
	"posted_by" text
);
--> statement-breakpoint
CREATE TABLE "store_features" (
	"location_name" varchar(200) PRIMARY KEY NOT NULL,
	"track_post_clicks" boolean DEFAULT false NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_location_name_stores_location_name_fk" FOREIGN KEY ("location_name") REFERENCES "public"."stores"("location_name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_intake_links" ADD CONSTRAINT "photo_intake_links_location_name_stores_location_name_fk" FOREIGN KEY ("location_name") REFERENCES "public"."stores"("location_name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_intake_uploads" ADD CONSTRAINT "photo_intake_uploads_location_name_stores_location_name_fk" FOREIGN KEY ("location_name") REFERENCES "public"."stores"("location_name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_notices" ADD CONSTRAINT "review_notices_location_name_stores_location_name_fk" FOREIGN KEY ("location_name") REFERENCES "public"."stores"("location_name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_reply_drafts" ADD CONSTRAINT "review_reply_drafts_location_name_stores_location_name_fk" FOREIGN KEY ("location_name") REFERENCES "public"."stores"("location_name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_features" ADD CONSTRAINT "store_features_location_name_stores_location_name_fk" FOREIGN KEY ("location_name") REFERENCES "public"."stores"("location_name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_reports_token_uniq" ON "monthly_reports" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_reports_location_month_uniq" ON "monthly_reports" USING btree ("location_name","month");--> statement-breakpoint
CREATE UNIQUE INDEX "photo_intake_links_token_uniq" ON "photo_intake_links" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "photo_intake_links_location_uniq" ON "photo_intake_links" USING btree ("location_name");--> statement-breakpoint
CREATE INDEX "photo_intake_uploads_location_idx" ON "photo_intake_uploads" USING btree ("location_name","created_at");--> statement-breakpoint
CREATE INDEX "review_notices_location_idx" ON "review_notices" USING btree ("location_name");--> statement-breakpoint
CREATE INDEX "review_notices_status_idx" ON "review_notices" USING btree ("status","detected_at");--> statement-breakpoint
CREATE INDEX "review_reply_drafts_location_idx" ON "review_reply_drafts" USING btree ("location_name");--> statement-breakpoint
CREATE INDEX "review_reply_drafts_status_idx" ON "review_reply_drafts" USING btree ("status");