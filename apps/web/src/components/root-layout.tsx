import { Outlet, useLocation } from "react-router-dom";

import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";

export function RootLayout() {
  const location = useLocation();
  const isAuthPage = location.pathname === "/";
  const title = location.pathname === "/" ? "Sign in" : "Workspace";

  return (
    <SidebarProvider>
      {!isAuthPage ? <AppSidebar /> : null}
      <SidebarInset>
        <header className="border-b border-border/70 bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/70">
          <div className="mx-auto flex h-16 w-full items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <div className="leading-tight">
                <div className="text-sm font-semibold tracking-wide">IQM Rice</div>
                <div className="text-xs text-muted-foreground">{title}</div>
              </div>
            </div>
            <ThemeSwitcher />
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
