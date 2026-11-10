// Isolated preload bridge. Runs before any page script. Exposes ONLY the
// allowlisted `window.hshDesktop` API plus the backend-URL override the HSH
// frontend reads via `resolveApiBase()`. No ipcRenderer, no require, no Node
// in the renderer.
//
// SELF-CONTAINED BY REQUIREMENT: sandboxed preloads cannot require() relative
// modules, so the channel allowlist and window key are inlined here. They must
// stay identical to electron/ipc.ts (IPC_CHANNELS) and electron/constants.ts
// (DESKTOP_API_URL_WINDOW_KEY) — enforced by tests/preload-bundle.test.mjs,
// which fails on any `require(` or relative `from "./` in this file.

import { contextBridge, ipcRenderer } from "electron";

// Mirror of IPC_CHANNELS in ../ipc.ts — keep in sync (test-enforced).
const ALLOWED_CHANNELS: readonly string[] = [
  "hsh:get-config",
  "hsh:set-backend-url",
  "hsh:validate-backend",
  "hsh:frontend-ready",
  "hsh:get-versions",
  "hsh:print",
  "hsh:select-files",
  "hsh:open-external",
];
// Mirror of DESKTOP_API_URL_WINDOW_KEY in ../constants.ts — keep in sync.
const DESKTOP_API_URL_KEY = "__HSH_DESKTOP_API_URL";
// Mirror of the `--hsh-backend-url=` prefix in ../windows.ts — keep in sync.
const BACKEND_ARGV_PREFIX = "--hsh-backend-url=";

function assertChannel(channel: string): void {
  if (!ALLOWED_CHANNELS.includes(channel)) throw new Error("Blocked IPC channel.");
}

type Handler = (...args: unknown[]) => void;
const eventHandlers = new Map<string, Set<Handler>>();

ipcRenderer.on("hsh:backend-status", (_event, payload) => {
  const set = eventHandlers.get("hsh:backend-status");
  if (!set) return;
  for (const h of set) {
    try {
      h(payload);
    } catch {
      // Never let renderer handlers break the bridge.
    }
  }
});

const api = {
  getConfig: () => {
    assertChannel("hsh:get-config");
    return ipcRenderer.invoke("hsh:get-config");
  },
  setBackendUrl: (url: string) => {
    assertChannel("hsh:set-backend-url");
    return ipcRenderer.invoke("hsh:set-backend-url", url);
  },
  validateBackend: (url?: string) => {
    assertChannel("hsh:validate-backend");
    return ipcRenderer.invoke("hsh:validate-backend", ...(url === undefined ? [] : [url]));
  },
  frontendReady: () => {
    assertChannel("hsh:frontend-ready");
    return ipcRenderer.invoke("hsh:frontend-ready");
  },
  getVersions: () => {
    assertChannel("hsh:get-versions");
    return ipcRenderer.invoke("hsh:get-versions");
  },
  print: (opts?: { silent?: boolean; landscape?: boolean }) => {
    assertChannel("hsh:print");
    return ipcRenderer.invoke("hsh:print", ...(opts === undefined ? [] : [opts]));
  },
  selectFiles: (opts?: { multiple?: boolean; filters?: Array<{ name: string; extensions: string[] }> }) => {
    assertChannel("hsh:select-files");
    return ipcRenderer.invoke("hsh:select-files", ...(opts === undefined ? [] : [opts]));
  },
  openExternal: (url: string) => {
    assertChannel("hsh:open-external");
    return ipcRenderer.invoke("hsh:open-external", url);
  },
  onBackendStatus: (handler: Handler) => {
    let set = eventHandlers.get("hsh:backend-status");
    if (!set) {
      set = new Set();
      eventHandlers.set("hsh:backend-status", set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
    };
  },
};

contextBridge.exposeInMainWorld("hshDesktop", api);

// Backend override for the HSH frontend. The value travels from main to this
// sandboxed preload via `webPreferences.additionalArguments`
// (`--hsh-backend-url=`), which is visible in `process.argv` before any page
// script executes — so module-scope readers like `resolveApiBase()` see it.
// It is published as a read-only, non-enumerable property the renderer cannot
// change. Contains no secret: config validation rejects credentials in URLs.
const argv: string[] = typeof process !== "undefined" && Array.isArray(process.argv) ? process.argv : [];
const startupBackendUrl = argv
  .filter((a) => a.startsWith(BACKEND_ARGV_PREFIX))
  .map((a) => a.slice(BACKEND_ARGV_PREFIX.length))
  .pop();
if (typeof startupBackendUrl === "string" && startupBackendUrl.length > 0) {
  try {
    // contextBridge is the ONLY channel from this isolated world to the page:
    // a defineProperty on the preload global would stay invisible to page
    // scripts. The value is a plain string (cloneable); the renderer cannot
    // reach anything privileged through it.
    contextBridge.exposeInMainWorld(DESKTOP_API_URL_KEY, startupBackendUrl);
  } catch {
    // If exposing fails, the frontend falls back to its baked default.
  }
}
