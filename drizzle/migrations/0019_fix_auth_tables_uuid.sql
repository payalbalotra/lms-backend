-- ============================================================================
-- Migration: fix_auth_tables_uuid
-- Purpose:   Change id/user_id columns in Better Auth tables (user, session,
--            account, verification) and employees.user_id from TEXT to UUID.
--
-- The tables were originally created in 0006_kind_romulus.sql with TEXT ids.
-- The Drizzle schema now declares all these columns as UUID, causing a type
-- mismatch that silently prevents Better Auth from inserting users.
--
-- Because there is NO existing data (user table is empty), we can safely
-- drop & re-create the FK constraints, alter the columns, and re-add them.
-- ============================================================================

-- 1. Drop all FK constraints that reference user.id or use these columns
--    (order matters: children before parent)
ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "employees_user_id_user_id_fk";
ALTER TABLE "session"   DROP CONSTRAINT IF EXISTS "session_user_id_user_id_fk";
ALTER TABLE "account"   DROP CONSTRAINT IF EXISTS "account_user_id_user_id_fk";
--> statement-breakpoint

-- 2. Alter the primary key columns to UUID
--    USING clause casts existing text values to uuid (safe if empty or valid UUIDs)
ALTER TABLE "user"         ALTER COLUMN "id"      SET DATA TYPE uuid USING "id"::uuid;
ALTER TABLE "user"         ALTER COLUMN "id"      SET DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE "session"      ALTER COLUMN "id"      SET DATA TYPE uuid USING "id"::uuid;
ALTER TABLE "session"      ALTER COLUMN "id"      SET DEFAULT gen_random_uuid();
ALTER TABLE "session"      ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;
--> statement-breakpoint
ALTER TABLE "account"      ALTER COLUMN "id"      SET DATA TYPE uuid USING "id"::uuid;
ALTER TABLE "account"      ALTER COLUMN "id"      SET DEFAULT gen_random_uuid();
ALTER TABLE "account"      ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;
--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "id"      SET DATA TYPE uuid USING "id"::uuid;
ALTER TABLE "verification" ALTER COLUMN "id"      SET DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE "employees"    ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;
--> statement-breakpoint

-- 3. Re-add FK constraints
ALTER TABLE "session"   ADD CONSTRAINT "session_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "account"   ADD CONSTRAINT "account_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
