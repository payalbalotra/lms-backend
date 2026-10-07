DROP TABLE "job_stations" CASCADE;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "station_ids" uuid[] DEFAULT '{}'::uuid[];