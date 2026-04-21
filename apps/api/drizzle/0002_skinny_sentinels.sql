CREATE TABLE "timesheet_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"jira_issue_key" text,
	"hours" real NOT NULL,
	"status" text DEFAULT 'in-progress' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "timesheet_entry" ADD CONSTRAINT "timesheet_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "timesheet_entry_user_id_idx" ON "timesheet_entry" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "timesheet_entry_user_date_idx" ON "timesheet_entry" USING btree ("user_id","date");
