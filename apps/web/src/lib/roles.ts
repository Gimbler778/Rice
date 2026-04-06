export const APP_ROLES = ["developer", "manager", "admin", "auditor"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.includes(value as AppRole);
}

export function getSessionUserRole(session: unknown): AppRole | null {
  if (!session || typeof session !== "object") {
    return null;
  }

  const user =
    "user" in session && session.user && typeof session.user === "object"
      ? session.user
      : null;

  if (!user) {
    return null;
  }

  const role = "role" in user ? user.role : null;
  return isAppRole(role) ? role : null;
}

export function hasRequiredRole(
  userRole: AppRole | null,
  allowedRoles?: readonly AppRole[],
): boolean {
  if (!allowedRoles || allowedRoles.length === 0) {
    return true;
  }

  return userRole !== null && allowedRoles.includes(userRole);
}
