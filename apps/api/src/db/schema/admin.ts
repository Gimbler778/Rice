import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "@/db/schema/better-auth";

export const adminTeam = pgTable(
  "admin_team",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    managerId: text("manager_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("admin_team_manager_id_idx").on(table.managerId)],
);

export const adminTeamMember = pgTable(
  "admin_team_member",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => adminTeam.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("admin_team_member_team_id_idx").on(table.teamId),
    index("admin_team_member_user_id_idx").on(table.userId),
    uniqueIndex("admin_team_member_team_user_uniq").on(table.teamId, table.userId),
  ],
);

export const adminProject = pgTable(
  "admin_project",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => adminTeam.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("admin_project_team_id_idx").on(table.teamId),
    uniqueIndex("admin_project_team_name_uniq").on(table.teamId, table.name),
  ],
);

export const adminTeamRelations = relations(adminTeam, ({ many, one }) => ({
  manager: one(user, {
    fields: [adminTeam.managerId],
    references: [user.id],
  }),
  members: many(adminTeamMember),
  projects: many(adminProject),
}));

export const adminTeamMemberRelations = relations(adminTeamMember, ({ one }) => ({
  team: one(adminTeam, {
    fields: [adminTeamMember.teamId],
    references: [adminTeam.id],
  }),
  user: one(user, {
    fields: [adminTeamMember.userId],
    references: [user.id],
  }),
}));

export const adminProjectRelations = relations(adminProject, ({ one }) => ({
  team: one(adminTeam, {
    fields: [adminProject.teamId],
    references: [adminTeam.id],
  }),
}));
