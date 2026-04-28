import { index, pgTable, real, text, timestamp, unique } from "drizzle-orm/pg-core";

import { user } from "@/db/schema/better-auth";

export const entryCategories = [
  "development",
  "code_review",
  "testing",
  "documentation",
  "meetings",
  "admin",
  "org_sessions",
  "events",
  "support",
  "learning",
  "manual_other",
] as const;

export const entryStatuses = ["accepted", "in-progress", "on-hold"] as const;
export const entrySources = ["jira", "bitbucket"] as const;

export const timesheetEntry = pgTable(
  "timesheet_entry",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // ISO date string YYYY-MM-DD
    category: text("category", { enum: entryCategories }).notNull(),
    description: text("description").notNull(),
    jiraIssueKey: text("jira_issue_key"),
    source: text("source", { enum: entrySources }),
    sourceLink: text("source_link"),
    hours: real("hours").notNull(),
    startHour: real("start_hour").notNull().default(9),
    status: text("status", { enum: entryStatuses }).notNull().default("in-progress"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("timesheet_entry_user_id_idx").on(table.userId),
    index("timesheet_entry_user_date_idx").on(table.userId, table.date),
  ],
);

export const learningTags = ["tech", "product", "process"] as const;

export const learningEntry = pgTable(
  "learning_entry",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // ISO date string YYYY-MM-DD
    title: text("title").notNull().default(""),
    notes: text("notes"),
    tag: text("tag", { enum: learningTags }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("learning_entry_user_id_idx").on(table.userId),
    unique("learning_entry_user_date_uniq").on(table.userId, table.date),
  ],
);
