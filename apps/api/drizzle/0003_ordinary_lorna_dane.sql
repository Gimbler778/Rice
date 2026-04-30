CREATE TABLE "weekly_submission" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"week_start_date" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp,
	"approved_by" text,
	"approver_role" text,
	"approver_comment" text,
	"dismissed_by" text,
	"dismiss_comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_submission_user_week_uniq" UNIQUE("user_id","week_start_date")
);
--> statement-breakpoint
ALTER TABLE "weekly_submission" ADD CONSTRAINT "weekly_submission_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_submission" ADD CONSTRAINT "weekly_submission_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_submission" ADD CONSTRAINT "weekly_submission_dismissed_by_user_id_fk" FOREIGN KEY ("dismissed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "weekly_submission_user_id_idx" ON "weekly_submission" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "weekly_submission_status_idx" ON "weekly_submission" USING btree ("status");