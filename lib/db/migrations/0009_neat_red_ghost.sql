ALTER TABLE "stores" ADD COLUMN "has_voice_of_merchant" boolean;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "duplicate_of" varchar(200);--> statement-breakpoint
CREATE INDEX "stores_vom_idx" ON "stores" USING btree ("has_voice_of_merchant");