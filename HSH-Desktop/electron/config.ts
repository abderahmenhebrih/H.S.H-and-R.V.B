// Backend-URL configuration: validation, persistence, live verification.
// Business data is never stored here — only the backend URL, ports, and
// timestamps. This module uses only Node builtins so it is unit-testable
// without Electron.

import * as fs from "node:fs";
import * as path from "node:path";
import { DEFAULT_BACKEND_URL, DEFAULT_FRONTEND_PORT, HEALTH_CHECK_TIMEOUT_MS } from "./constants";

export interface DesktopConfig {
  backendUrl: string;
  frontendPort: number;
  configuredAt: string | null;
  lastVerifiedAt: string | null;
}

export function defaultConfig(): DesktopConfig {
  return {
    backendUrl: DEFAULT_BACKEND_URL,
    frontendPort: DEFAULT_FRONTEND_PORT,
    configuredAt: null,
    lastVerifiedAt: null,
  };
}

// Strict shape check: http/https only, no userinfo, no credentials, no
// whitespace, explicit host. Returns the normalized (trailing-slash-trimmed)
// URL or throws with a user-facing reason.
export function normalizeBackendUrl(input: unknown): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error("Server URL is required.");
  }
  const trimmed = input.trim().replace(/\/+$/, "");
  if (/\s/.test(trimmed) || trimmed.includes("@")) {
    throw new Error("Server URL must not contain spaces or credentials.");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Server URL is not valid. Example: http://localhost:5000");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Server URL must start with http:// or https://.");
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new Error("Server URL must not embed credentials.");
  }
  if (!parsed.hostname) throw new Error("Server URL must include a host.");
  if (/^https?:$/i.test(trimmed)) throw new Error("Server URL must include a host.");
  return parsed.toString().replace(/\/+$/, "");
}

export function isLoopbackUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  } catch {
    return false;
  }
}

export function validateFrontendPort(input: unknown): number {
  const n = typeof input === "string" && input.trim() !== "" ? Number(input) : input;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1024 || n > 65535) {
    throw new Error("Frontend port must be an integer between 1024 and 65535.");
  }
  return n;
}

export function configFilePath(userDataDir: string): string {
  return path.join(userDataDir, "config.json");
}

export function loadConfig(userDataDir: string): DesktopConfig {
  const base = defaultConfig();
  try {
    const raw = fs.readFileSync(configFilePath(userDataDir), "utf8");
    const parsed = JSON.parse(raw) as Partial<DesktopConfig>;
    if (typeof parsed.backendUrl === "string") base.backendUrl = normalizeBackendUrl(parsed.backendUrl);
    if (parsed.frontendPort !== undefined) base.frontendPort = validateFrontendPort(parsed.frontendPort);
    if (typeof parsed.configuredAt === "string") base.configuredAt = parsed.configuredAt;
    if (typeof parsed.lastVerifiedAt === "string") base.lastVerifiedAt = parsed.lastVerifiedAt;
  } catch {
    // Missing or corrupt config → defaults (first-launch setup follows).
  }
  return base;
}

export function saveConfig(userDataDir: string, config: DesktopConfig): void {
  const normalized: DesktopConfig = {
    backendUrl: normalizeBackendUrl(config.backendUrl),
    frontendPort: validateFrontendPort(config.frontendPort),
    configuredAt: config.configuredAt,
    lastVerifiedAt: config.lastVerifiedAt,
  };
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(configFilePath(userDataDir), JSON.stringify(normalized, null, 2), "utf8");
}

export interface BackendProbe {
  reachable: boolean;
  health: boolean;
  ready: boolean;
  detail: string;
}

async function fetchJson(url: string, timeoutMs: number): Promise<{ status: number; body: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

// Live verification from the main process (reachability + HSH API shape).
// NOTE: this does not enforce browser CORS; the setup screen additionally
// probes from renderer context so a missing CORS_ORIGIN entry is caught
// before the user continues.
export async function probeBackend(backendUrl: string, timeoutMs = HEALTH_CHECK_TIMEOUT_MS): Promise<BackendProbe> {
  const base = normalizeBackendUrl(backendUrl);
  let health = { status: 0, body: null as unknown };
  try {
    health = await fetchJson(`${base}/api/health`, timeoutMs);
  } catch (err) {
    return {
      reachable: false,
      health: false,
      ready: false,
      detail: err instanceof Error ? `Unreachable: ${err.message}` : "Unreachable.",
    };
  }
  const healthOk = health.status === 200 && (health.body as { success?: unknown } | null)?.success === true;
  if (!healthOk) {
    return { reachable: true, health: false, ready: false, detail: `Unexpected /api/health response (HTTP ${health.status}). Is this an HSH backend?` };
  }
  try {
    const ready = await fetchJson(`${base}/api/ready`, timeoutMs);
    const readyOk = ready.status === 200;
    return {
      reachable: true,
      health: true,
      ready: readyOk,
      detail: readyOk ? "Backend verified (health + ready)." : "Backend reachable but database is not ready (/api/ready 503). You may continue offline; sync will catch up.",
    };
  } catch {
    return { reachable: true, health: true, ready: false, detail: "Health OK; readiness check failed. You may continue offline." };
  }
}
