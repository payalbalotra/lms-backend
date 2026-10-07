ALTER TABLE "procedures" ADD COLUMN "subcategory_id" uuid;--> statement-breakpoint
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "procedures_subcategory_idx" ON "procedures" USING btree ("subcategory_id");