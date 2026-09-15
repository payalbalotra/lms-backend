ALTER TABLE "sessions" ADD COLUMN "kind" text DEFAULT 'access' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "family_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "rotated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "sessions_family_idx" ON "sessions" USING btree ("family_id");