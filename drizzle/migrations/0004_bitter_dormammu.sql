-- Idempotent: ADD COLUMN may have been applied in a prior run.
-- Always backfill any NULLs and tighten to NOT NULL so the schema matches
-- the snapshot.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'roles'
      AND column_name = 'name'
  ) THEN
    ALTER TABLE "roles" ADD COLUMN "name" text;
  END IF;
END $$;

UPDATE "roles" SET "name" = CASE
  WHEN "id" = 'role-general' THEN 'General'
  WHEN "id" = 'role-station' THEN 'Station Cook'
  WHEN "id" = 'role-master' THEN 'Master Admin'
  ELSE replace(replace("id", 'role-', ''), '-', ' ')
END
WHERE "name" IS NULL;

ALTER TABLE "roles" ALTER COLUMN "name" SET NOT NULL;