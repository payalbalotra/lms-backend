ALTER TABLE "jobs" DROP CONSTRAINT "jobs_role_id_roles_id_fk";
--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "role_id";