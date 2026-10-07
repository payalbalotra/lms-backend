ALTER TABLE "quizzes" ADD COLUMN "quiz_type" text DEFAULT 'procedure' NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "questions" jsonb DEFAULT '[]'::jsonb NOT NULL;