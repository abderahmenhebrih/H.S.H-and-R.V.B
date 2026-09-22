"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useRvbAuth } from "../../contexts/RvbAuthContext";
import { Loader2 } from "lucide-react";

const PUBLIC_PATHS = ["/rvb/login", "/rvb/auth/change-password"];

export default function RvbAuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRvbAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  // Also allow /rvb/login exact
  const isLogin = pathname === "/rvb/login";
  const isChangePwd = pathname.startsWith("/rvb/auth/change-password");

  useEffect(() => {
    if (loading) return;
    if (!user && !isPublic) {
      router.replace("/rvb/login");
      return;
    }
    if (user && (user as any).mustChangePassword && !isChangePwd && !isLogin) {
      router.replace("/rvb/auth/change-password");
      return;
    }
    if (user && isLogin) {
      if ((user as any).mustChangePassword) router.replace("/rvb/auth/change-password");
      else router.replace("/rvb");
    }
  }, [loading, user, pathname, router, isPublic, isLogin, isChangePwd]);

  if (loading) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <Loader2 size={24} style={{ animation: "spin 0.8s linear infinite", color: "var(--accent)" } as any} />
      </div>
    );
  }

  // While redirecting, avoid flash
  if (!user && !isPublic) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <Loader2 size={24} style={{ animation: "spin 0.8s linear infinite", color: "var(--accent)" } as any} />
      </div>
    );
  }
  if (user && (user as any).mustChangePassword && !isChangePwd && !isLogin) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <Loader2 size={24} style={{ animation: "spin 0.8s linear infinite", color: "var(--accent)" } as any} />
      </div>
    );
  }

  return <>{children}</>;
}
