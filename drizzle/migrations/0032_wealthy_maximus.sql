ALTER TABLE "procedures" DROP CONSTRAINT "procedures_category_id_categories_id_fk";
--> statement-breakpoint
DROP INDEX "procedures_category_idx";--> statement-breakpoint
ALTER TABLE "procedures" DROP COLUMN "category_id";