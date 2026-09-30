ALTER TABLE "stations" DROP CONSTRAINT "stations_job_id_jobs_id_fk";
--> statement-breakpoint
ALTER TABLE "stations" ALTER COLUMN "job_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;