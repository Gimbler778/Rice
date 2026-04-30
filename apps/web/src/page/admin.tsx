import { useState } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchCategories, createCategory, updateCategory, deleteCategory } from "@/api/categories-api";
import { GitBranch, Settings, Tag, Users } from "lucide-react";

import { authClient } from "@/lib/auth-client";

import {
  MOCK_POLICY,
  MOCK_TEAMS,
  MOCK_USERS,
} from "./admin/mock-data";
import { CategoriesTab } from "./admin/tabs/categories-tab";

import { PolicyTab } from "./admin/tabs/policy-tab";
import { TeamsTab } from "./admin/tabs/teams-tab";
import { UsersTab } from "./admin/tabs/users-tab";
import type { AdminTab, UserRole } from "./admin/types";
import { TabButton } from "./admin/ui";

const TABS: { id: AdminTab; label: string; icon: React.ElementType }[] = [
  { id: "categories", label: "Categories", icon: Tag },
  { id: "users", label: "Users", icon: Users },
  { id: "teams", label: "Teams & projects", icon: GitBranch },
  { id: "policy", label: "Policy", icon: Settings },
];

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

  const [users, setUsers] = useState(MOCK_USERS);
  const [teams, setTeams] = useState(MOCK_TEAMS);

  const [policy, setPolicy] = useState(MOCK_POLICY);

  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id ?? null;

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
    setUsers((prev) => {
      const targetUser = prev.find((user) => user.id === userId);
      if (!targetUser) {
        return prev;
      }

      const adminCount = prev.filter((user) => user.role === "admin").length;
      if (
        targetUser.role === "admin" &&
        newRole !== "admin" &&
        adminCount <= 1
      ) {
        return prev;
      }

      return prev.map((user) =>
        user.id === userId ? { ...user, role: newRole } : user,
      );
    });
  };

  const handleAddTeam = (name: string) => {
    setTeams((prev) => [
      ...prev,
      { id: `t-${Date.now()}`, name, memberIds: [], projects: [] },
    ]);
  };

  const handleDeleteTeam = (id: string) => {
    setTeams((prev) => prev.filter((team) => team.id !== id));
  };

  const handleToggleMember = (teamId: string, userId: string) => {
    setTeams((prev) =>
      prev.map((team) => {
        if (team.id !== teamId) {
          return team;
        }

        const hasMember = team.memberIds.includes(userId);
        return {
          ...team,
          memberIds: hasMember
            ? team.memberIds.filter((id) => id !== userId)
            : [...team.memberIds, userId],
        };
      }),
    );
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
