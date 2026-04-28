export type UserRole = "developer" | "manager" | "admin" | "auditor";

export interface AdminCategory {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
  isEnabled: boolean;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarInitials: string;
  lastActive: string;
  isCurrentUser?: boolean;
}

export interface AdminTeam {
  id: string;
  name: string;
  memberIds: string[];
  projects: string[];
}



export interface PolicySettings {
  dailyReminderTime: string;
  weeklyReminderDay: string;
  weeklyReminderTime: string;
  submissionCadence: "weekly" | "biweekly";
  dataRetentionMonths: number;
  lockAfterApproval: boolean;
}

export type AdminTab =
  | "categories"
  | "users"
  | "teams"
  | "policy";
