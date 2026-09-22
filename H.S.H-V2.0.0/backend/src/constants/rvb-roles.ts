export const RVB_ROLES = [
  "manager",
  "admin",
  "supervisor",
  "worker",
  "supplier",
  "customer",
] as const;

export type RvbRole = typeof RVB_ROLES[number];

export const RVB_MANAGEMENT_ROLES: readonly RvbRole[] = ["manager", "admin", "supervisor"] as const;
export const RVB_PORTAL_ROLES: readonly RvbRole[] = ["worker", "supplier", "customer"] as const;

export function isValidRvbRole(role: string): role is RvbRole {
  return (RVB_ROLES as readonly string[]).includes(role);
}
export function isManagementRole(role: string): boolean {
  return (RVB_MANAGEMENT_ROLES as readonly string[]).includes(role);
}
export function isPortalRole(role: string): boolean {
  return (RVB_PORTAL_ROLES as readonly string[]).includes(role);
}
