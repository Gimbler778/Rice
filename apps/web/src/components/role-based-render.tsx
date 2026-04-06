import { type ReactNode } from "react";

import { type AppRole, hasRequiredRole } from "@/lib/roles";

type RoleBasedRenderProps = {
  role: AppRole | null;
  allowedRoles: readonly AppRole[];
  children: ReactNode;
  fallback?: ReactNode;
};

export function RoleBasedRender({
  role,
  allowedRoles,
  children,
  fallback = null,
}: RoleBasedRenderProps) {
  if (!hasRequiredRole(role, allowedRoles)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
