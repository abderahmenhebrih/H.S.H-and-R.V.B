"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useRvbAuth } from "../../contexts/RvbAuthContext";

export function useIsRvbManager(): boolean {
  const { user } = useRvbAuth();
  return user?.role === "manager" || user?.role === "admin";
}

export function RvbManagerOnly({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const { user } = useRvbAuth();
  const isManager = user?.role === "manager" || user?.role === "admin";
  if (!isManager) return (fallback as any) ?? null;
  return <>{children}</>;
}

export function RvbPortalPlaceholder({ role }: { role: string }) {
  const messages: Record<string, { title: string; desc: string }> = {
    worker: { title: "Worker Portal", desc: "Your worker workspace will be available here. For now, your account is active and you can sign in. The portal experience will be delivered via web/mobile soon." },
    supplier: { title: "Supplier Portal", desc: "Your supplier workspace will be available here. Account is active." },
    customer: { title: "Customer Portal", desc: "Your customer workspace will be available here. Account is active." },
    supervisor: { title: "Supervisor Workspace", desc: "Supervisor access is authenticated. Management modules will be enabled according to your permission matrix in a next phase." },
  };
  const m = messages[role] || { title: "Portal", desc: "Your role-specific workspace will be available soon." };
  return (
    <div style={{ padding: 24, border: "1px solid var(--border)", borderRadius: 14, background: "var(--panel)", boxShadow: "0 1px 6px var(--shadow)", textAlign: "center" }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text)" }}>{m.title}</h2>
      <p style={{ margin: "8px auto 0", maxWidth: 520, color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>{m.desc}</p>
    </div>
  );
}

export function RvbAccountsGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRvbAuth();
  const router = useRouter();

  const isManager = user?.role === "manager" || user?.role === "admin";

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
  return <RvbRoleGuard allowedRoles={["manager", "admin"]}>{children}</RvbRoleGuard>;
}

export function RvbSuppliersGuard({ children }: { children: React.ReactNode }) {
  return <RvbRoleGuard allowedRoles={["manager", "admin"]}>{children}</RvbRoleGuard>;
}

export function RvbCustomersGuard({ children }: { children: React.ReactNode }) {
  return <RvbRoleGuard allowedRoles={["manager", "admin", "supervisor"]}>{children}</RvbRoleGuard>;
}

export function RvbOrdersGuard({ children }: { children: React.ReactNode }) {
  return <RvbRoleGuard allowedRoles={["manager", "admin", "supervisor"]}>{children}</RvbRoleGuard>;
}
