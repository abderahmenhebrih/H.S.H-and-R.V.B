import type { RvbAccount, AuthStatus } from "@/types/rvb";

export type AuthGate =
  | "booting"
  | "login"
  | "change-password"
  | "onboarding"
  | "app";

export function getAuthGate(status: AuthStatus, account: RvbAccount | null): AuthGate {
  if (status === "booting") return "booting";
  if (status === "anonymous" || !account) return "login";
  if (account.mustChangePassword) return "change-password";
  if (account.onboardingStatus === "pending") return "onboarding";
  return "app";
}
