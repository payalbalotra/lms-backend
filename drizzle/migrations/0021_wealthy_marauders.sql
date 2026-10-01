CREATE TABLE "subcategories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name_en" text NOT NULL,
	"name_es" text NOT NULL,
	"category_icon" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "procedures" DROP CONSTRAINT IF EXISTS "procedures_category_id_categories_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "procedures_category_idx";--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "category_type" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "category_icon" text;--> statement-breakpoint
ALTER TABLE "procedures" ADD COLUMN "subcategory_id" uuid;--> statement-breakpoint
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "procedures_subcategory_idx" ON "procedures" USING btree ("subcategory_id");--> statement-breakpoint

ALTER TABLE "procedures" DROP COLUMN "category_id";