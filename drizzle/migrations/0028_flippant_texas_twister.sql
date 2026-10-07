ALTER TABLE "categories" DROP CONSTRAINT "categories_created_by_employees_id_fk";
--> statement-breakpoint
ALTER TABLE "subcategories" DROP CONSTRAINT "subcategories_created_by_employees_id_fk";
--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "created_by" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "subcategories" ALTER COLUMN "created_by" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;