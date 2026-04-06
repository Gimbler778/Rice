import { useMemo } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronUp,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  User2,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

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
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { getSessionUserRole } from "@/lib/roles";

const navItems = [
  {
    title: "Today",
    to: "/today",
    icon: LayoutDashboard,
  },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const userRole = getSessionUserRole(session);

  const signOutMutation = useMutation({
    mutationFn: async () => {
      await authClient.signOut();
    },
    onSuccess: () => {
      toast.success("Signed out");
      navigate("/", { replace: true });
    },
    onError: () => {
      toast.error("Sign out failed. Please try again.");
    },
  });

  const filteredNavItems = useMemo(() => navItems, []);

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="IQM Rice Workspace">
              <NavLink to="/today">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  IQ
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">IQM Rice</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Atlassian workspace
                  </span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredNavItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={location.pathname.startsWith(item.to)}
                  >
                    <NavLink to={item.to}>
                      <item.icon />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg">
                  <User2 />
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate">{session?.user.name ?? "User"}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {userRole ?? "developer"}
                    </span>
                  </div>
                  <ChevronUp className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end">
                <DropdownMenuItem disabled>
                  <ShieldCheck />
                  Role: {userRole ?? "developer"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => signOutMutation.mutate()}
                  disabled={signOutMutation.isPending}
                >
                  <LogOut />
                  {signOutMutation.isPending ? "Signing out..." : "Sign out"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
