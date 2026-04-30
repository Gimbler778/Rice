import { useCallback, useEffect, useState } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchCategories, createCategory, updateCategory, deleteCategory } from "@/api/categories-api";
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

import { MOCK_POLICY } from "./admin/mock-data";
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

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>("categories");

  const queryClient = useQueryClient();

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });
  const categories = categoriesData?.categories || [];

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) => updateCategory(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: () => {
      toast.error("Failed to update category");
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => createCategory({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: () => {
      toast.error("Failed to create category");
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: () => {
      toast.error("Failed to delete category");
    },
  });

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [teams, setTeams] = useState<AdminTeam[]>([]);

  const [policy, setPolicy] = useState(MOCK_POLICY);

  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id ?? null;

  const loadUsers = useCallback(async () => {
    try {
      const apiUsers = await fetchAdminUsers();
      setUsers(
        apiUsers.map((user) => ({
          ...user,
          avatarInitials: getInitials(user.name),
          lastActive: "-",
          isCurrentUser: user.id === currentUserId,
        })),
      );
    } catch (error) {
      console.error("Failed to load users", error);
      toast.error("Failed to load users");
    }
  }, [currentUserId]);

  const loadTeams = useCallback(async () => {
    try {
      const apiTeams = await fetchAdminTeams();
      setTeams(apiTeams);
    } catch (error) {
      console.error("Failed to load teams", error);
      toast.error("Failed to load teams");
    }
  }, []);

  useEffect(() => {
    void loadUsers();
    void loadTeams();
  }, [loadUsers, loadTeams]);

  const handleToggleCategory = (id: string) => {
    const category = categories.find((c) => c.id === id);
    if (!category) return;
    updateCategoryMutation.mutate({ id, updates: { isEnabled: !category.isEnabled } });
  };

  const handleRenameCategory = (id: string, name: string) => {
    updateCategoryMutation.mutate({ id, updates: { name } });
  };

  const handleAddCategory = (name: string) => {
    createCategoryMutation.mutate(name);
  };

  const handleDeleteCategory = (id: string) => {
    deleteCategoryMutation.mutate(id);
  };

  const handleRoleChange = (userId: string, newRole: UserRole) => {
    const previousUsers = users;
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));

    updateAdminUserRole(userId, newRole)
      .catch((error) => {
        console.error("Failed to update role", error);
        setUsers(previousUsers);
      })
      .finally(() => {
        void loadUsers();
      });
  };

  const handleAddTeam = (name: string, managerId?: string | null) => {
    if (!managerId) {
      return;
    }

    createAdminTeam({ name, managerId, memberIds: [managerId] })
      .then(() => loadTeams())
      .catch((error) => console.error("Failed to create team", error));
  };

  const handleDeleteTeam = (id: string) => {
    deleteAdminTeam(id)
      .then(() => loadTeams())
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
      .then(() => loadTeams())
      .catch((error) => console.error("Failed to update team members", error));
  };

  const handleAddProject = (teamId: string, name: string) => {
    createAdminProject(teamId, name)
      .then(() => loadTeams())
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
            onDeleteCategory={handleDeleteCategory}
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
