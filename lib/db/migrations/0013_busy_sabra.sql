CREATE TABLE "tracked_link_clicks" (
	"link_id" integer NOT NULL,
	"day" varchar(10) NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "tracked_link_clicks_link_id_day_pk" PRIMARY KEY("link_id","day")
);
--> statement-breakpoint
CREATE TABLE "tracked_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar(40) NOT NULL,
	"location_name" varchar(200) NOT NULL,
	"label" varchar(100) NOT NULL,
	"target_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracked_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "tracked_link_clicks" ADD CONSTRAINT "tracked_link_clicks_link_id_tracked_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."tracked_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_links" ADD CONSTRAINT "tracked_links_location_name_stores_location_name_fk" FOREIGN KEY ("location_name") REFERENCES "public"."stores"("location_name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tracked_links_location_idx" ON "tracked_links" USING btree ("location_name");