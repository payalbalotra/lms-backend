CREATE TABLE "quiz" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_en" text NOT NULL,
	"name_es" text NOT NULL,
	"quiz_type" text DEFAULT 'procedure' NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quizzes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "quizzes" CASCADE;--> statement-breakpoint
ALTER TABLE "procedures" DROP CONSTRAINT "procedures_quiz_id_quizzes_id_fk";
--> statement-breakpoint
ALTER TABLE "quiz" ADD CONSTRAINT "quiz_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_quiz_id_quiz_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quiz"("id") ON DELETE set null ON UPDATE no action;