import type { BaseEntity } from "../core/entity";
import type { RvbRole } from "./roles";

export type RvbAccountStatus = "active" | "archived" | "disabled";
export type RvbOnboardingStatus = "pending" | "complete";
export type RvbLinkedEntityType = "worker" | "supplier" | "customer";

export interface RvbAccount extends BaseEntity {
  tag: string;
  displayName: string;
  role: RvbRole;
  linkedEntityType: RvbLinkedEntityType | null;
  linkedEntityId: string | null;
  status: RvbAccountStatus;
  onboardingStatus: RvbOnboardingStatus;
  profilePicture?: string;
  archivedAt?: number | null;
  lastLoginAt?: number | null;
  mustChangePassword?: boolean;
  passwordChangedAt?: number | null;
  // passwordHash never serialized to client
}

export const TAG_REGEX = /^[a-z0-9][a-z0-9._]{2,29}$/;
export const TAG_MIN = 3;
export const TAG_MAX = 30;

export function normalizeTag(input: string): string {
  let s = (input || "").trim().toLowerCase();
  if (s.startsWith("@")) s = s.slice(1);
  s = s.trim();
  return s;
}

export function isValidTag(tag: string): boolean {
  return TAG_REGEX.test(tag);
}
