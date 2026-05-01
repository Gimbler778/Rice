import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TabsContent } from "@/components/ui/tabs";
import { CategoriesTab } from "@/lib/admin/tabs/categories-tab";
import { PolicyTab } from "@/lib/admin/tabs/policy-tab";
import { TeamsTab } from "@/lib/admin/tabs/teams-tab";
import { UsersTab } from "@/lib/admin/tabs/users-tab";
import type {
  AdminCategory,
  AdminTeam,
  AdminUser,
  PolicySettings,
  UserRole,
} from "@/lib/admin/types";

type RetryErrorStateProps = {
  message: string;
  onRetry: () => void;
};

function RetryErrorState({ message, onRetry }: RetryErrorStateProps) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
      <p className="inline-flex items-center gap-2 text-destructive">
        <AlertCircle className="size-4" />
        {message}
      </p>
      <Button
        variant="outline"
        size="sm"
        className="mt-3 h-7 text-xs"
        onClick={onRetry}
      >
        Retry
      </Button>
    </div>
  );
}

type AdminTabPanelsProps = {
  currentUserId: string | null;
  categories: {
    data: AdminCategory[];
    isLoading: boolean;
    isError: boolean;
    retry: () => Promise<unknown>;
    onToggle: (id: string) => void;
    onRename: (id: string, name: string) => void;
    onAdd: (name: string) => void;
    onDelete: (id: string) => void;
  };
  users: {
    data: AdminUser[];
    isLoading: boolean;
    error: string | null;
    retry: () => Promise<void>;
    onRoleChange: (userId: string, newRole: UserRole) => void;
  };
  teams: {
    data: AdminTeam[];
    isLoading: boolean;
    error: string | null;
    retry: () => Promise<void>;
    onAddTeam: (name: string, managerId?: string | null) => void;
    onDeleteTeam: (id: string) => void;
    onToggleMember: (teamId: string, userId: string) => void;
    onAddProject: (teamId: string, name: string) => void;
  };
  policy: {
    data: PolicySettings;
    onChange: (updates: Partial<PolicySettings>) => void;
    onSave: () => void;
  };
};

export function AdminTabPanels({
  currentUserId,
  categories,
  users,
  teams,
  policy,
}: AdminTabPanelsProps) {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <TabsContent value="categories">
        {categories.isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        )}
        {!categories.isLoading && categories.isError && (
          <RetryErrorState
            message="Failed to load categories."
            onRetry={() => void categories.retry()}
          />
        )}
        {!categories.isLoading && !categories.isError && (
          <CategoriesTab
            categories={categories.data}
            onToggleCategory={categories.onToggle}
            onRenameCategory={categories.onRename}
            onAddCategory={categories.onAdd}
            onDeleteCategory={categories.onDelete}
          />
        )}
      </TabsContent>

      <TabsContent value="users">
        {users.isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-56 w-full" />
          </div>
        )}
        {!users.isLoading && users.error && (
          <RetryErrorState
            message={users.error}
            onRetry={() => void users.retry()}
          />
        )}
        {!users.isLoading && !users.error && (
          <UsersTab
            users={users.data}
            currentUserId={currentUserId}
            onRoleChange={users.onRoleChange}
          />
        )}
      </TabsContent>

      <TabsContent value="teams">
        {(teams.isLoading || users.isLoading) && (
          <div className="space-y-3">
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
        {!teams.isLoading &&
          !users.isLoading &&
          (teams.error || users.error) && (
            <RetryErrorState
              message={
                teams.error ?? users.error ?? "Failed to load team data."
              }
              onRetry={() => {
                void teams.retry();
                void users.retry();
              }}
            />
          )}
        {!teams.isLoading &&
          !users.isLoading &&
          !teams.error &&
          !users.error && (
            <TeamsTab
              teams={teams.data}
              users={users.data}
              onAddTeam={teams.onAddTeam}
              onDeleteTeam={teams.onDeleteTeam}
              onToggleMember={teams.onToggleMember}
              onAddProject={teams.onAddProject}
            />
          )}
      </TabsContent>

      <TabsContent value="policy">
        <PolicyTab
          policy={policy.data}
          onPolicyChange={policy.onChange}
          onSave={policy.onSave}
        />
      </TabsContent>
    </div>
  );
}
