import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/api/notifications-api";
import { queryKeys } from "@/lib/query-keys";

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: queryKeys.notifications.all(),
    queryFn: fetchNotifications,
    enabled,
    refetchInterval: 30_000, // poll every 30s
  });
}

export function useUnreadCount(enabled = true) {
  const { data } = useNotifications(enabled);
  return (data ?? []).filter((n) => !n.read).length;
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() });
    },
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() });
    },
  });
}
