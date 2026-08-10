CREATE TABLE "image_owners" (
	"url" text PRIMARY KEY NOT NULL,
	"location_name" varchar(200) NOT NULL,
	"source" varchar(20) DEFAULT 'manual' NOT NULL,
	"assigned_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "image_owners" ADD CONSTRAINT "image_owners_location_name_stores_location_name_fk" FOREIGN KEY ("location_name") REFERENCES "public"."stores"("location_name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "image_owners_location_idx" ON "image_owners" USING btree ("location_name");