import type { ElementType } from "react";
import { GitBranch, Settings, Tag, Users } from "lucide-react";

import type { AdminTab } from "@/lib/admin/types";

export const TAB_PARAM_KEY = "tab";

export const ADMIN_TABS: { id: AdminTab; label: string; icon: ElementType }[] = [
  { id: "categories", label: "Categories", icon: Tag },
  { id: "users", label: "Users", icon: Users },
  { id: "teams", label: "Teams & projects", icon: GitBranch },
  { id: "policy", label: "Policy", icon: Settings },
];

export function isValidAdminTab(tab: string | null): tab is AdminTab {
  return tab === "categories" || tab === "users" || tab === "teams" || tab === "policy";
}
