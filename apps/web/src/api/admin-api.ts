import { api } from "@/lib/api-client";
import type { ApiSuccessResponse } from "@/types/integrations";

import type { AdminTeam, UserRole } from "@/page/admin/types";

export type AdminUserRecord = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export type AdminUsersResponse = {
  users: AdminUserRecord[];
};

export type AdminTeamsResponse = {
  teams: AdminTeam[];
};

export async function fetchAdminUsers() {
  const response = await api.get<ApiSuccessResponse<AdminUsersResponse>>("/api/admin/users");
  return response.data.users;
}

export async function updateAdminUserRole(userId: string, role: UserRole) {
  const response = await api.patch<ApiSuccessResponse<{ id: string; role: UserRole }>>(
    `/api/admin/users/${userId}/role`,
    { role },
  );
  return response.data;
}

export async function fetchAdminTeams() {
  const response = await api.get<ApiSuccessResponse<AdminTeamsResponse>>("/api/admin/teams");
  return response.data.teams;
}

export async function createAdminTeam(payload: {
  name: string;
  managerId: string;
  memberIds?: string[];
}) {
  const response = await api.post<ApiSuccessResponse<{ team: AdminTeam }>, typeof payload>(
    "/api/admin/teams",
    payload,
  );
  return response.data.team;
}

export async function updateAdminTeam(
  teamId: string,
  payload: Partial<Pick<AdminTeam, "name" | "managerId" | "memberIds">>,
) {
  const response = await api.patch<ApiSuccessResponse<{ team: AdminTeam }>>(
    `/api/admin/teams/${teamId}`,
    payload,
  );
  return response.data.team;
}

export async function deleteAdminTeam(teamId: string) {
  await api.delete<ApiSuccessResponse<{ id: string }>>(`/api/admin/teams/${teamId}`);
}

export async function createAdminProject(teamId: string, name: string) {
  const response = await api.post<ApiSuccessResponse<{ team: AdminTeam }>, { name: string }>(
    `/api/admin/teams/${teamId}/projects`,
    { name },
  );
  return response.data.team;
}

export async function deleteAdminProject(teamId: string, projectName: string) {
  await api.delete<ApiSuccessResponse<{ teamId: string; projectName: string }>>(
    `/api/admin/teams/${teamId}/projects/${encodeURIComponent(projectName)}`,
  );
}
