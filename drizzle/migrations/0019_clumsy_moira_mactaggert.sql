-- ALTER TABLE "employees" DROP CONSTRAINT "employees_station_id_stations_id_fk";
--> statement-breakpoint
-- ALTER TABLE "invites" DROP CONSTRAINT "invites_created_by_employees_id_fk";
--> statement-breakpoint
ALTER TABLE "stations" DROP CONSTRAINT "stations_location_id_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "stations" DROP CONSTRAINT "stations_job_id_jobs_id_fk";
--> statement-breakpoint
DROP INDEX "stations_location_idx";--> statement-breakpoint
DROP INDEX "stations_job_idx";--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "created_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "invites" ALTER COLUMN "employee_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "procedures" ALTER COLUMN "created_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "job_ids" uuid[] DEFAULT '{}'::uuid[];--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "station_ids" uuid[] DEFAULT '{}'::uuid[];--> statement-breakpoint
ALTER TABLE "employees" DROP COLUMN "station_id";--> statement-breakpoint
ALTER TABLE "employees" DROP COLUMN "clearance_level";--> statement-breakpoint
ALTER TABLE "employees" DROP COLUMN "password_hash";--> statement-breakpoint
ALTER TABLE "employees" DROP COLUMN "must_reset_password";--> statement-breakpoint
ALTER TABLE "employees" DROP COLUMN "failed_login_attempts";--> statement-breakpoint
ALTER TABLE "employees" DROP COLUMN "locked_until";--> statement-breakpoint
ALTER TABLE "stations" DROP COLUMN "location_id";--> statement-breakpoint
ALTER TABLE "stations" DROP COLUMN "job_id";--> statement-breakpoint
ALTER TABLE "stations" DROP COLUMN "sort_order";--> statement-breakpoint
ALTER TABLE "stations" DROP COLUMN "is_archived";