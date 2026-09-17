-- Categories table — manager-defined, FK'd from procedures.
-- This file is fully idempotent: every step is wrapped so re-applying on a
-- DB that's already at the target state is a no-op. Manual completion was
-- needed once on the dev DB because drizzle-kit generated a partial
-- migration that crashed on the FK (no seed), and the remaining work
-- (seed + backfill + FK) was done by SQL commands from the operator.
-- DO blocks replace all CREATE TABLE / CREATE INDEX / ADD CONSTRAINT
-- statements so future fresh-DB applies produce the same state.

--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='categories') THEN
    CREATE TABLE "categories" (
      "id" text PRIMARY KEY NOT NULL,
      "location_id" text NOT NULL,
      "slug" text NOT NULL,
      "name_en" text NOT NULL,
      "name_es" text NOT NULL,
      "is_archived" boolean DEFAULT false NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "created_by" text NOT NULL
    );
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='categories_location_id_locations_id_fk') THEN
    ALTER TABLE "categories" ADD CONSTRAINT "categories_location_id_locations_id_fk"
      FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='categories_created_by_employees_id_fk') THEN
    ALTER TABLE "categories" ADD CONSTRAINT "categories_created_by_employees_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='categories_location_idx') THEN
    CREATE INDEX "categories_location_idx" ON "categories" USING btree ("location_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='categories_location_slug_uniq') THEN
    CREATE UNIQUE INDEX "categories_location_slug_uniq"
      ON "categories" USING btree ("location_id", lower("slug"))
      WHERE "is_archived" = false;
  END IF;
END $$;--> statement-breakpoint

-- Seed the 6 defaults per location with an active employee. Idempotent via
-- ON CONFLICT DO NOTHING against the partial unique index above.
INSERT INTO "categories" ("id", "location_id", "slug", "name_en", "name_es", "created_by")
SELECT
  gen_random_uuid()::text,
  l.id,
  d.slug,
  d.name_en,
  d.name_es,
  (SELECT "id" FROM "employees" WHERE "location_id" = l."id" AND "status" = 'active' ORDER BY "created_at" ASC LIMIT 1)
FROM "locations" l
CROSS JOIN (VALUES
  ('recipes',   'Recipes',                    'Recetas'),
  ('equipment', 'Equipment Handling',         'Manejo de Equipos'),
  ('station',   'Station Procedures',         'Procedimientos de Estación'),
  ('cleaning',  'Cleaning Schedules',         'Calendarios de Limpieza'),
  ('admin',     'General and Administrative', 'General y Administrativo'),
  ('delivery',  'Delivery and Receiving',     'Entrega y Recepción')
) AS d(slug, name_en, name_es)
WHERE EXISTS (SELECT 1 FROM "employees" WHERE "location_id" = l."id" AND "status" = 'active')
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Rename procedures.category_key -> category_id. Conditional on the old
-- column existing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='procedures' AND column_name='category_key') THEN
    ALTER TABLE "procedures" RENAME COLUMN "category_key" TO "category_id";
  END IF;
END $$;--> statement-breakpoint

-- Backfill procedures.category_id from seeded categories. Joins through the
-- creator's location because procedures don't carry a location column.
UPDATE "procedures" p
SET "category_id" = c.id
FROM "categories" c
JOIN "employees" e ON e.id = p.created_by
WHERE c.location_id = e.location_id
  AND c.slug = p.category_id
  AND p.category_id IS NOT NULL
  AND p.category_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='procedures_category_idx') THEN
    DROP INDEX "procedures_category_idx";
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='procedures_category_idx') THEN
    CREATE INDEX "procedures_category_idx" ON "procedures" USING btree ("category_id");
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='procedures_category_id_categories_id_fk') THEN
    ALTER TABLE "procedures" ADD CONSTRAINT "procedures_category_id_categories_id_fk"
      FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
