CREATE TABLE "procedure_employees" (
	"procedure_id" text NOT NULL,
	"employee_id" text NOT NULL,
	CONSTRAINT "procedure_employees_procedure_id_employee_id_pk" PRIMARY KEY("procedure_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "procedure_locations" (
	"procedure_id" text NOT NULL,
	"location_id" text NOT NULL,
	CONSTRAINT "procedure_locations_procedure_id_location_id_pk" PRIMARY KEY("procedure_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "procedure_roles" (
	"procedure_id" text NOT NULL,
	"role_id" text NOT NULL,
	CONSTRAINT "procedure_roles_procedure_id_role_id_pk" PRIMARY KEY("procedure_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "procedure_stations" (
	"procedure_id" text NOT NULL,
	"station_id" text NOT NULL,
	CONSTRAINT "procedure_stations_procedure_id_station_id_pk" PRIMARY KEY("procedure_id","station_id")
);
--> statement-breakpoint
ALTER TABLE "procedure_employees" ADD CONSTRAINT "procedure_employees_procedure_id_procedures_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "public"."procedures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_employees" ADD CONSTRAINT "procedure_employees_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_locations" ADD CONSTRAINT "procedure_locations_procedure_id_procedures_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "public"."procedures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_locations" ADD CONSTRAINT "procedure_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_roles" ADD CONSTRAINT "procedure_roles_procedure_id_procedures_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "public"."procedures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_roles" ADD CONSTRAINT "procedure_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_stations" ADD CONSTRAINT "procedure_stations_procedure_id_procedures_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "public"."procedures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_stations" ADD CONSTRAINT "procedure_stations_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "procedure_employees_employee_idx" ON "procedure_employees" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "procedure_locations_location_idx" ON "procedure_locations" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "procedure_roles_role_idx" ON "procedure_roles" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "procedure_stations_station_idx" ON "procedure_stations" USING btree ("station_id");