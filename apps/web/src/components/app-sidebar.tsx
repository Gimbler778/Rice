// TODO: replace hardcoded `userRole` with real value from session:
//   const userRole = (session?.user as any)?.role as UserRole ?? "developer"

import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  CalendarDays,
  CalendarRange,
  CalendarCheck2,
  BarChart3,
  Settings,
  History,
  Users,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { authClient } from "@/lib/auth-client";
import { getSessionUserRole, type AppRole } from "@/lib/roles";
// import { ProfileSheet } from "@/components/profile-sheet";

// Types & nav config

const workspaceNav = [
  { label: "Today",        href: "/today",    icon: CalendarDays,   roles: ["developer","manager","admin"] as AppRole[] },
  { label: "My week",      href: "/week",     icon: CalendarRange,  roles: ["developer","manager","admin"] as AppRole[] },
  { label: "Calendar",     href: "/calendar", icon: CalendarCheck2, roles: ["developer","manager","admin"] as AppRole[] },
  { label: "Logs history", href: "/logs",     icon: History,        roles: ["developer","manager","admin","auditor"] as AppRole[] },
];

const reportsNav = [
  { label: "My reports", href: "/reports",      icon: BarChart3, roles: ["developer","manager","admin","auditor"] as AppRole[] },
  { label: "Team view",  href: "/reports/team", icon: Users,     roles: ["manager","admin","auditor"] as AppRole[] },
];

const adminNav = [
  { label: "Admin panel", href: "/admin", icon: Settings, roles: ["admin"] as AppRole[] },
];

// =============================================================================
// Component
// =============================================================================

export function AppSidebar() {
  const location = useLocation();
  const { data: session } = authClient.useSession();
  const [, setProfileOpen] = useState(false);

  const userRole: AppRole = getSessionUserRole(session) ?? "developer";

  const userInitials = session?.user?.name
    ? session.user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  const isActive = (href: string) => location.pathname === href;

  const renderNavItems = (
    items: { label: string; href: string; icon: React.ElementType; roles: AppRole[] }[]
  ) =>
    items
      .filter((item) => item.roles.includes(userRole))
      .map((item) => (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.label}>
            <Link to={item.href}>
              <item.icon />
              <span>{item.label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ));

  return (
    <>
      <Sidebar collapsible="icon">
        {/* ---------------------------------------------------------------- */}
        {/* Logo */}
        {/* ---------------------------------------------------------------- */}
        <SidebarHeader>
          <Link
            to="/today"
            className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-sidebar-accent transition-colors"
          >
            <div className="size-2 rounded-full bg-teal-500 shrink-0" />
            <span className="font-semibold text-sm tracking-wide group-data-[collapsible=icon]:hidden">
              RICE
            </span>
          </Link>
        </SidebarHeader>

        <SidebarSeparator />

        {/* ---------------------------------------------------------------- */}
        {/* Nav groups */}
        {/* ---------------------------------------------------------------- */}
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderNavItems(workspaceNav)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Reports</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderNavItems(reportsNav)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {adminNav.some((item) => item.roles.includes(userRole)) && (
            <SidebarGroup>
              <SidebarGroupLabel>Admin</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>{renderNavItems(adminNav)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarSeparator />

        {/* ---------------------------------------------------------------- */}
        {/* Footer — avatar button opens ProfileSheet */}
        {/* ---------------------------------------------------------------- */}
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setProfileOpen(true)}
                    className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md hover:bg-sidebar-accent transition-colors group-data-[collapsible=icon]:justify-center"
                  >
                    {/* Avatar initials circle */}
                    <div className="size-7 rounded-full bg-teal-100 dark:bg-teal-900 flex items-center justify-center text-xs font-semibold text-teal-800 dark:text-teal-200 shrink-0 ring-2 ring-transparent hover:ring-teal-300 dark:hover:ring-teal-700 transition-all">
                      {userInitials}
                    </div>
                    {/* Name + role text — hidden when sidebar is collapsed */}
                    <div className="flex flex-col min-w-0 text-left group-data-[collapsible=icon]:hidden">
                      <span className="text-xs font-medium truncate text-sidebar-foreground">
                        {session?.user?.name ?? "User"}
                      </span>
                      <span className="text-xs text-muted-foreground capitalize">
                        {userRole}
                      </span>
                    </div>
                  </button>
                </TooltipTrigger>
                {/* Tooltip shown when sidebar is collapsed */}
                <TooltipContent side="right" align="center">
                  Profile &amp; settings
                </TooltipContent>
              </Tooltip>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      {/* ProfileSheet rendered outside Sidebar so it overlays the full viewport */}
      {/* <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} /> */}
    </>
  );
}