-- ============================================================================
-- Migration: revert_auth_table_ids_to_text
-- Purpose:   Revert user/session/account/verification id and user_id columns
--            back to TEXT.
--
-- Better Auth v1.7.4 generates its own nanoid-format IDs (e.g.
-- "wmFbRPmSepLqxri8hn57zFFzFn92Tt0D") — it does NOT generate UUIDs even
-- when advanced.generateId is set. Migration 0019 changed these columns to
-- UUID, which caused every signUpEmail call to fail with:
--   "invalid input syntax for type uuid"
--
-- The Drizzle schema (auth.schema.ts) will also be updated to use text() for
-- these id columns so Drizzle and the DB stay in sync.
--
-- NOTE: employees.user_id stays as uuid because it is set by our OWN code
-- (not by better-auth), and we explicitly set it to a UUID from user.id after
-- the user is created.
-- ============================================================================

-- 1. Drop FK constraints pointing at user.id or from auth tables
ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "employees_user_id_user_id_fk";
ALTER TABLE "session"   DROP CONSTRAINT IF EXISTS "session_user_id_user_id_fk";
ALTER TABLE "account"   DROP CONSTRAINT IF EXISTS "account_user_id_user_id_fk";
--> statement-breakpoint

-- 2. Revert id columns back to text
ALTER TABLE "user"         ALTER COLUMN "id"      SET DATA TYPE text USING "id"::text;
ALTER TABLE "user"         ALTER COLUMN "id"      DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "session"      ALTER COLUMN "id"      SET DATA TYPE text USING "id"::text;
ALTER TABLE "session"      ALTER COLUMN "id"      DROP DEFAULT;
ALTER TABLE "session"      ALTER COLUMN "user_id" SET DATA TYPE text USING "user_id"::text;
--> statement-breakpoint
ALTER TABLE "account"      ALTER COLUMN "id"      SET DATA TYPE text USING "id"::text;
ALTER TABLE "account"      ALTER COLUMN "id"      DROP DEFAULT;
ALTER TABLE "account"      ALTER COLUMN "user_id" SET DATA TYPE text USING "user_id"::text;
--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "id"      SET DATA TYPE text USING "id"::text;
ALTER TABLE "verification" ALTER COLUMN "id"      DROP DEFAULT;
--> statement-breakpoint

-- 3. employees.user_id: revert to text so it can hold better-auth's text user IDs
--    (our code does: db.update(employees).set({ userId: user.id }) where user.id is text)
ALTER TABLE "employees" ALTER COLUMN "user_id" SET DATA TYPE text USING "user_id"::text;
--> statement-breakpoint

-- 4. Re-add FK constraints (user.id is now text again, employees/session/account user_id is text)
ALTER TABLE "session"   ADD CONSTRAINT "session_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "account"   ADD CONSTRAINT "account_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
