import { Link, useLocation } from "react-router-dom";
import {
  CalendarDays,
  CalendarRange,
  BarChart3,
  Settings,
  LogOut,
  History,
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
import { authClient } from "@/lib/auth-client";
import { useNavigate } from "react-router-dom";

// Types

type UserRole = "developer" | "manager" | "admin" | "auditor";

// Nav config

const workspaceNav = [
  {
    label: "Today",
    href: "/today",
    icon: CalendarDays,
  },
  {
    label: "My week",
    href: "/week",
    icon: CalendarRange,
  },
  {
    label: "Logs history",
    href: "/logs",
    icon: History,
  },
];

const reportsNav = [
  {
    label: "My reports",
    href: "/reports",
    icon: BarChart3,
    roles: ["developer", "manager", "admin", "auditor"] as UserRole[],
  },
  {
    label: "Team view",
    href: "/reports/team",
    icon: BarChart3,
    // Only managers and admins see team view
    roles: ["manager", "admin"] as UserRole[],
  },
];

const adminNav = [
  {
    label: "Admin panel",
    href: "/admin",
    icon: Settings,
    roles: ["admin"] as UserRole[],
  },
];

// Component

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();

  // TODO: Replace with real role from session once RBAC is wired
  // e.g. const userRole = session?.user.role as UserRole ?? "developer"
  const userRole: UserRole = "developer";

  const userInitials = session?.user?.name
    ? session.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  const handleSignOut = async () => {
    await authClient.signOut();
    navigate("/");
  };

  return (
    <Sidebar collapsible="icon">
      {/* Logo */}
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          {/* Teal dot logo mark */}
          <div className="size-2 rounded-full bg-teal-500 shrink-0" />
          <span className="font-semibold text-sm tracking-wide group-data-[collapsible=icon]:hidden">
            RICE
          </span>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        
        {/* Workspace section */}
        
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.href}
                    tooltip={item.label}
                  >
                    <Link to={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Reports section */}
        <SidebarGroup>
          <SidebarGroupLabel>Reports</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {reportsNav
                // Filter by role: only show items the current user's role can see
                .filter((item) => item.roles.includes(userRole))
                .map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={location.pathname === item.href}
                      tooltip={item.label}
                    >
                      <Link to={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin section — only rendered if user has admin role */}
        {adminNav.some((item) => item.roles.includes(userRole)) && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNav
                  .filter((item) => item.roles.includes(userRole))
                  .map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={location.pathname === item.href}
                        tooltip={item.label}
                      >
                        <Link to={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Footer — user info + sign out */}
      <SidebarSeparator />
      <SidebarFooter>
        <SidebarMenu>
          {/* User avatar + name */}
          <SidebarMenuItem>
            <div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:justify-center">
              {/* Initials avatar */}
              <div className="size-7 rounded-full bg-teal-100 dark:bg-teal-900 flex items-center justify-center text-xs font-semibold text-teal-800 dark:text-teal-200 shrink-0">
                {userInitials}
              </div>
              <div className="flex flex-col group-data-[collapsible=icon]:hidden min-w-0">
                <span className="text-xs font-medium truncate">
                  {session?.user?.name ?? "User"}
                </span>
                {/* TODO: replace "Developer" with session?.user?.role once RBAC lands */}
                <span className="text-xs text-muted-foreground capitalize">
                  {userRole}
                </span>
              </div>
            </div>
          </SidebarMenuItem>

          {/* Sign out button */}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleSignOut}
              tooltip="Sign out"
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}