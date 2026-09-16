CREATE TABLE "procedures" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title_en" text NOT NULL,
	"title_es" text NOT NULL,
	"purpose_en" text NOT NULL,
	"purpose_es" text NOT NULL,
	"category_key" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"body_en" text NOT NULL,
	"body_es" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "procedures_slug_uniq" ON "procedures" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "procedures_category_idx" ON "procedures" USING btree ("category_key");--> statement-breakpoint
CREATE INDEX "procedures_status_idx" ON "procedures" USING btree ("status");