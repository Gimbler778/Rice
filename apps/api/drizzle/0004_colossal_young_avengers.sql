CREATE TABLE "admin_project" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_team" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"manager_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_team_member" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_project" ADD CONSTRAINT "admin_project_team_id_admin_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."admin_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_team" ADD CONSTRAINT "admin_team_manager_id_user_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_team_member" ADD CONSTRAINT "admin_team_member_team_id_admin_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."admin_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_team_member" ADD CONSTRAINT "admin_team_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_project_team_id_idx" ON "admin_project" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_project_team_name_uniq" ON "admin_project" USING btree ("team_id","name");--> statement-breakpoint
CREATE INDEX "admin_team_manager_id_idx" ON "admin_team" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "admin_team_member_team_id_idx" ON "admin_team_member" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "admin_team_member_user_id_idx" ON "admin_team_member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_team_member_team_user_uniq" ON "admin_team_member" USING btree ("team_id","user_id");