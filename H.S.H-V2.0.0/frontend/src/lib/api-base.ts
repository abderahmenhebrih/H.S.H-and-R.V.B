"use client";

// Single runtime-aware backend base URL for all HSH/RVB API traffic.
//
// Web behavior is unchanged: when no desktop override is present this returns
// exactly what the previous inline expression produced
// (NEXT_PUBLIC_API_URL trimmed, else http://localhost:5000).
//
// HSH Desktop (Electron) injects `window.__HSH_DESKTOP_API_URL` via its
// isolated preload bridge before any page script runs, so a configured backend
// (LAN host, central server, or explicit same-machine URL) takes effect without
// rebuilding the frontend. The override is validated (http/https only, no
// credentials, no whitespace) and silently ignored when invalid.
export function resolveApiBase(): string {
  try {
    const w = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : null;
    const override = w?.["__HSH_DESKTOP_API_URL"];
    if (typeof override === "string" && override.length > 0) {
      const trimmed = override.replace(/\/+$/, "");
      if (/^https?:\/\/[^/\s@]+(:\d+)?(\/.*)?$/i.test(trimmed) && !trimmed.includes("@")) {
        return trimmed;
      }
    }
  } catch {
    // Fall through to the build-time default below.
  }
  const raw =
    (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_API_URL : undefined) ||
    "http://localhost:5000";
  return raw.replace(/\/+$/, "");
}
