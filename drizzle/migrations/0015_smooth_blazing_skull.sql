-- ============================================================================
-- Migration 0015: drop employees.clearance_level + replace junction tables
--   with 4 nullable FK fields on procedures
-- ============================================================================
-- Per the user's review:
--   1. employees.clearance_level was only used to gate admin routes — admin
--      now means role-membership in 'role-master'. Drop the column.
--   2. The four procedure access junction tables were an unnecessary
--      normalization. Each access dimension gets ONE nullable FK field on
--      procedures (locationId, roleId, stationId, employeeId). The cook
--      query is one round-trip and uses the default b-tree on each FK.
--
-- Per-dimension cardinality is now 1 — a procedure is visible to AT MOST
-- one location, one role, one station, and one specific employee. That's
-- the simplification the user asked for. If multi-assignment per dimension
-- comes back as a requirement later, we revisit.
--
-- Data migration: for each procedure with junction rows, pick the first
-- row per dimension (deterministic via id) and write it as the FK. If any
-- procedure had multiple rows on one dimension, the extras are dropped —
-- log a NOTICE so it's visible in migration output.
-- ============================================================================

-- Step 1: disable RLS on the junction tables we're about to drop (drizzle-kit
-- adds these DISABLE statements automatically; kept for parity with the
-- generated migration so future `db:generate` runs don't drift).
ALTER TABLE "procedure_employees" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "procedure_locations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "procedure_roles" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "procedure_stations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Step 2: add the 4 nullable FK columns on procedures. No FK constraints
-- yet so the data migration that follows can write any value without
-- tripping an FK violation.
ALTER TABLE "procedures" ADD COLUMN "access_location_id" text;--> statement-breakpoint
ALTER TABLE "procedures" ADD COLUMN "access_role_id" text;--> statement-breakpoint
ALTER TABLE "procedures" ADD COLUMN "access_station_id" text;--> statement-breakpoint
ALTER TABLE "procedures" ADD COLUMN "access_employee_id" text;--> statement-breakpoint

-- Step 3: data migration — copy the first junction row per dimension into
-- the new FK column. If a procedure had multiple rows on one dimension,
-- the extras are silently dropped; the DO block RAISE NOTICE's the count
-- so it's visible in the migration log.
DO $$
DECLARE
  dup_count int;
BEGIN
  SELECT COUNT(*) INTO dup_count
    FROM (
      SELECT procedure_id FROM procedure_locations GROUP BY procedure_id HAVING COUNT(*) > 1
      UNION ALL
      SELECT procedure_id FROM procedure_roles     GROUP BY procedure_id HAVING COUNT(*) > 1
      UNION ALL
      SELECT procedure_id FROM procedure_stations  GROUP BY procedure_id HAVING COUNT(*) > 1
      UNION ALL
      SELECT procedure_id FROM procedure_employees GROUP BY procedure_id HAVING COUNT(*) > 1
    ) d;
  IF dup_count > 0 THEN
    RAISE NOTICE 'migration 0015: % procedure/dimension groups had multiple junction rows; only the first per group kept', dup_count;
  END IF;
END $$;--> statement-breakpoint

UPDATE "procedures" p SET
  "access_location_id" = (
    SELECT pl.location_id FROM procedure_locations pl
     WHERE pl.procedure_id = p.id
     ORDER BY pl.location_id LIMIT 1
  ),
  "access_role_id" = (
    SELECT pr.role_id FROM procedure_roles pr
     WHERE pr.procedure_id = p.id
     ORDER BY pr.role_id LIMIT 1
  ),
  "access_station_id" = (
    SELECT ps.station_id FROM procedure_stations ps
     WHERE ps.procedure_id = p.id
     ORDER BY ps.station_id LIMIT 1
  ),
  "access_employee_id" = (
    SELECT pe.employee_id FROM procedure_employees pe
     WHERE pe.procedure_id = p.id
     ORDER BY pe.employee_id LIMIT 1
  );--> statement-breakpoint

-- Step 4: add FK constraints now that the columns hold valid ids.
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_access_location_id_locations_id_fk" FOREIGN KEY ("access_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_access_role_id_roles_id_fk" FOREIGN KEY ("access_role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_access_station_id_stations_id_fk" FOREIGN KEY ("access_station_id") REFERENCES "public"."stations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_access_employee_id_employees_id_fk" FOREIGN KEY ("access_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Step 5: indexes for the cook-read WHERE clause. A b-tree per column
-- makes each per-dimension match an index seek.
CREATE INDEX "procedures_access_location_idx" ON "procedures" USING btree ("access_location_id");--> statement-breakpoint
CREATE INDEX "procedures_access_role_idx" ON "procedures" USING btree ("access_role_id");--> statement-breakpoint
CREATE INDEX "procedures_access_station_idx" ON "procedures" USING btree ("access_station_id");--> statement-breakpoint
CREATE INDEX "procedures_access_employee_idx" ON "procedures" USING btree ("access_employee_id");--> statement-breakpoint

-- Step 6: drop the junction tables now that the data has been migrated.
DROP TABLE "procedure_employees" CASCADE;--> statement-breakpoint
DROP TABLE "procedure_locations" CASCADE;--> statement-breakpoint
DROP TABLE "procedure_roles" CASCADE;--> statement-breakpoint
DROP TABLE "procedure_stations" CASCADE;--> statement-breakpoint

-- Step 7: drop employees.clearance_level. Admin authority is now
-- role-membership in 'role-master' (see require-admin.ts).
ALTER TABLE "employees" DROP COLUMN "clearance_level";
