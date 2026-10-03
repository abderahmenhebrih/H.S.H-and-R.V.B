import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const REFRESH_TOKEN_KEY = "rvb.refreshToken";

export const SECURE_STORE_KEY = REFRESH_TOKEN_KEY;

// PBS-BUG-036: platform distinction for refresh-credential storage.
// Native (iOS/Android) persists the JSON refresh token in SecureStore.
// Expo Web must NEVER hold a long-lived refresh credential in JS-readable
// storage: web uses the backend HttpOnly-cookie session instead, so these
// helpers branch BEFORE any SecureStore call on web.
export function isWebPlatform(): boolean {
  try {
    return Platform.OS === "web";
  } catch {
    return false;
  }
}

export async function getRefreshToken(): Promise<string | null> {
  // Web: no JS-readable refresh credential exists by design; callers use the
  // HttpOnly cookie flow. Never consult SecureStore/localStorage shims here.
  if (isWebPlatform()) return null;
  try {
    const v = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    return v;
  } catch (e) {
    console.warn("[secure-store] getRefreshToken failed", e);
    return null;
  }
}

export async function setRefreshToken(token: string): Promise<void> {
  // Web: no-op by design — a JSON refresh token must never be persisted into
  // localStorage/sessionStorage/cookies. Cookie sessions carry web auth.
  if (isWebPlatform()) return;
  try {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  } catch (e) {
    console.warn("[secure-store] setRefreshToken failed", e);
    throw e;
  }
}

export async function deleteRefreshToken(): Promise<void> {
  // Web: remove the legacy insecure key if a previous version stored it.
  // Never read it back for authentication (see getRefreshToken above).
  if (isWebPlatform()) {
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    } catch {}
    return;
  }
  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch {}
}

// Test helper - not for production use
export async function hasRefreshToken(): Promise<boolean> {
  const t = await getRefreshToken();
  return !!t;
}
