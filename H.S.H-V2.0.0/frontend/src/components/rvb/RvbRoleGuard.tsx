"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useRvbAuth } from "../../contexts/RvbAuthContext";

export function useIsRvbManager(): boolean {
  const { user } = useRvbAuth();
  return user?.role === "manager";
}

export function RvbManagerOnly({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const { user } = useRvbAuth();
  const isManager = user?.role === "manager";
  if (!isManager) return (fallback as any) ?? null;
  return <>{children}</>;
}

export function RvbAccountsGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRvbAuth();
  const router = useRouter();

  const isManager = user?.role === "manager";

  useEffect(() => {
    if (loading) return;
    if (!user) return; // RvbAuthGuard will redirect to /rvb/login
    if (!isManager) router.replace("/rvb");
  }, [loading, user, isManager, router]);

  if (loading) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <Loader2 size={24} style={{ animation: "spin 0.8s linear infinite", color: "var(--accent)" } as any} />
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <Loader2 size={24} style={{ animation: "spin 0.8s linear infinite", color: "var(--accent)" } as any} />
      </div>
    );
  }

  if (!isManager) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <Loader2 size={24} style={{ animation: "spin 0.8s linear infinite", color: "var(--accent)" } as any} />
      </div>
    );
  }

  return <>{children}</>;
}

export function RvbRoleGuard({ allowedRoles, children }: { allowedRoles: string[]; children: React.ReactNode }) {
  const { user, loading } = useRvbAuth();
  const router = useRouter();
  const isAllowed = !!user && allowedRoles.includes(user.role);
  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (!isAllowed) router.replace("/rvb");
  }, [loading, user, isAllowed, router]);
  if (loading) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <Loader2 size={24} style={{ animation: "spin 0.8s linear infinite", color: "var(--accent)" } as any} />
      </div>
    );
  }
  if (!user) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <Loader2 size={24} style={{ animation: "spin 0.8s linear infinite", color: "var(--accent)" } as any} />
      </div>
    );
  }
  if (!isAllowed) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <Loader2 size={24} style={{ animation: "spin 0.8s linear infinite", color: "var(--accent)" } as any} />
      </div>
    );
  }
  return <>{children}</>;
}

export function RvbWorkersGuard({ children }: { children: React.ReactNode }) {
  return <RvbRoleGuard allowedRoles={["manager"]}>{children}</RvbRoleGuard>;
}

export function RvbSuppliersGuard({ children }: { children: React.ReactNode }) {
  return <RvbRoleGuard allowedRoles={["manager"]}>{children}</RvbRoleGuard>;
}

export function RvbCustomersGuard({ children }: { children: React.ReactNode }) {
  return <RvbRoleGuard allowedRoles={["manager", "supervisor"]}>{children}</RvbRoleGuard>;
}

export function RvbOrdersGuard({ children }: { children: React.ReactNode }) {
  return <RvbRoleGuard allowedRoles={["manager", "supervisor"]}>{children}</RvbRoleGuard>;
}
