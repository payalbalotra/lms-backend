ALTER TABLE "procedures" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "procedures" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "procedures_archived_idx" ON "procedures" USING btree ("is_archived");