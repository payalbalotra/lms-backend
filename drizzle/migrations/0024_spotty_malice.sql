CREATE TABLE "employee_jobs" (
	"employee_id" uuid NOT NULL,
	"job_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_stations" (
	"employee_id" uuid NOT NULL,
	"station_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_stations" (
	"job_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	CONSTRAINT "job_stations_job_id_station_id_pk" PRIMARY KEY("job_id","station_id")
);
--> statement-breakpoint
ALTER TABLE "invites" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "roles" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "invites" CASCADE;--> statement-breakpoint
DROP TABLE "roles" CASCADE;--> statement-breakpoint
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_name_unique";--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "categories_created_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "employees" DROP CONSTRAINT "employees_role_id_roles_id_fk";
--> statement-breakpoint
ALTER TABLE "procedures" DROP CONSTRAINT "procedures_subcategory_id_subcategories_id_fk";
--> statement-breakpoint
ALTER TABLE "procedures" DROP CONSTRAINT "procedures_created_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "subcategories" DROP CONSTRAINT "subcategories_created_by_user_id_fk";
--> statement-breakpoint
DROP INDEX "procedures_subcategory_idx";--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "category_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "category_icon" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "created_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "procedures" ALTER COLUMN "created_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "subcategories" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "subcategories" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "subcategories" ALTER COLUMN "category_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "subcategories" ALTER COLUMN "created_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "role" text DEFAULT 'employee' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "require_password_change" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "procedures" ADD COLUMN "category_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_jobs" ADD CONSTRAINT "employee_jobs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_jobs" ADD CONSTRAINT "employee_jobs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_stations" ADD CONSTRAINT "employee_stations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_stations" ADD CONSTRAINT "employee_stations_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_stations" ADD CONSTRAINT "job_stations_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_stations" ADD CONSTRAINT "job_stations_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employee_jobs_pk" ON "employee_jobs" USING btree ("employee_id","job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_stations_pk" ON "employee_stations" USING btree ("employee_id","station_id");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "procedures_category_idx" ON "procedures" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "subcategories_category_idx" ON "subcategories" USING btree ("category_id");--> statement-breakpoint
ALTER TABLE "employees" DROP COLUMN "role_id";--> statement-breakpoint
ALTER TABLE "procedures" DROP COLUMN "subcategory_id";--> statement-breakpoint
ALTER TABLE "subcategories" DROP COLUMN "subcategory_icon";