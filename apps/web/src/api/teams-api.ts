import { api } from "@/lib/api-client";
import type { ApiSuccessResponse } from "@/types/integrations";

// ── Types ──────────────────────────────────────────────────────────

export type AtlassianTeam = {
  teamId: string;
  displayName: string;
  description: string;
  state: "ACTIVE" | "ARCHIVED" | "DELETED";
  teamType: "OPEN" | "MEMBER_INVITE" | "EXTERNAL";
  organizationId: string;
};

export type TeamsListResponse = {
  teams: AtlassianTeam[];
  orgId: string;
};

export type TeamMemberAggregate = {
  accountId: string;
  displayName: string | null;
  totalIssues: number;
  totalTimeSpentSeconds: number;
  issuesByStatus: Record<string, number>;
  issuesByType: Record<string, number>;
  issuesByProject: Record<string, number>;
  timeByCategory: Record<string, number>;
  timeByType: Record<string, number>;
  timeByProject: Record<string, number>;
};

export type TeamReportResponse = {
  teamId: string;
  memberCount: number;
  totalIssues: number;
  totalTimeSpentSeconds: number;
  issuesByStatus: Record<string, number>;
  issuesByType: Record<string, number>;
  issuesByProject: Record<string, number>;
  timeByCategory: Record<string, number>;
  timeByType: Record<string, number>;
  timeByProject: Record<string, number>;
  members: TeamMemberAggregate[];
};

// ── API Functions ──────────────────────────────────────────────────

export async function fetchTeams() {
  const response = await api.get<ApiSuccessResponse<TeamsListResponse>>(
    "/api/integrations/teams",
  );
  return response.data;
}

export async function fetchTeamReport(teamId: string, period?: string) {
  const response = await api.get<ApiSuccessResponse<TeamReportResponse>>(
    `/api/integrations/team-report/${teamId}`,
    {
      params: period ? { period } : undefined,
    },
  );
  return response.data;
}
