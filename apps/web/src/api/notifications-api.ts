import { api } from "@/lib/api-client";
import type { ApiSuccessResponse } from "@/types/integrations";

export type NotificationType =
  | "team_assigned"
  | "manager_assigned"
  | "report_approved"
  | "report_dismissed"
  | "report_submitted"
  | "role_changed";

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
};

export type NotificationsResponse = {
  notifications: AppNotification[];
};

export async function fetchNotifications(): Promise<AppNotification[]> {
  const response = await api.get<ApiSuccessResponse<NotificationsResponse>>(
    "/api/notifications",
  );
  return response.data.notifications;
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.patch<ApiSuccessResponse<{ id: string }>>(
    `/api/notifications/${id}/read`,
  );
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.patch<ApiSuccessResponse<Record<string, never>>>(
    "/api/notifications/read-all",
  );
}
