CREATE TABLE "meo_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_name" varchar(200) NOT NULL,
	"action_date" varchar(10) NOT NULL,
	"kind" varchar(40) NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meo_snapshots" (
	"location_name" varchar(200) PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"dismissed" jsonb,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_keyword_months" (
	"location_name" varchar(200) NOT NULL,
	"month" varchar(7) NOT NULL,
	"keywords" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_keyword_months_location_name_month_pk" PRIMARY KEY("location_name","month")
);
--> statement-breakpoint
ALTER TABLE "store_features" ADD COLUMN "brand_words" jsonb;--> statement-breakpoint
ALTER TABLE "meo_actions" ADD CONSTRAINT "meo_actions_location_name_stores_location_name_fk" FOREIGN KEY ("location_name") REFERENCES "public"."stores"("location_name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meo_snapshots" ADD CONSTRAINT "meo_snapshots_location_name_stores_location_name_fk" FOREIGN KEY ("location_name") REFERENCES "public"."stores"("location_name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_keyword_months" ADD CONSTRAINT "search_keyword_months_location_name_stores_location_name_fk" FOREIGN KEY ("location_name") REFERENCES "public"."stores"("location_name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meo_actions_location_idx" ON "meo_actions" USING btree ("location_name","action_date");