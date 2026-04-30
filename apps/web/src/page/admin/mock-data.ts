import type {
  AdminCategory,
  AdminUser,
  AdminTeam,
  PolicySettings,
  UserRole,
} from "./types";

export const MOCK_CATEGORIES: AdminCategory[] = [
  { id: "cat-1", name: "Development", color: "bg-teal-500", isDefault: true, isEnabled: true },
  { id: "cat-2", name: "Code review", color: "bg-purple-500", isDefault: true, isEnabled: true },
  { id: "cat-3", name: "Testing", color: "bg-blue-400", isDefault: true, isEnabled: true },
  { id: "cat-4", name: "Documentation", color: "bg-amber-400", isDefault: true, isEnabled: true },
  { id: "cat-5", name: "Meetings", color: "bg-zinc-400", isDefault: true, isEnabled: true },
  { id: "cat-6", name: "Admin", color: "bg-zinc-500", isDefault: true, isEnabled: true },
  { id: "cat-7", name: "Org sessions", color: "bg-pink-400", isDefault: true, isEnabled: true },
  { id: "cat-8", name: "Events", color: "bg-orange-400", isDefault: true, isEnabled: true },
  { id: "cat-9", name: "Support", color: "bg-red-400", isDefault: true, isEnabled: true },
  { id: "cat-10", name: "Learning", color: "bg-green-400", isDefault: true, isEnabled: true },
];

export const MOCK_USERS: AdminUser[] = [
  { id: "u1", name: "Nirav Shah", email: "nirav@iqm.com", role: "admin", avatarInitials: "NS", lastActive: "Today", isCurrentUser: false },
  { id: "u2", name: "Devansh Kumar", email: "devansh@iqm.com", role: "developer", avatarInitials: "DK", lastActive: "Today", isCurrentUser: true },
  { id: "u3", name: "Aditya Mehta", email: "aditya@iqm.com", role: "developer", avatarInitials: "AM", lastActive: "Yesterday", isCurrentUser: false },
  { id: "u4", name: "Nikhil Rao", email: "nikhil@iqm.com", role: "developer", avatarInitials: "NR", lastActive: "2 days ago", isCurrentUser: false },
];

export const MOCK_TEAMS: AdminTeam[] = [
  { id: "t1", name: "RICE Squad", memberIds: ["u1", "u2", "u3", "u4"], projects: ["RICE", "Internal tools"], managerId: "u2" },
  { id: "t2", name: "Platform team", memberIds: ["u1"], projects: ["Infra"], managerId: "u1" },
];



export const MOCK_POLICY: PolicySettings = {
  dailyReminderTime: "17:00",
  weeklyReminderDay: "friday",
  weeklyReminderTime: "16:00",
  submissionCadence: "weekly",
  dataRetentionMonths: 12,
  lockAfterApproval: true,
};

export const ROLE_BADGE: Record<UserRole, string> = {
  admin: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  manager: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  developer: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  auditor: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};
