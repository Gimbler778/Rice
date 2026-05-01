import { Bell, Check, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { useMarkAllRead, useMarkRead, useNotifications } from "@/hooks/use-notifications";
import { PageContainer } from "@/components/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function FollowUpsPage() {
  const { data: notifications = [], isLoading } = useNotifications();
  const { mutate: markRead } = useMarkRead();
  const { mutate: markAllRead, isPending: isMarkingAll } = useMarkAllRead();

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <PageContainer className="flex max-w-4xl flex-col gap-6 p-4 sm:p-6 mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Follow-ups</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Important updates requiring your attention.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllRead()}
            disabled={isMarkingAll}
          >
            <Check className="size-4 mr-2" />
            Mark all read
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : notifications.length === 0 ? (
          <Card className="border-dashed bg-transparent">
            <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
              <Bell className="mb-4 size-8 opacity-20" />
              <p>You're all caught up!</p>
              <p className="text-xs mt-1">No new follow-ups at this time.</p>
            </CardContent>
          </Card>
        ) : (
          notifications.map((notification) => (
            <Card
              key={notification.id}
              className={cn(
                "transition-colors",
                notification.read
                  ? "bg-transparent opacity-60 border-border/50"
                  : "bg-card border-blue-500/20 shadow-sm"
              )}
            >
              <CardContent className="p-4 sm:p-5 flex gap-4">
                <div className="mt-1 shrink-0">
                  {notification.read ? (
                    <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                      <Bell className="size-4 text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="flex size-8 items-center justify-center rounded-full bg-blue-500/10 text-blue-600">
                      <Bell className="size-4" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3
                        className={cn(
                          "font-medium tracking-tight",
                          notification.read ? "text-foreground/80" : "text-foreground"
                        )}
                      >
                        {notification.title}
                      </h3>
                      <p
                        className={cn(
                          "mt-1 text-sm leading-relaxed",
                          notification.read ? "text-muted-foreground" : "text-foreground/90"
                        )}
                      >
                        {notification.message}
                      </p>
                    </div>
                    {!notification.read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs shrink-0"
                        onClick={() => markRead(notification.id)}
                      >
                        Mark read
                      </Button>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </PageContainer>
  );
}
