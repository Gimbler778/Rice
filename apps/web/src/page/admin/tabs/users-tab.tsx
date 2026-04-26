import { Shield } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { AdminUser, UserRole } from "../types";
import { RoleBadge, SectionHeader } from "../ui";

type UsersTabProps = {
  users: AdminUser[];
  currentUserId?: string | null;
  onRoleChange: (userId: string, newRole: UserRole) => void;
};

export function UsersTab({ users, currentUserId, onRoleChange }: UsersTabProps) {
  const adminCount = users.filter((user) => user.role === "admin").length;

  const isLastAdmin = (user: AdminUser) => user.role === "admin" && adminCount <= 1;

  return (
    <div>
      <SectionHeader
        title="User management"
        description="All users who have signed in via Atlassian OAuth. Default role for new users is Developer."
      />

      {adminCount <= 1 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-4 py-2.5 mb-4 text-sm text-amber-800 dark:text-amber-300">
          <Shield className="size-4 shrink-0 mt-0.5" />
          <span>
            There is only <strong>1 admin</strong> in this organisation. Promote another
            user before changing this admin&apos;s role.
          </span>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  User
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  Email
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground w-28">
                  Role
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground w-28">
                  Last active
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground w-36">
                  Change role
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isLast = isLastAdmin(user);
                const isCurrentUser = user.id === currentUserId || user.isCurrentUser;

                return (
                  <tr
                    key={user.id}
                    className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="size-7 rounded-full bg-teal-100 dark:bg-teal-900 flex items-center justify-center text-xs font-semibold text-teal-800 dark:text-teal-200 shrink-0">
                          {user.avatarInitials}
                        </div>
                        <div>
                          <span className="text-sm font-medium">{user.name}</span>
                          {isCurrentUser && (
                            <span className="ml-1.5 text-[10px] text-muted-foreground">(you)</span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-xs text-muted-foreground truncate">
                      {user.email}
                    </td>

                    <td className="px-4 py-3">
                      <RoleBadge role={user.role} />
                    </td>

                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {user.lastActive}
                    </td>

                    <td className="px-4 py-3">
                      <div className="relative group/role">
                        <Select
                          value={user.role}
                          onValueChange={(value) => onRoleChange(user.id, value as UserRole)}
                          disabled={isLast || isCurrentUser}
                        >
                          <SelectTrigger className="h-7 text-xs w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="developer" className="text-xs">
                              Developer
                            </SelectItem>
                            <SelectItem value="manager" className="text-xs">
                              Manager
                            </SelectItem>
                            <SelectItem value="admin" className="text-xs">
                              Admin
                            </SelectItem>
                            <SelectItem value="auditor" className="text-xs">
                              Auditor
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        {(isLast || isCurrentUser) && (
                          <div className="absolute bottom-full left-0 mb-1 w-52 hidden group-hover/role:block z-50">
                            <div className="bg-popover border rounded-md px-2.5 py-1.5 text-xs text-muted-foreground shadow-md">
                              {isLast
                                ? "At least one admin must exist in the organisation."
                                : "You cannot change your own role."}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground mt-2">
        {users.length} users · {adminCount} admin{adminCount !== 1 ? "s" : ""} · New users
        default to Developer role
      </p>
    </div>
  );
}
