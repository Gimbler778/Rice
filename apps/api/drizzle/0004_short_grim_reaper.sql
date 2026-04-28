CREATE TABLE "learning_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"notes" text,
	"tag" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "learning_entry_user_date_uniq" UNIQUE("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "timesheet_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"jira_issue_key" text,
	"source" text,
	"source_link" text,
	"hours" real NOT NULL,
	"start_hour" real DEFAULT 9 NOT NULL,
	"status" text DEFAULT 'in-progress' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "learning_entry" ADD CONSTRAINT "learning_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entry" ADD CONSTRAINT "timesheet_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learning_entry_user_id_idx" ON "learning_entry" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "timesheet_entry_user_id_idx" ON "timesheet_entry" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "timesheet_entry_user_date_idx" ON "timesheet_entry" USING btree ("user_id","date");