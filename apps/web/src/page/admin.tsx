import { useEffect, useState } from "react";

import { GitBranch, Settings, Tag, Users } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import {
  createAdminProject,
  createAdminTeam,
  deleteAdminTeam,
  fetchAdminTeams,
  fetchAdminUsers,
  updateAdminTeam,
  updateAdminUserRole,
} from "@/api/admin-api";

import { MOCK_CATEGORIES, MOCK_POLICY } from "./admin/mock-data";
import { CategoriesTab } from "./admin/tabs/categories-tab";

import { PolicyTab } from "./admin/tabs/policy-tab";
import { TeamsTab } from "./admin/tabs/teams-tab";
import { UsersTab } from "./admin/tabs/users-tab";
import type { AdminTab, AdminTeam, AdminUser, UserRole } from "./admin/types";
import { TabButton } from "./admin/ui";

const TABS: { id: AdminTab; label: string; icon: React.ElementType }[] = [
  { id: "categories", label: "Categories", icon: Tag },
  { id: "users", label: "Users", icon: Users },
  { id: "teams", label: "Teams & projects", icon: GitBranch },
  { id: "policy", label: "Policy", icon: Settings },
];

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>("categories");

  const [categories, setCategories] = useState(MOCK_CATEGORIES);
  const [users, setUsers] = useState<AdminUser[]>([]);

  const [teams, setTeams] = useState<AdminTeam[]>([]);

  const loadUsers = async () => {
    const fetchedUsers = await fetchAdminUsers();
    setUsers(
      fetchedUsers.map((user) => ({
        ...user,
        avatarInitials: user.name
          .split(" ")
          .map((part) => part[0])
          .join("")
          .slice(0, 2)
          .toUpperCase(),
        lastActive: "Unknown",
      })),
    );
  };

  const loadTeams = async () => {
    const fetchedTeams = await fetchAdminTeams();
    setTeams(fetchedTeams);
  };

  useEffect(() => {
    loadUsers().catch((error) => console.error("Failed to fetch admin users", error));
    loadTeams().catch((error) => console.error("Failed to fetch admin teams", error));
  }, []);

  const [policy, setPolicy] = useState(MOCK_POLICY);

  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id ?? null;

  const handleToggleCategory = (id: string) => {
    setCategories((prev) =>
      prev.map((category) =>
        category.id === id
          ? { ...category, isEnabled: !category.isEnabled }
          : category,
      ),
    );
  };

  const handleRenameCategory = (id: string, name: string) => {
    setCategories((prev) =>
      prev.map((category) =>
        category.id === id ? { ...category, name } : category,
      ),
    );
  };

  const handleAddCategory = (name: string) => {
    setCategories((prev) => [
      ...prev,
      {
        id: `cat-${Date.now()}`,
        name,
        color: "bg-zinc-400",
        isDefault: false,
        isEnabled: true,
      },
    ]);
  };

  const handleRoleChange = (userId: string, newRole: UserRole) => {
    const previousUsers = users;
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));

    updateAdminUserRole(userId, newRole)
      .catch((error) => {
        console.error("Failed to update role", error);
        setUsers(previousUsers);
      })
      .then(() => loadUsers().catch((error) => console.error("Failed to reload users", error)));
  };

  const handleAddTeam = (name: string, managerId?: string | null) => {
    if (!managerId) {
      return;
    }

    createAdminTeam({ name, managerId, memberIds: [managerId] })
      .then(() => loadTeams().catch((error) => console.error("Failed to reload teams", error)))
      .catch((error) => console.error("Failed to create team", error));
  };

  const handleDeleteTeam = (id: string) => {
    deleteAdminTeam(id)
      .then(() => loadTeams().catch((error) => console.error("Failed to reload teams", error)))
      .catch((error) => console.error("Failed to delete team", error));
  };

  const handleToggleMember = (teamId: string, userId: string) => {
    const team = teams.find((item) => item.id === teamId);
    if (!team) {
      return;
    }

    const nextMemberIds = team.memberIds.includes(userId)
      ? team.memberIds.filter((id) => id !== userId)
      : [...team.memberIds, userId];

    updateAdminTeam(teamId, { memberIds: nextMemberIds })
      .then(() => loadTeams().catch((error) => console.error("Failed to reload teams", error)))
      .catch((error) => console.error("Failed to update team members", error));
  };

  const handleAddProject = (teamId: string, name: string) => {
    createAdminProject(teamId, name)
      .then(() => loadTeams().catch((error) => console.error("Failed to reload teams", error)))
      .catch((error) => console.error("Failed to create project", error));
  };



  const handlePolicyChange = (updates: Partial<typeof policy>) => {
    setPolicy((prev) => ({ ...prev, ...updates }));
  };

  const handleSavePolicy = () => {
    // TODO: PATCH /api/admin/policy { ...policy }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 shrink-0">
        <h1 className="text-sm font-semibold">Admin panel</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage categories, users, teams, and org-wide policy.
        </p>
      </div>

      <div className="border-b px-6 shrink-0">
        <div className="flex gap-1 py-2 overflow-x-auto">
          {TABS.map((tab) => (
            <TabButton
              key={tab.id}
              icon={tab.icon}
              label={tab.label}
              active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {activeTab === "categories" && (
          <CategoriesTab
            categories={categories}
            onToggleCategory={handleToggleCategory}
            onRenameCategory={handleRenameCategory}
            onAddCategory={handleAddCategory}
          />
        )}

        {activeTab === "users" && (
          <UsersTab
            users={users}
            currentUserId={currentUserId}
            onRoleChange={handleRoleChange}
          />
        )}

        {activeTab === "teams" && (
          <TeamsTab
            teams={teams}
            users={users}
            onAddTeam={handleAddTeam}
            onDeleteTeam={handleDeleteTeam}
            onToggleMember={handleToggleMember}
            onAddProject={handleAddProject}
          />
        )}



        {activeTab === "policy" && (
          <PolicyTab
            policy={policy}
            onPolicyChange={handlePolicyChange}
            onSave={handleSavePolicy}
          />
        )}
      </div>
    </div>
  );
}
