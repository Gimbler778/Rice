import { useState } from "react";

import { Check, Plus, Trash2 } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { AdminTeam, AdminUser } from "../types";
import { SectionHeader } from "../ui";

type TeamsTabProps = {
  teams: AdminTeam[];
  users: AdminUser[];
  onAddTeam: (name: string, managerId?: string | null) => void;
  onDeleteTeam: (id: string) => void;
  onToggleMember: (teamId: string, userId: string) => void;
  onAddProject: (teamId: string, name: string) => void;
};

export function TeamsTab({
  teams,
  users,
  onAddTeam,
  onDeleteTeam,
  onToggleMember,
  onAddProject,
}: TeamsTabProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamManager, setNewTeamManager] = useState<string | null>(null);
  const [projectDrafts, setProjectDrafts] = useState<Record<string, string>>({});

  const handleAddTeam = () => {
    const trimmed = newTeamName.trim();
    if (!trimmed) {
      return;
    }

    // require manager selection
    onAddTeam(trimmed, newTeamManager);
    setNewTeamName("");
    setNewTeamManager(null);
    setShowAdd(false);
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
              onChange={(event) => setNewTeamName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && handleAddTeam()}
            />
            <div className="w-48">
              <Select value={newTeamManager ?? ""} onValueChange={(v) => setNewTeamManager(v || null)}>
                <SelectTrigger className="h-8 text-sm w-full text-left">
                  <SelectValue placeholder="Select manager" />
                </SelectTrigger>
                <SelectContent>
                  {users
                    .filter((u) => u.role === "manager" || u.role === "admin")
                    .map((u) => (
                    <SelectItem key={u.id} value={u.id} className="text-sm">
                      {u.name} {u.role === "admin" ? "(admin)" : "(manager)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              className="h-8 text-xs bg-teal-600 hover:bg-teal-700 text-white"
              onClick={handleAddTeam}
            >
              Create
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => setShowAdd(false)}
            >
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      {teams.map((team) => (
        <Card key={team.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-medium">{team.name}</CardTitle>
                {team.managerId && (
                  <div className="text-xs text-muted-foreground">Manager: {users.find((u) => u.id === team.managerId)?.name ?? "-"}</div>
                )}
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 hover:text-destructive"
                onClick={() => onDeleteTeam(team.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              {team.projects.map((project) => (
                <Badge key={project} variant="secondary" className="text-xs">
                  {project}
                </Badge>
              ))}
              <div className="flex items-center gap-1">
                <Input
                  value={projectDrafts[team.id] ?? ""}
                  onChange={(event) =>
                    setProjectDrafts((prev) => ({ ...prev, [team.id]: event.target.value }))
                  }
                  placeholder="Project name"
                  className="h-7 w-32 text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    const projectName = (projectDrafts[team.id] ?? "").trim();
                    if (!projectName) {
                      return;
                    }

                    onAddProject(team.id, projectName);
                    setProjectDrafts((prev) => ({ ...prev, [team.id]: "" }));
                  }}
                >
                  <Plus className="size-3 mr-1" /> Add project
                </Button>
              </div>
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
                    onClick={() => onToggleMember(team.id, user.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors",
                      isMember
                        ? "bg-teal-100 border-teal-300 text-teal-800 dark:bg-teal-900/40 dark:border-teal-700 dark:text-teal-200"
                        : "border-border text-muted-foreground hover:bg-muted",
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
