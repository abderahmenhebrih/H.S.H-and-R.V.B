import type { RvbRole } from "@/types/rvb";

export const RVB_ROLES: readonly RvbRole[] = ["manager", "admin", "supervisor", "worker", "supplier", "customer"] as const;

export const MANAGEMENT_ROLES: readonly RvbRole[] = ["manager", "admin", "supervisor"] as const;
export const PORTAL_ROLES: readonly RvbRole[] = ["worker", "supplier", "customer"] as const;
export const SECONDARY_TAB_ROLES: readonly RvbRole[] = ["worker", "supplier", "customer"] as const;

export function isManagementRole(role: RvbRole): boolean {
  return (MANAGEMENT_ROLES as readonly string[]).includes(role);
}

export function isPortalRole(role: RvbRole): boolean {
  return (PORTAL_ROLES as readonly string[]).includes(role);
}

export function isSecondaryTabRole(role: RvbRole): boolean {
  return (SECONDARY_TAB_ROLES as readonly string[]).includes(role);
}

export function isManagerRole(role: RvbRole): boolean {
  return role === "manager";
}

export function isAdminRole(role: RvbRole): boolean {
  return role === "admin";
}

export function isSupervisorRole(role: RvbRole): boolean {
  return role === "supervisor";
}

export function isWorkerRole(role: RvbRole): boolean {
  return role === "worker";
}

export function isSupplierRole(role: RvbRole): boolean {
  return role === "supplier";
}

export function isCustomerRole(role: RvbRole): boolean {
  return role === "customer";
}

export function getRoleLabel(role: RvbRole): string {
  switch (role) {
    case "manager":
      return "Manager";
    case "admin":
      return "Admin";
    case "supervisor":
      return "Supervisor";
    case "worker":
      return "Worker";
    case "supplier":
      return "Supplier";
    case "customer":
      return "Customer";
    default:
      return role;
  }
}

export function canAccessWorkerManagement(role: RvbRole): boolean {
  return role === "manager" || role === "admin";
}

export function canAccessSupplierManagement(role: RvbRole): boolean {
  return role === "manager" || role === "admin";
}

export function canAccessCustomerManagement(role: RvbRole): boolean {
  return role === "manager" || role === "admin" || role === "supervisor";
}

// PBS-BUG-037: route-guard helpers completing the management matrix.
// Mirror the backend requireRvbRole contracts + visible ManagementDashboard
// cards: accounts are manager/admin-only; aggregated requests and customer
// orders admit supervisor (backend scopes supervisor to customer source).
export function canAccessAccountsManagement(role: RvbRole): boolean {
  return role === "manager" || role === "admin";
}

export function canAccessRequestsManagement(role: RvbRole): boolean {
  return role === "manager" || role === "admin" || role === "supervisor";
}

export function canAccessOrdersManagement(role: RvbRole): boolean {
  return role === "manager" || role === "admin" || role === "supervisor";
}
