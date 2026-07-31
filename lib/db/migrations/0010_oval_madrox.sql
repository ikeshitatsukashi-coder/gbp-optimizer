CREATE TABLE "line_broadcasts" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_name" varchar(200) NOT NULL,
	"connection_id" integer,
	"message" text NOT NULL,
	"image_url" text,
	"status" varchar(20) NOT NULL,
	"error_message" text,
	"followers" integer,
	"sent_by" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "line_broadcasts" ADD CONSTRAINT "line_broadcasts_location_name_stores_location_name_fk" FOREIGN KEY ("location_name") REFERENCES "public"."stores"("location_name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "line_broadcasts_location_idx" ON "line_broadcasts" USING btree ("location_name","sent_at");