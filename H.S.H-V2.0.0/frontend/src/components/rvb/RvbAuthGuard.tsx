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
  const isOnboarding = pathname === "/rvb/onboarding" || pathname.startsWith("/rvb/onboarding");
  const mustChange = !!(user as any)?.mustChangePassword;
  const needsOnboarding = !!(user && !mustChange && (user as any).onboardingStatus === "pending");

  useEffect(() => {
    if (loading) return;
    // Order: unauthenticated -> /rvb/login, mustChangePassword -> /rvb/auth/change-password, onboarding pending -> /rvb/onboarding, complete -> workspace
    // Unauthenticated: only /rvb/login is public; everything else including change-password/onboarding redirects to login
    if (!user) {
      if (!isLogin) router.replace("/rvb/login");
      return;
    }
    // Authenticated with forced password change: lock to change-password page (allow login/change-password/onboarding? spec says mustChange -> /rvb/auth/change-password, onboarding after)
    if (mustChange) {
      if (!isChangePwd) router.replace("/rvb/auth/change-password");
      return;
    }
    // Authenticated without forced change but onboarding pending: lock to onboarding
    if (needsOnboarding) {
      if (!isOnboarding) router.replace("/rvb/onboarding");
      return;
    }
    // Authenticated without forced change and onboarding complete: never stay on login, change-password, or onboarding
    if (isLogin || isChangePwd || isOnboarding) {
      router.replace("/rvb");
    }
  }, [loading, user, pathname, router, isLogin, isChangePwd, isOnboarding, mustChange, needsOnboarding]);

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

  // Authenticated with onboarding pending → only onboarding is allowed (and change-password already handled)
  if (user && needsOnboarding && !isOnboarding) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <Loader2 size={24} style={{ animation: "spin 0.8s linear infinite", color: "var(--accent)" } as any} />
      </div>
    );
  }

  // Authenticated without mustChange and onboarding complete → block login, change-password, onboarding pages (will redirect to /rvb)
  if (user && !mustChange && !needsOnboarding && (isLogin || isChangePwd || isOnboarding)) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <Loader2 size={24} style={{ animation: "spin 0.8s linear infinite", color: "var(--accent)" } as any} />
      </div>
    );
  }

  return <>{children}</>;
}
