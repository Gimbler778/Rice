import { useState } from "react";

import { Check, Plus, Trash2 } from "lucide-react";

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
  onAddTeam: (name: string) => void;
  onDeleteTeam: (id: string) => void;
  onToggleMember: (teamId: string, userId: string) => void;
};

export function TeamsTab({
  teams,
  users,
  onAddTeam,
  onDeleteTeam,
  onToggleMember,
}: TeamsTabProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");

  const handleAddTeam = () => {
    const trimmed = newTeamName.trim();
    if (!trimmed) {
      return;
    }

    onAddTeam(trimmed);
    setNewTeamName("");
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
              <CardTitle className="text-sm font-medium">{team.name}</CardTitle>
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
