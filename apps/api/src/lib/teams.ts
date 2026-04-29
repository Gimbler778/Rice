import { AtlassianApiError } from "@/lib/jira";
import logger from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────

export type AtlassianTeam = {
  teamId: string;
  displayName: string;
  description: string;
  state: "ACTIVE" | "ARCHIVED" | "DELETED";
  teamType: "OPEN" | "MEMBER_INVITE" | "EXTERNAL";
  organizationId: string;
  creatorId?: string;
};

export type AtlassianTeamMember = {
  accountId: string;
};

export type TeamWithMembers = AtlassianTeam & {
  members: AtlassianTeamMember[];
};

type TeamsListResponse = {
  cursor?: string | null;
  entities?: AtlassianTeam[];
};

type TeamMembersResponse = {
  pageInfo?: {
    hasNextPage?: boolean;
    endCursor?: string | null;
  };
  members?: AtlassianTeamMember[];
};

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Resolve the Atlassian organization ID from the accessible-resources endpoint.
 * Each accessible resource has an `id` (cloudId) which maps back to an org.
 * However, the Teams API needs `orgId` — which is NOT the same as `cloudId`.
 * The orgId must be configured via ATLASSIAN_ORG_ID env var, or we can try
 * to resolve it from the /admin/v1/orgs endpoint if the user has admin access.
 */

// ── API Functions ──────────────────────────────────────────────────

const TEAMS_BASE = "https://api.atlassian.com/public/teams/v1";

/**
 * Fetch all teams in an Atlassian organization.
 * GET /public/teams/v1/org/{orgId}/teams
 * Scope: read:team:jira
 */
export async function fetchAllAtlassianTeams(
  accessToken: string,
  orgId: string,
): Promise<AtlassianTeam[]> {
  const allTeams: AtlassianTeam[] = [];
  let cursor: string | undefined;

  while (true) {
    const url = new URL(`${TEAMS_BASE}/org/${orgId}/teams`);
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AtlassianApiError(
        response.status,
        `Unable to fetch Atlassian teams (${response.status}): ${errorText || response.statusText}`,
      );
    }

    const payload = (await response.json()) as TeamsListResponse;
    const teams = (payload.entities ?? []).filter(
      (team) => team.state === "ACTIVE",
    );
    allTeams.push(...teams);

    if (!payload.cursor) {
      break;
    }

    cursor = payload.cursor;
  }

  return allTeams;
}

/**
 * Fetch members of a specific team.
 * POST /public/teams/v1/org/{orgId}/teams/{teamId}/members
 * Scope: read:team:jira
 */
export async function fetchTeamMembers(
  accessToken: string,
  orgId: string,
  teamId: string,
): Promise<AtlassianTeamMember[]> {
  const allMembers: AtlassianTeamMember[] = [];
  let after: string | undefined;

  while (true) {
    const response = await fetch(
      `${TEAMS_BASE}/org/${orgId}/teams/${teamId}/members`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          ...(after ? { after } : {}),
          first: 100,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new AtlassianApiError(
        response.status,
        `Unable to fetch team members for team ${teamId} (${response.status}): ${errorText || response.statusText}`,
      );
    }

    const payload = (await response.json()) as TeamMembersResponse;
    allMembers.push(...(payload.members ?? []));

    if (!payload.pageInfo?.hasNextPage || !payload.pageInfo?.endCursor) {
      break;
    }

    after = payload.pageInfo.endCursor;
  }

  return allMembers;
}

/**
 * Fetch all teams with their members.
 */
export async function fetchTeamsWithMembers(
  accessToken: string,
  orgId: string,
): Promise<TeamWithMembers[]> {
  const teams = await fetchAllAtlassianTeams(accessToken, orgId);
  const teamsWithMembers: TeamWithMembers[] = [];

  for (const team of teams) {
    try {
      const members = await fetchTeamMembers(accessToken, orgId, team.teamId);
      teamsWithMembers.push({ ...team, members });
    } catch (error) {
      logger.warn(
        { err: error, teamId: team.teamId, teamName: team.displayName },
        "Failed to fetch members for team, including with empty members",
      );
      teamsWithMembers.push({ ...team, members: [] });
    }
  }

  return teamsWithMembers;
}
