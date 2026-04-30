import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { user } from "@/db/schema/better-auth";

export const weeklySubmissionStatuses = [
  "draft",
  "submitted",
  "approved",
  "dismissed",
] as const;

export const weeklySubmission = pgTable(
  "weekly_submission",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    weekStartDate: text("week_start_date").notNull(), // ISO date string YYYY-MM-DD (Monday of the week)
    status: text("status", { enum: weeklySubmissionStatuses })
      .notNull()
      .default("draft"),
    submittedAt: timestamp("submitted_at"), // When user submitted
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }), // Admin/manager who approved
    approverRole: text("approver_role"), // "admin" or "manager"
    approverComment: text("approver_comment"), // Optional comment from approver
    dismissedBy: text("dismissed_by").references(() => user.id, { onDelete: "set null" }), // Who dismissed
    dismissComment: text("dismiss_comment"), // Optional comment for dismissal
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("weekly_submission_user_id_idx").on(table.userId),
    index("weekly_submission_status_idx").on(table.status),
    unique("weekly_submission_user_week_uniq").on(table.userId, table.weekStartDate),
  ],
);
