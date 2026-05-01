import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "@/db/schema/better-auth";

/**
 * Notification types emitted by the system:
 *  - team_assigned          → developer/manager: assigned to a team
 *  - manager_assigned       → developer: who their manager is
 *  - report_approved        → developer: manager approved weekly report
 *  - report_dismissed       → developer: manager dismissed weekly report
 *  - report_submitted       → manager: a developer submitted a weekly report
 *  - role_changed           → admin: a user's role was updated
 */
export const notificationTypes = [
  "team_assigned",
  "manager_assigned",
  "report_approved",
  "report_dismissed",
  "report_submitted",
  "role_changed",
] as const;

export type NotificationType = (typeof notificationTypes)[number];

export const notification = pgTable(
  "notification",
  {
    id: text("id").primaryKey(),
    /** The user who should receive this notification */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type", { enum: notificationTypes }).notNull(),
    /** Human-readable message (possibly AI-generated) */
    message: text("message").notNull(),
    /** Optional short title */
    title: text("title").notNull(),
    /** Extra JSON metadata (team name, manager name, etc.) */
    metadata: text("metadata"), // JSON string
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("notification_user_id_idx").on(table.userId),
    index("notification_read_idx").on(table.read),
  ],
);
