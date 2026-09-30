ALTER TABLE "categories" DROP CONSTRAINT "categories_location_id_locations_id_fk";
ALTER TABLE "employees" DROP CONSTRAINT "employees_location_id_locations_id_fk";
ALTER TABLE "employees" DROP CONSTRAINT "employees_station_id_stations_id_fk";
ALTER TABLE "stations" DROP CONSTRAINT "stations_location_id_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "location_id" SET DATA TYPE uuid USING "location_id"::uuid;--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "location_id" SET DATA TYPE uuid USING "location_id"::uuid;--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "station_id" SET DATA TYPE uuid USING "station_id"::uuid;--> statement-breakpoint
ALTER TABLE "locations" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "locations" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "stations" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "stations" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "stations" ALTER COLUMN "location_id" SET DATA TYPE uuid USING "location_id"::uuid;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE restrict ON UPDATE no action;