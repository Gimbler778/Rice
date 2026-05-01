import { Link, useLocation } from "react-router-dom";
import {
  CalendarDays,
  CalendarRange,
  BarChart3,
  Settings,
  LogOut,
  User,
  History,
  Bell,
  Monitor,
} from "lucide-react";
import { CheckCircle } from "lucide-react";
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
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTheme } from "@/lib/use-theme";
import { authClient } from "@/lib/auth-client";
import { type AppRole, getSessionUserRole } from "@/lib/roles";
import { useNavigate } from "react-router-dom";
import { useUnreadCount } from "@/hooks/use-notifications";

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
    label: "Calendar view",
    href: "/calendar",
    icon: CalendarDays,
  },
  {
    label: "Follow-ups",
    href: "/follow-ups",
    icon: Bell,
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
    roles: ["developer", "manager", "admin", "auditor"] as AppRole[],
  },
  {
    label: "Team view",
    href: "/reports/team",
    icon: BarChart3,
    // Only managers and admins see team view
    roles: ["manager", "admin"] as AppRole[],
  },
  {
    label: "Approvals",
    href: "/approvals",
    icon: CheckCircle,
    // Only managers and admins see approvals
    roles: ["manager", "admin"] as AppRole[],
  },
];

const adminNav = [
  {
    label: "Admin panel",
    href: "/admin",
    icon: Settings,
    roles: ["admin"] as AppRole[],
  },
];

const accountTriggerClassName =
  "h-auto cursor-pointer p-2 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0";
const accountAvatarClassName =
  "size-7 shrink-0 rounded-full bg-sidebar-accent text-sidebar-accent-foreground flex items-center justify-center text-xs font-semibold group-data-[collapsible=icon]:size-6";
const profileActionClassName =
  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-accent hover:text-accent-foreground";
const signOutActionClassName =
  "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10 hover:text-destructive";

type SidebarAccountMenuProps = {
  userInitials: string;
  userName?: string;
  userRole: AppRole;
  onSignOut: () => Promise<void>;
};

function SidebarAccountMenu({
  userInitials,
  userName,
  userRole,
  onSignOut,
}: SidebarAccountMenuProps) {
  const { theme, setTheme } = useTheme();
  const nextTheme = theme === "light" ? "dark" : "light";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <SidebarMenuButton
          tooltip="Account"
          className={accountTriggerClassName}
        >
          <div className={accountAvatarClassName}>{userInitials}</div>
          <div className="flex flex-col min-w-0 text-left group-data-[collapsible=icon]:hidden">
            <span className="text-xs font-medium truncate">
              {userName ?? "User"}
            </span>
            {/* TODO: replace "Developer" with session?.user?.role once RBAC lands */}
            <span className="text-xs text-muted-foreground capitalize">
              {userRole}
            </span>
          </div>
        </SidebarMenuButton>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-48 p-1.5">
        <Link to="/profile" className={profileActionClassName}>
          <User className="size-4 shrink-0" />
          <span>Profile</span>
        </Link>
        <button
          type="button"
          onClick={() => setTheme(nextTheme)}
          className={`${profileActionClassName} w-full justify-between`}
        >
          <div className="flex items-center gap-2">
            <Monitor className="size-4 shrink-0" />
            <span className="capitalize">{theme}</span>
          </div>
        </button>
        <button
          type="button"
          onClick={onSignOut}
          className={signOutActionClassName}
        >
          <LogOut className="size-4 shrink-0" />
          <span>Sign out</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}

// Component

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const unreadCount = useUnreadCount(!!session?.user);

  const userRole = getSessionUserRole(session) ?? "developer";

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:hidden">
            <img
              src="/favicon_io/favicon-32x32.png"
              alt="RICE"
              className="size-4 shrink-0 rounded-sm"
            />
            <span className="font-semibold text-sm tracking-wide">
              RICE
            </span>
          </div>
          <SidebarTrigger />
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
                    <Link to={item.href} className="flex items-center w-full justify-between">
                      <div className="flex items-center gap-2">
                        <item.icon />
                        <span>{item.label}</span>
                      </div>
                      {item.label === "Follow-ups" && unreadCount > 0 && (
                        <div className="size-2 rounded-full bg-blue-500 mr-2 shrink-0 group-data-[collapsible=icon]:hidden" />
                      )}
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

      {/* Footer — user info */}
      <SidebarSeparator />
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarAccountMenu
              userInitials={userInitials}
              userName={session?.user?.name}
              userRole={userRole}
              onSignOut={handleSignOut}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

