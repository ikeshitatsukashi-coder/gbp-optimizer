CREATE TABLE "share_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"scope_type" varchar(20) NOT NULL,
	"location_name" varchar(200),
	"parent_company" text,
	"sections" jsonb NOT NULL,
	"insights_snapshot" jsonb,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"survey_id" integer NOT NULL,
	"location_name" varchar(200) NOT NULL,
	"answers" jsonb NOT NULL,
	"respondent_name" text,
	"respondent_contact" text,
	"redirected_to" varchar(10),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"survey_id" integer NOT NULL,
	"response_id" integer,
	"location_name" varchar(200) NOT NULL,
	"rating" integer,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surveys" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"url_mode" varchar(20) DEFAULT 'group' NOT NULL,
	"store_select_mode" varchar(20) DEFAULT 'pulldown' NOT NULL,
	"target_stores" jsonb,
	"questions" jsonb NOT NULL,
	"collect_respondent" boolean DEFAULT false NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "place_id" varchar(120);--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "new_review_uri" text;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_location_name_stores_location_name_fk" FOREIGN KEY ("location_name") REFERENCES "public"."stores"("location_name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_reviews" ADD CONSTRAINT "survey_reviews_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_reviews" ADD CONSTRAINT "survey_reviews_response_id_survey_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."survey_responses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_reviews" ADD CONSTRAINT "survey_reviews_location_name_stores_location_name_fk" FOREIGN KEY ("location_name") REFERENCES "public"."stores"("location_name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_token_uniq" ON "share_links" USING btree ("token");--> statement-breakpoint
CREATE INDEX "survey_responses_survey_idx" ON "survey_responses" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "survey_responses_location_idx" ON "survey_responses" USING btree ("location_name");--> statement-breakpoint
CREATE INDEX "survey_responses_created_idx" ON "survey_responses" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "survey_reviews_survey_idx" ON "survey_reviews" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "survey_reviews_location_idx" ON "survey_reviews" USING btree ("location_name");--> statement-breakpoint
CREATE UNIQUE INDEX "surveys_token_uniq" ON "surveys" USING btree ("token");