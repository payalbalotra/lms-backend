CREATE TABLE "quiz_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"quiz_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"score" integer NOT NULL,
	"passed" boolean NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" text PRIMARY KEY NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attached" boolean DEFAULT false NOT NULL,
	"passing_score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "procedures" ADD COLUMN "quiz_id" text;--> statement-breakpoint
ALTER TABLE "procedures" ADD COLUMN "linked_training_id" text;--> statement-breakpoint
ALTER TABLE "procedures" ADD COLUMN "quiz_mode" text DEFAULT 'training' NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quiz_attempts_quiz_employee_idx" ON "quiz_attempts" USING btree ("quiz_id","employee_id","attempted_at");--> statement-breakpoint
CREATE INDEX "quiz_attempts_employee_idx" ON "quiz_attempts" USING btree ("employee_id","attempted_at");--> statement-breakpoint
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "procedures_quiz_id_idx" ON "procedures" USING btree ("quiz_id");