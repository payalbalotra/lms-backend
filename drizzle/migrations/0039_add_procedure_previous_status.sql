-- Add previous_status column to procedures (idempotent - safe to re-run)
ALTER TABLE "procedures" ADD COLUMN IF NOT EXISTS "previous_status" text;