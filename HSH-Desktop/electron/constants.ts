// Shared desktop constants. No secrets here — only loopback defaults.

export const APP_NAME = "HSH Desktop";
export const APP_ID = "com.hebrih.hsh-desktop";

// Loopback host for the packaged frontend. Must stay `localhost` (not
// 127.0.0.1): the RVB cookie session is SameSite=Lax, so only a `localhost`
// renderer origin remains same-site with a same-machine backend.
export const FRONTEND_HOST = "localhost";
export const DEFAULT_FRONTEND_PORT = 3123;

export const DEFAULT_BACKEND_URL = "http://localhost:5000";

export const STARTUP_TIMEOUT_MS = 60_000;
export const HEALTH_CHECK_TIMEOUT_MS = 8_000;
export const BACKEND_POLL_INTERVAL_MS = 30_000;

export const MAIN_WINDOW = {
  width: 1280,
  height: 800,
  minWidth: 1024,
  minHeight: 640,
  backgroundColor: "#0e1512",
  title: "HSH — Poultry Business Suite",
} as const;

export const SETUP_WINDOW = {
  width: 560,
  height: 520,
  backgroundColor: "#0e1512",
  title: "HSH Desktop — Server Setup",
} as const;

// Injected into every renderer before page scripts run. The HSH frontend reads
// it via `resolveApiBase()` (src/lib/api-base.ts). Web builds never set it.
export const DESKTOP_API_URL_WINDOW_KEY = "__HSH_DESKTOP_API_URL";
