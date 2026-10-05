export type RvbRole = "manager" | "supervisor" | "worker" | "supplier" | "customer";

export type RvbAccountStatus = "active" | "archived" | "disabled";
export type RvbOnboardingStatus = "pending" | "complete";

export interface RvbAccount {
  id: string;
  tag: string;
  displayName: string;
  role: RvbRole;
  linkedEntityType?: "worker" | "supplier" | "customer" | null;
  linkedEntityId?: string | null;
  status: RvbAccountStatus;
  onboardingStatus: RvbOnboardingStatus;
  profilePicture?: string | null;
  preferences?: {
    notifications?: {
      chats: boolean;
      mentions: boolean;
      requests: boolean;
      orders: boolean;
      statusUpdates: boolean;
      reminders: boolean;
    };
    ui?: {
      language: "en" | "fr" | "ar";
      theme: "light" | "dark";
    };
  } | null;
  mustChangePassword?: boolean;
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number | null;
}

export interface RvbLoginResponse {
  success: boolean;
  accessToken: string;
  refreshToken?: string;
  account: RvbAccount;
  mustChangePassword?: boolean;
}

export interface RvbRefreshResponse {
  success: boolean;
  accessToken: string;
  refreshToken?: string;
  account: RvbAccount;
}

export interface RvbMeResponse {
  success: boolean;
  account: RvbAccount;
}

export interface RvbPortalMeResponse {
  success: boolean;
  account: RvbAccount;
  entity?: unknown | null;
  entityType?: string | null;
}

export type AuthStatus = "booting" | "anonymous" | "authenticated";

export interface RvbApiErrorDetails {
  status: number;
  code: string;
  message: string;
  data?: unknown;
  raw?: unknown;
}

export class RvbApiError extends Error {
  status: number;
  code: string;
  data?: unknown;
  raw?: unknown;

  constructor(details: RvbApiErrorDetails) {
    super(details.message);
    this.name = "RvbApiError";
    this.status = details.status;
    this.code = details.code;
    this.data = details.data;
    this.raw = details.raw;
  }
}

export type ApiErrorCode =
  | "RVB_TAG_REQUIRED"
  | "RVB_AUTH_INVALID_CREDENTIALS"
  | "RVB_AUTH_TEMPORARILY_LOCKED"
  | "RVB_REFRESH_REQUIRED"
  | "RVB_TOKEN_INVALID"
  | "RVB_TOKEN_EXPIRED"
  | "RVB_SESSION_REVOKED"
  | "RVB_ACCOUNT_DISABLED"
  | "RVB_ACCOUNT_ARCHIVED"
  | "RVB_UNAUTHENTICATED"
  | "RVB_FORBIDDEN"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "UNKNOWN";
