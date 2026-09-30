ALTER TABLE "stations" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stations_job_idx" ON "stations" USING btree ("job_id");