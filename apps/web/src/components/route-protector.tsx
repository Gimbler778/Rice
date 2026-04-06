import { Navigate, Outlet } from "react-router-dom";

import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { type AppRole, getSessionUserRole, hasRequiredRole } from "@/lib/roles";

type RouteProtectorProps = {
  allowedRoles?: readonly AppRole[];
  unauthorizedTo?: string;
};

export function RouteProtector({
  allowedRoles,
  unauthorizedTo = "/",
}: RouteProtectorProps = {}) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/" replace />;
  }

  const userRole = getSessionUserRole(session);
  if (!hasRequiredRole(userRole, allowedRoles)) {
    return <Navigate to={unauthorizedTo} replace />;
  }

  return <Outlet />;
}
