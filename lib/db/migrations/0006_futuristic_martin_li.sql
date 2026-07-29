CREATE TABLE "social_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_name" varchar(200) NOT NULL,
	"provider" varchar(20) NOT NULL,
	"account_name" text,
	"external_id" text,
	"access_token" text,
	"token_expires_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"settings" jsonb,
	"last_synced_at" timestamp with time zone,
	"error_message" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "notify_email" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "review_notify_keywords" jsonb;--> statement-breakpoint
ALTER TABLE "social_connections" ADD CONSTRAINT "social_connections_location_name_stores_location_name_fk" FOREIGN KEY ("location_name") REFERENCES "public"."stores"("location_name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_connections_location_idx" ON "social_connections" USING btree ("location_name");--> statement-breakpoint
CREATE INDEX "social_connections_provider_idx" ON "social_connections" USING btree ("provider");