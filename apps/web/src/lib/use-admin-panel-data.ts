import { useCallback, useEffect, useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createCategory,
  deleteCategory,
  fetchCategories,
  updateCategory,
  type UpdateCategoryInput,
} from "@/api/categories-api";
import {
  createAdminProject,
  createAdminTeam,
  deleteAdminTeam,
  fetchAdminTeams,
  fetchAdminUsers,
  updateAdminTeam,
  updateAdminUserRole,
} from "@/api/admin-api";
import { authClient } from "@/lib/auth-client";
import type {
  AdminTeam,
  AdminUser,
  PolicySettings,
  UserRole,
} from "@/lib/admin/types";

const DEFAULT_POLICY: PolicySettings = {
  dailyReminderTime: "17:00",
  weeklyReminderDay: "friday",
  weeklyReminderTime: "16:00",
  submissionCadence: "weekly",
  dataRetentionMonths: 12,
  lockAfterApproval: true,
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function useAdminPanelData() {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id ?? null;

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [teams, setTeams] = useState<AdminTeam[]>([]);
  const [policy, setPolicy] = useState<PolicySettings>(DEFAULT_POLICY);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [isTeamsLoading, setIsTeamsLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [isUpdatingTeam, setIsUpdatingTeam] = useState(false);

  const {
    data: categoriesData,
    isLoading: isCategoriesLoading,
    isFetching: isCategoriesFetching,
    isError: isCategoriesError,
    refetch: refetchCategories,
  } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const categories = categoriesData?.categories ?? [];

  const updateCategoryMutation = useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: UpdateCategoryInput;
    }) => updateCategory(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Category updated");
    },
    onError: () => {
      toast.error("Failed to update category");
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => createCategory({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Category added");
    },
    onError: () => {
      toast.error("Failed to create category");
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Category deleted");
    },
    onError: () => {
      toast.error("Failed to delete category");
    },
  });

  const loadUsers = useCallback(async () => {
    setIsUsersLoading(true);
    setUsersError(null);

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
      setUsersError("Unable to load users right now.");
      toast.error("Failed to load users");
    } finally {
      setIsUsersLoading(false);
    }
  }, [currentUserId]);

  const loadTeams = useCallback(async () => {
    setIsTeamsLoading(true);
    setTeamsError(null);

    try {
      const apiTeams = await fetchAdminTeams();
      setTeams(apiTeams);
    } catch (error) {
      console.error("Failed to load teams", error);
      setTeamsError("Unable to load teams right now.");
      toast.error("Failed to load teams");
    } finally {
      setIsTeamsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
    void loadTeams();
  }, [loadUsers, loadTeams]);

  const handleToggleCategory = (id: string) => {
    const category = categories.find((item) => item.id === id);
    if (!category) {
      return;
    }

    updateCategoryMutation.mutate({
      id,
      updates: { isEnabled: !category.isEnabled },
    });
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
    setUsers((prev) =>
      prev.map((user) =>
        user.id === userId ? { ...user, role: newRole } : user,
      ),
    );
    setIsUpdatingRole(true);

    updateAdminUserRole(userId, newRole)
      .then(() => {
        toast.success("User role updated");
      })
      .catch((error) => {
        console.error("Failed to update role", error);
        setUsers(previousUsers);
        toast.error("Failed to update role");
      })
      .finally(() => {
        setIsUpdatingRole(false);
        void loadUsers();
      });
  };

  const withTeamUpdate = (
    operation: Promise<unknown>,
    successMessage?: string,
  ) => {
    setIsUpdatingTeam(true);

    operation
      .then(() => {
        if (successMessage) {
          toast.success(successMessage);
        }
        return loadTeams();
      })
      .catch((error) => {
        console.error("Team operation failed", error);
        toast.error("Failed to update team data");
      })
      .finally(() => {
        setIsUpdatingTeam(false);
      });
  };

  const handleAddTeam = (name: string, managerId?: string | null) => {
    if (!managerId) {
      toast.error("Please select a team manager");
      return;
    }

    withTeamUpdate(
      createAdminTeam({ name, managerId, memberIds: [managerId] }),
      "Team created",
    );
  };

  const handleDeleteTeam = (id: string) => {
    withTeamUpdate(deleteAdminTeam(id), "Team deleted");
  };

  const handleToggleMember = (teamId: string, userId: string) => {
    const team = teams.find((item) => item.id === teamId);
    if (!team) {
      return;
    }

    const nextMemberIds = team.memberIds.includes(userId)
      ? team.memberIds.filter((memberId) => memberId !== userId)
      : [...team.memberIds, userId];

    withTeamUpdate(updateAdminTeam(teamId, { memberIds: nextMemberIds }));
  };

  const handleAddProject = (teamId: string, name: string) => {
    withTeamUpdate(createAdminProject(teamId, name), "Project added");
  };

  const handlePolicyChange = (updates: Partial<PolicySettings>) => {
    setPolicy((prev) => ({ ...prev, ...updates }));
  };

  const handleSavePolicy = () => {
    // TODO: PATCH /api/admin/policy { ...policy }
    toast.info("Policy save endpoint is not available yet");
  };

  const isCategoryMutationPending =
    updateCategoryMutation.isPending ||
    createCategoryMutation.isPending ||
    deleteCategoryMutation.isPending;

  const globalStatus = useMemo(() => {
    if (isCategoryMutationPending) return "Saving category changes...";
    if (isUpdatingRole) return "Saving user role changes...";
    if (isUpdatingTeam) return "Saving team changes...";
    if (isCategoriesFetching) return "Refreshing categories...";
    if (isUsersLoading) return "Loading users...";
    if (isTeamsLoading) return "Loading teams...";
    return null;
  }, [
    isCategoryMutationPending,
    isCategoriesFetching,
    isTeamsLoading,
    isUpdatingRole,
    isUpdatingTeam,
    isUsersLoading,
  ]);

  return {
    currentUserId,
    globalStatus,
    categories: {
      data: categories,
      isLoading: isCategoriesLoading,
      isError: isCategoriesError,
      retry: refetchCategories,
      onToggle: handleToggleCategory,
      onRename: handleRenameCategory,
      onAdd: handleAddCategory,
      onDelete: handleDeleteCategory,
    },
    users: {
      data: users,
      isLoading: isUsersLoading,
      error: usersError,
      retry: loadUsers,
      onRoleChange: handleRoleChange,
    },
    teams: {
      data: teams,
      isLoading: isTeamsLoading,
      error: teamsError,
      retry: loadTeams,
      onAddTeam: handleAddTeam,
      onDeleteTeam: handleDeleteTeam,
      onToggleMember: handleToggleMember,
      onAddProject: handleAddProject,
    },
    policy: {
      data: policy,
      onChange: handlePolicyChange,
      onSave: handleSavePolicy,
    },
  };
}
