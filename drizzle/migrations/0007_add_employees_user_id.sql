ALTER TABLE "sessions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "sessions" CASCADE;--> statement-breakpoint
-- Existing dev employees can't satisfy the new NOT NULL FK without a backfilled Better Auth user.
-- Truncating per dev agreement; production path uses the backfill script in scripts/backfill-employee-users.ts.
TRUNCATE TABLE "employees" CASCADE;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employees_user_id_uniq" ON "employees" USING btree ("user_id");