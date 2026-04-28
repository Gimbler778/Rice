import { Outlet, useLocation } from "react-router-dom";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { useIntegrationStatus } from "@/hooks/use-integrations";
import { authClient } from "@/lib/auth-client";

export function RootLayout() {
  const location = useLocation();
  const isAuthPage = location.pathname === "/";
  const isIntegrationPopupPage = location.pathname === "/profile/integration-popup";
  const title = location.pathname === "/" ? "Sign in" : "Workspace";
  const { data: session } = authClient.useSession();
  const integrationStatusQuery = useIntegrationStatus(
    !isAuthPage && !isIntegrationPopupPage && Boolean(session?.user?.id),
  );
  const integrationStatus = integrationStatusQuery.data;
  const shouldShowIntegrationWarning =
    !isAuthPage &&
    !isIntegrationPopupPage &&
    integrationStatusQuery.isSuccess &&
    (integrationStatus?.atlassianConnected !== true ||
      integrationStatus?.bitbucketConnected !== true);

  return (
    <SidebarProvider>
      {!isAuthPage && !isIntegrationPopupPage ? <AppSidebar /> : null}
      <SidebarInset>
        {shouldShowIntegrationWarning ? (
          <div className="sticky top-0 z-70 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive sm:px-6">
            <div className="mx-auto flex w-full items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" />
              <p className="truncate">
                Connect Atlassian and Bitbucket to enable full integrations.{" "}
                <Link to="/profile" className="font-medium underline underline-offset-2">
                  Open profile
                </Link>
              </p>
            </div>
          </div>
        ) : null}
        <header className="border-b border-border/70 bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/70">
          <div className="mx-auto flex h-16 w-full items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="leading-tight">
                <div className="text-sm font-semibold tracking-wide">IQM Rice</div>
                <div className="text-xs text-muted-foreground">{title}</div>
              </div>
            </div>
            <ThemeSwitcher/>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
