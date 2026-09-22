"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useRvbAuth } from "../../contexts/RvbAuthContext";
import { Loader2 } from "lucide-react";

export default function RvbAuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRvbAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isLogin = pathname === "/rvb/login";
  const isChangePwd = pathname.startsWith("/rvb/auth/change-password");
  const mustChange = !!(user as any)?.mustChangePassword;

  useEffect(() => {
    if (loading) return;
    // Unauthenticated: only /rvb/login is public; everything else including change-password redirects to login
    if (!user) {
      if (!isLogin) router.replace("/rvb/login");
      return;
    }
    // Authenticated with forced password change: lock to change-password page
    if (mustChange) {
      if (!isChangePwd) router.replace("/rvb/auth/change-password");
      return;
    }
    // Authenticated without forced change: never stay on login or change-password
    if (isLogin || isChangePwd) {
      router.replace("/rvb");
    }
  }, [loading, user, pathname, router, isLogin, isChangePwd, mustChange]);

  if (loading) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <Loader2 size={24} style={{ animation: "spin 0.8s linear infinite", color: "var(--accent)" } as any} />
      </div>
    );
  }

  // Unauthenticated and not on login → redirecting to login, avoid flash of protected content
  if (!user && !isLogin) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <Loader2 size={24} style={{ animation: "spin 0.8s linear infinite", color: "var(--accent)" } as any} />
      </div>
    );
  }

  // Authenticated with mustChangePassword → only change-password is allowed
  if (user && mustChange && !isChangePwd) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <Loader2 size={24} style={{ animation: "spin 0.8s linear infinite", color: "var(--accent)" } as any} />
      </div>
    );
  }

  // Authenticated without mustChange → block login and change-password pages (will redirect to /rvb)
  if (user && !mustChange && (isLogin || isChangePwd)) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <Loader2 size={24} style={{ animation: "spin 0.8s linear infinite", color: "var(--accent)" } as any} />
      </div>
    );
  }

  return <>{children}</>;
}
