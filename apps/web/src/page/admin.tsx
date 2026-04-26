// =============================================================================
// RICE — Admin Panel (/admin)
// =============================================================================
// Tabbed admin interface covering:
//   1. Categories    — add / edit / disable work categories
//   2. Users         — view all users, assign/change roles
//   3. Teams         — assign members to teams and projects
//   4. Integrations  — JIRA + Bitbucket OAuth connect / disconnect
//   5. Policy        — reminder times, submission cadence, data retention
//
// All data is mock for now. Replace mock* values with useQuery hooks.
//
// API endpoints this page will consume:
//   GET    /api/admin/categories           → list categories
//   POST   /api/admin/categories           → create category
//   PATCH  /api/admin/categories/:id       → edit / disable category
//   GET    /api/admin/users                → list all users with roles
//   PATCH  /api/admin/users/:id/role       → change user role
//                                            (400 if last admin)
//   GET    /api/admin/teams                → list teams + members
//   POST   /api/admin/teams               → create team
//   PATCH  /api/admin/teams/:id           → edit team / members
//   GET    /api/admin/integrations        → JIRA + BB connection status
//   POST   /api/admin/integrations/jira/disconnect
//   POST   /api/admin/integrations/bitbucket/disconnect
//   GET    /api/admin/policy              → get policy settings
//   PATCH  /api/admin/policy             → update policy settings
// =============================================================================

import { useState } from "react";
import {
  Tag,
  Users,
  GitBranch,
  Plug,
  Settings,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";

// =============================================================================
// Types
// =============================================================================

type UserRole = "developer" | "manager" | "admin" | "auditor";

interface AdminCategory {
  id: string;
  name: string;
  color: string; // tailwind bg class for the swatch
  isDefault: boolean;
  isEnabled: boolean;
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarInitials: string;
  lastActive: string; // display string
  isCurrentUser?: boolean;
}

interface AdminTeam {
  id: string;
  name: string;
  memberIds: string[];
  projects: string[];
}

interface IntegrationStatus {
  jira: { connected: boolean; org?: string; connectedAt?: string };
  bitbucket: { connected: boolean; org?: string; connectedAt?: string };
}

interface PolicySettings {
  dailyReminderTime: string; // "HH:MM"
  weeklyReminderDay: string; // "friday"
  weeklyReminderTime: string;
  submissionCadence: "weekly" | "biweekly";
  dataRetentionMonths: number;
  lockAfterApproval: boolean;
}

// =============================================================================
// Mock data — replace with useQuery calls
// =============================================================================

const MOCK_CATEGORIES: AdminCategory[] = [
  { id: "cat-1", name: "Development",   color: "bg-teal-500",   isDefault: true,  isEnabled: true },
  { id: "cat-2", name: "Code review",   color: "bg-purple-500", isDefault: true,  isEnabled: true },
  { id: "cat-3", name: "Testing",       color: "bg-blue-400",   isDefault: true,  isEnabled: true },
  { id: "cat-4", name: "Documentation", color: "bg-amber-400",  isDefault: true,  isEnabled: true },
  { id: "cat-5", name: "Meetings",      color: "bg-zinc-400",   isDefault: true,  isEnabled: true },
  { id: "cat-6", name: "Admin",         color: "bg-zinc-500",   isDefault: true,  isEnabled: true },
  { id: "cat-7", name: "Org sessions",  color: "bg-pink-400",   isDefault: true,  isEnabled: true },
  { id: "cat-8", name: "Events",        color: "bg-orange-400", isDefault: true,  isEnabled: true },
  { id: "cat-9", name: "Support",       color: "bg-red-400",    isDefault: true,  isEnabled: true },
  { id: "cat-10",name: "Learning",      color: "bg-green-400",  isDefault: true,  isEnabled: true },
];

const MOCK_USERS: AdminUser[] = [
  { id: "u1", name: "Nirav Shah",    email: "nirav@iqm.com",   role: "admin",     avatarInitials: "NS", lastActive: "Today",      isCurrentUser: false },
  { id: "u2", name: "Devansh Kumar", email: "devansh@iqm.com", role: "developer", avatarInitials: "DK", lastActive: "Today",      isCurrentUser: true  },
  { id: "u3", name: "Aditya Mehta",  email: "aditya@iqm.com",  role: "developer", avatarInitials: "AM", lastActive: "Yesterday",  isCurrentUser: false },
  { id: "u4", name: "Nikhil Rao",    email: "nikhil@iqm.com",  role: "developer", avatarInitials: "NR", lastActive: "2 days ago", isCurrentUser: false },
];

const MOCK_TEAMS: AdminTeam[] = [
  { id: "t1", name: "RICE Squad",     memberIds: ["u1", "u2", "u3", "u4"], projects: ["RICE", "Internal tools"] },
  { id: "t2", name: "Platform team",  memberIds: ["u1"],                   projects: ["Infra"] },
];

const MOCK_INTEGRATIONS: IntegrationStatus = {
  jira:      { connected: true,  org: "iQM",  connectedAt: "Mar 15, 2026" },
  bitbucket: { connected: false },
};

const MOCK_POLICY: PolicySettings = {
  dailyReminderTime:  "17:00",
  weeklyReminderDay:  "friday",
  weeklyReminderTime: "16:00",
  submissionCadence:  "weekly",
  dataRetentionMonths: 12,
  lockAfterApproval:  true,
};

// =============================================================================
// Role badge
// =============================================================================

const ROLE_BADGE: Record<UserRole, string> = {
  admin:     "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  manager:   "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  developer: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  auditor:   "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize", ROLE_BADGE[role])}>
      {role}
    </span>
  );
}

// =============================================================================
// Tab button
// =============================================================================

interface TabButtonProps {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
}

function TabButton({ icon: Icon, label, active, onClick }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
        active
          ? "bg-background text-foreground shadow-sm border border-border"
          : "text-muted-foreground hover:text-foreground hover:bg-background/60"
      )}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </button>
  );
}

// =============================================================================
// Section header
// =============================================================================

function SectionHeader({ title, description, action }: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  );
}

// =============================================================================
// Tab 1 — Categories
// =============================================================================

function CategoriesTab() {
  // TODO: const { data: categories } = useQuery({ queryKey: ['admin', 'categories'], queryFn: ... })
  const [categories, setCategories] = useState<AdminCategory[]>(MOCK_CATEGORIES);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");

  const adminCount = categories.filter((c) => c.isEnabled).length;

  const handleToggle = (id: string) => {
    // TODO: PATCH /api/admin/categories/:id { isEnabled: !current }
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isEnabled: !c.isEnabled } : c))
    );
  };

  const handleStartEdit = (cat: AdminCategory) => {
    setEditingId(cat.id);
    setEditName(cat.name);
  };

  const handleSaveEdit = (id: string) => {
    if (!editName.trim()) return;
    // TODO: PATCH /api/admin/categories/:id { name: editName }
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name: editName.trim() } : c))
    );
    setEditingId(null);
  };

  const handleAdd = () => {
    if (!newName.trim()) return;
    // TODO: POST /api/admin/categories { name: newName }
    const newCat: AdminCategory = {
      id: `cat-${Date.now()}`,
      name: newName.trim(),
      color: "bg-zinc-400",
      isDefault: false,
      isEnabled: true,
    };
    setCategories((prev) => [...prev, newCat]);
    setNewName("");
    setShowAdd(false);
  };

  return (
    <div>
      <SectionHeader
        title="Work categories"
        description="Manage the categories developers can log time against. Default categories can be disabled but not deleted."
        action={
          <Button
            size="sm"
            className="h-7 text-xs bg-teal-600 hover:bg-teal-700 text-white"
            onClick={() => setShowAdd(true)}
          >
            <Plus className="size-3 mr-1" />
            Add category
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground w-8"></th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground w-20">Enabled</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Add new row */}
              {showAdd && (
                <tr className="border-b bg-teal-50/40 dark:bg-teal-950/20">
                  <td className="px-4 py-2"><div className="size-3 rounded-full bg-zinc-400" /></td>
                  <td className="px-4 py-2">
                    <Input
                      autoFocus
                      className="h-7 text-xs w-48"
                      placeholder="Category name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-xs text-muted-foreground">Custom</span>
                  </td>
                  <td />
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="size-7" onClick={handleAdd}>
                        <Check className="size-3 text-teal-600" />
                      </Button>
                      <Button size="icon" variant="ghost" className="size-7" onClick={() => setShowAdd(false)}>
                        <X className="size-3 text-muted-foreground" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )}

              {categories.map((cat) => (
                <tr
                  key={cat.id}
                  className={cn(
                    "border-b last:border-b-0 transition-colors",
                    !cat.isEnabled && "opacity-50",
                    "hover:bg-muted/30"
                  )}
                >
                  {/* Colour swatch */}
                  <td className="px-4 py-2.5">
                    <div className={cn("size-3 rounded-full", cat.color)} />
                  </td>

                  {/* Name — editable */}
                  <td className="px-4 py-2.5">
                    {editingId === cat.id ? (
                      <Input
                        autoFocus
                        className="h-7 text-xs w-48"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit(cat.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                    ) : (
                      <span className="text-sm font-medium">{cat.name}</span>
                    )}
                  </td>

                  {/* Type */}
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">
                      {cat.isDefault ? "Default" : "Custom"}
                    </span>
                  </td>

                  {/* Toggle */}
                  <td className="px-4 py-2.5 text-center">
                    <Switch
                      checked={cat.isEnabled}
                      onCheckedChange={() => handleToggle(cat.id)}
                      className="scale-75"
                    />
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-2.5">
                    {editingId === cat.id ? (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="size-7" onClick={() => handleSaveEdit(cat.id)}>
                          <Check className="size-3 text-teal-600" />
                        </Button>
                        <Button size="icon" variant="ghost" className="size-7" onClick={() => setEditingId(null)}>
                          <X className="size-3 text-muted-foreground" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={() => handleStartEdit(cat)}
                        disabled={!cat.isEnabled}
                      >
                        <Pencil className="size-3" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground mt-2">
        {adminCount} of {categories.length} categories enabled
      </p>
    </div>
  );
}

// =============================================================================
// Tab 2 — Users
// =============================================================================

function UsersTab() {
  // TODO: const { data: users } = useQuery({ queryKey: ['admin', 'users'], queryFn: ... })
  const [users, setUsers] = useState<AdminUser[]>(MOCK_USERS);
  const { data: session } = authClient.useSession();

  // Count of admins — used to enforce the "at least 1 admin" rule
  const adminCount = users.filter((u) => u.role === "admin").length;

  const handleRoleChange = (userId: string, newRole: UserRole) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;

    // Safety: block demotion if this user is the last admin
    if (user.role === "admin" && newRole !== "admin" && adminCount <= 1) {
      // This should not be reachable because the dropdown is disabled,
      // but guard here too just in case.
      return;
    }

    // TODO: PATCH /api/admin/users/:id/role { role: newRole }
    // The API also enforces the last-admin rule server-side (returns 400).
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
    );
  };

  const isLastAdmin = (user: AdminUser) =>
    user.role === "admin" && adminCount <= 1;

  return (
    <div>
      <SectionHeader
        title="User management"
        description="All users who have signed in via Atlassian OAuth. Default role for new users is Developer."
      />

      {/* Last-admin safety notice */}
      {adminCount <= 1 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-4 py-2.5 mb-4 text-sm text-amber-800 dark:text-amber-300">
          <Shield className="size-4 shrink-0 mt-0.5" />
          <span>
            There is only <strong>1 admin</strong> in this organisation. Promote another user before
            changing this admin's role.
          </span>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">User</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground w-28">Role</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground w-28">Last active</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground w-36">Change role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isLast = isLastAdmin(user);
                return (
                  <tr key={user.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                    {/* Avatar + name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="size-7 rounded-full bg-teal-100 dark:bg-teal-900 flex items-center justify-center text-xs font-semibold text-teal-800 dark:text-teal-200 shrink-0">
                          {user.avatarInitials}
                        </div>
                        <div>
                          <span className="text-sm font-medium">{user.name}</span>
                          {user.isCurrentUser && (
                            <span className="ml-1.5 text-[10px] text-muted-foreground">(you)</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Email */}
                    <td className="px-4 py-3 text-xs text-muted-foreground truncate">
                      {user.email}
                    </td>

                    {/* Current role badge */}
                    <td className="px-4 py-3">
                      <RoleBadge role={user.role} />
                    </td>

                    {/* Last active */}
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {user.lastActive}
                    </td>

                    {/* Role change dropdown */}
                    <td className="px-4 py-3">
                      <div className="relative group/role">
                        <Select
                          value={user.role}
                          onValueChange={(v) => handleRoleChange(user.id, v as UserRole)}
                          // Disable for last admin or if viewing own row (can't self-demote)
                          disabled={isLast || user.isCurrentUser}
                        >
                          <SelectTrigger className="h-7 text-xs w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="developer" className="text-xs">Developer</SelectItem>
                            <SelectItem value="manager" className="text-xs">Manager</SelectItem>
                            <SelectItem value="admin" className="text-xs">Admin</SelectItem>
                            <SelectItem value="auditor" className="text-xs">Auditor</SelectItem>
                          </SelectContent>
                        </Select>
                        {/* Tooltip for disabled states */}
                        {(isLast || user.isCurrentUser) && (
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
        {users.length} users · {adminCount} admin{adminCount !== 1 ? "s" : ""} · New users default to Developer role
      </p>
    </div>
  );
}

// =============================================================================
// Tab 3 — Teams & projects
// =============================================================================

function TeamsTab() {
  // TODO: const { data: teams } = useQuery({ queryKey: ['admin', 'teams'], queryFn: ... })
  const [teams, setTeams] = useState<AdminTeam[]>(MOCK_TEAMS);
  const [users] = useState<AdminUser[]>(MOCK_USERS);
  const [showAdd, setShowAdd] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newProject, setNewProject] = useState("");

  const getUserName = (id: string) =>
    users.find((u) => u.id === id)?.name ?? id;

  const handleAddTeam = () => {
    if (!newTeamName.trim()) return;
    // TODO: POST /api/admin/teams { name: newTeamName }
    setTeams((prev) => [
      ...prev,
      { id: `t-${Date.now()}`, name: newTeamName.trim(), memberIds: [], projects: [] },
    ]);
    setNewTeamName("");
    setShowAdd(false);
  };

  const handleDeleteTeam = (id: string) => {
    // TODO: DELETE /api/admin/teams/:id
    setTeams((prev) => prev.filter((t) => t.id !== id));
  };

  const handleToggleMember = (teamId: string, userId: string) => {
    // TODO: PATCH /api/admin/teams/:id { memberIds: [...] }
    setTeams((prev) =>
      prev.map((t) => {
        if (t.id !== teamId) return t;
        const has = t.memberIds.includes(userId);
        return {
          ...t,
          memberIds: has
            ? t.memberIds.filter((id) => id !== userId)
            : [...t.memberIds, userId],
        };
      })
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Teams & projects"
        description="Organise users into teams and assign them to projects for grouped reporting."
        action={
          <Button
            size="sm"
            className="h-7 text-xs bg-teal-600 hover:bg-teal-700 text-white"
            onClick={() => setShowAdd(true)}
          >
            <Plus className="size-3 mr-1" />
            New team
          </Button>
        }
      />

      {showAdd && (
        <Card className="border-teal-200 dark:border-teal-800">
          <CardContent className="pt-4 flex items-center gap-2">
            <Input
              autoFocus
              className="h-8 text-sm flex-1"
              placeholder="Team name"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddTeam()}
            />
            <Button size="sm" className="h-8 text-xs bg-teal-600 hover:bg-teal-700 text-white" onClick={handleAddTeam}>
              Create
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      {teams.map((team) => (
        <Card key={team.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">{team.name}</CardTitle>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 hover:text-destructive"
                onClick={() => handleDeleteTeam(team.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            {/* Projects */}
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              {team.projects.map((p) => (
                <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
              ))}
              <button className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                <Plus className="size-3" /> project
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs font-medium text-muted-foreground mb-2">Members</p>
            <div className="flex flex-wrap gap-2">
              {users.map((user) => {
                const isMember = team.memberIds.includes(user.id);
                return (
                  <button
                    key={user.id}
                    onClick={() => handleToggleMember(team.id, user.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors",
                      isMember
                        ? "bg-teal-100 border-teal-300 text-teal-800 dark:bg-teal-900/40 dark:border-teal-700 dark:text-teal-200"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {isMember && <Check className="size-3" />}
                    {user.name}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// =============================================================================
// Tab 4 — Integrations
// =============================================================================

function IntegrationsTab() {
  // TODO: const { data: integrations } = useQuery({ queryKey: ['admin', 'integrations'], queryFn: ... })
  const [integrations, setIntegrations] = useState<IntegrationStatus>(MOCK_INTEGRATIONS);

  const handleDisconnect = (service: "jira" | "bitbucket") => {
    // TODO: POST /api/admin/integrations/:service/disconnect
    setIntegrations((prev) => ({
      ...prev,
      [service]: { connected: false },
    }));
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Integrations"
        description="Manage JIRA and Bitbucket OAuth connections. These are org-level connections used for the suggestion sync engine."
      />

      {/* JIRA */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <span className="size-5 rounded bg-blue-600 flex items-center justify-center text-white text-[9px] font-bold shrink-0">J</span>
                Atlassian JIRA
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Syncs issue transitions, comments, and assignments to power the suggestions panel.
                Polls every 30 minutes via node-cron.
              </CardDescription>
            </div>
            {integrations.jira.connected ? (
              <CheckCircle2 className="size-5 text-teal-500 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="size-5 text-muted-foreground shrink-0 mt-0.5" />
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {integrations.jira.connected ? (
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                Connected to <strong className="text-foreground">{integrations.jira.org}</strong>
                {integrations.jira.connectedAt && ` · since ${integrations.jira.connectedAt}`}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs hover:border-destructive hover:text-destructive"
                onClick={() => handleDisconnect("jira")}
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Not connected</p>
              {/* TODO: trigger Atlassian OAuth flow → /api/auth/atlassian */}
              <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white">
                Connect JIRA
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bitbucket */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <span className="size-5 rounded bg-blue-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0">B</span>
                Bitbucket
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Syncs commits, PRs opened/merged, and PR reviews to surface Development and Code Review suggestions.
              </CardDescription>
            </div>
            {integrations.bitbucket.connected ? (
              <CheckCircle2 className="size-5 text-teal-500 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="size-5 text-muted-foreground shrink-0 mt-0.5" />
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {integrations.bitbucket.connected ? (
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                Connected to <strong className="text-foreground">{integrations.bitbucket.org}</strong>
                {integrations.bitbucket.connectedAt && ` · since ${integrations.bitbucket.connectedAt}`}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs hover:border-destructive hover:text-destructive"
                onClick={() => handleDisconnect("bitbucket")}
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Not connected</p>
              {/* TODO: trigger Bitbucket OAuth flow → /api/auth/bitbucket */}
              <Button size="sm" className="h-7 text-xs bg-blue-500 hover:bg-blue-600 text-white">
                Connect Bitbucket
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Note:</strong> These are org-level OAuth connections.
        Individual users may also connect their personal Atlassian account for per-user sync.
        Per-user connections are managed from the profile settings page.
      </div>
    </div>
  );
}

// =============================================================================
// Tab 5 — Policy settings
// =============================================================================

function PolicyTab() {
  // TODO: const { data: policy } = useQuery({ queryKey: ['admin', 'policy'], queryFn: ... })
  const [policy, setPolicy] = useState<PolicySettings>(MOCK_POLICY);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // TODO: PATCH /api/admin/policy { ...policy }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const Field = ({ label, description, children }: {
    label: string;
    description?: string;
    children: ReactNode;
  }) => (
    <div className="flex items-start justify-between gap-6 py-4 border-b last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );

  return (
    <div>
      <SectionHeader
        title="Policy settings"
        description="Configure organisation-wide defaults for reminders, submission cadence, and data handling."
      />

      <Card>
        <CardContent className="pt-4">
          <Field
            label="Daily reminder time"
            description="Sends a Resend email reminder to developers who haven't logged today. Weekdays only."
          >
            <Input
              type="time"
              className="h-8 text-xs w-32"
              value={policy.dailyReminderTime}
              onChange={(e) => setPolicy((p) => ({ ...p, dailyReminderTime: e.target.value }))}
            />
          </Field>

          <Field
            label="Weekly submission reminder"
            description="Sends a Friday reminder email to developers who haven't submitted their week."
          >
            <div className="flex items-center gap-2">
              <Select
                value={policy.weeklyReminderDay}
                onValueChange={(v) => setPolicy((p) => ({ ...p, weeklyReminderDay: v }))}
              >
                <SelectTrigger className="h-8 text-xs w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["monday","tuesday","wednesday","thursday","friday"].map((d) => (
                    <SelectItem key={d} value={d} className="text-xs capitalize">{d.charAt(0).toUpperCase() + d.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">at</span>
              <Input
                type="time"
                className="h-8 text-xs w-28"
                value={policy.weeklyReminderTime}
                onChange={(e) => setPolicy((p) => ({ ...p, weeklyReminderTime: e.target.value }))}
              />
            </div>
          </Field>

          <Field
            label="Submission cadence"
            description="How often developers are expected to submit their timesheets."
          >
            <Select
              value={policy.submissionCadence}
              onValueChange={(v) => setPolicy((p) => ({ ...p, submissionCadence: v as PolicySettings["submissionCadence"] }))}
            >
              <SelectTrigger className="h-8 text-xs w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly" className="text-xs">Weekly</SelectItem>
                <SelectItem value="biweekly" className="text-xs">Bi-weekly</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Data retention"
            description="How long timesheet data is kept before being archived. Minimum 6 months."
          >
            <div className="flex items-center gap-2">
              <Select
                value={String(policy.dataRetentionMonths)}
                onValueChange={(v) => setPolicy((p) => ({ ...p, dataRetentionMonths: Number(v) }))}
              >
                <SelectTrigger className="h-8 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[6, 12, 18, 24, 36].map((m) => (
                    <SelectItem key={m} value={String(m)} className="text-xs">
                      {m} months
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Field>

          <Field
            label="Lock entries after approval"
            description="When a manager approves a week, the developer can no longer edit their entries."
          >
            <Switch
              checked={policy.lockAfterApproval}
              onCheckedChange={(v) => setPolicy((p) => ({ ...p, lockAfterApproval: v }))}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2 mt-4">
        {saved && (
          <div className="flex items-center gap-1.5 text-xs text-teal-600 dark:text-teal-400">
            <CheckCircle2 className="size-3.5" />
            Saved
          </div>
        )}
        <Button
          size="sm"
          className="h-7 text-xs bg-teal-600 hover:bg-teal-700 text-white"
          onClick={handleSave}
        >
          Save changes
        </Button>
      </div>
    </div>
  );
}

// Missing ReactNode import
import type { ReactNode } from "react";

// =============================================================================
// Admin Page — main export
// =============================================================================

type AdminTab = "categories" | "users" | "teams" | "integrations" | "policy";

const TABS: { id: AdminTab; label: string; icon: React.ElementType }[] = [
  { id: "categories",   label: "Categories",      icon: Tag         },
  { id: "users",        label: "Users",            icon: Users       },
  { id: "teams",        label: "Teams & projects", icon: GitBranch   },
  { id: "integrations", label: "Integrations",     icon: Plug        },
  { id: "policy",       label: "Policy",           icon: Settings    },
];

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>("categories");

  return (
    <div className="flex flex-col h-full">
      {/* ------------------------------------------------------------------ */}
      {/* Page header */}
      {/* ------------------------------------------------------------------ */}
      <div className="border-b px-6 py-4 shrink-0">
        <h1 className="text-sm font-semibold">Admin panel</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage categories, users, teams, integrations, and org-wide policy.
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tab nav */}
      {/* ------------------------------------------------------------------ */}
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

      {/* ------------------------------------------------------------------ */}
      {/* Tab content */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {activeTab === "categories"   && <CategoriesTab />}
        {activeTab === "users"        && <UsersTab />}
        {activeTab === "teams"        && <TeamsTab />}
        {activeTab === "integrations" && <IntegrationsTab />}
        {activeTab === "policy"       && <PolicyTab />}
      </div>
    </div>
  );
}
