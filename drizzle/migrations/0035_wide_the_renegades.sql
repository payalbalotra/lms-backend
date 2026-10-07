ALTER TABLE "procedures" ADD COLUMN "station_id" uuid;--> statement-breakpoint
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "procedures_station_idx" ON "procedures" USING btree ("station_id");