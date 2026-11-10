// HSH Desktop main process: single instance, config/setup flow, packaged
// Next.js runtime lifecycle, hardened windows, allowlisted IPC, graceful exit.

import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from "electron";
import * as path from "node:path";
import { APP_ID, APP_NAME } from "./constants";
import {
  defaultConfig,
  isLoopbackUrl,
  loadConfig,
  normalizeBackendUrl,
  probeBackend,
  saveConfig,
  validateFrontendPort,
  type DesktopConfig,
} from "./config";
import { IPC_CHANNELS, isAllowedChannel, validateIpcArgs } from "./ipc";
import { buildMainWindowOptions, buildSetupWindowOptions } from "./windows";
import { classifyPopup, classifyTopNavigation } from "./navigation";
import { findFreePort, resolveStagingDir, startFrontendRuntime, type FrontendRuntime } from "./server";
import { spawnRuntimeProcess } from "./runtime-spawn";

app.setName(APP_NAME);
if (process.platform === "win32") app.setAppUserModelId(APP_ID);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

const isDev = process.env.HSH_DESKTOP_DEV === "1";
const STAGING_DIR = resolveStagingDir(path.join(__dirname, "..", "staging"));
const PRELOAD_PATH = path.join(__dirname, "preload.js");
const SETUP_HTML = path.join(__dirname, "setup.html");

let mainWindow: BrowserWindow | null = null;
let setupWindow: BrowserWindow | null = null;
let runtime: FrontendRuntime | null = null;
let frontendOrigin = "";
let backendUrl = "";
let config: DesktopConfig = defaultConfig();
let quitting = false;
let statusTimer: NodeJS.Timeout | null = null;

function userDataDir(): string {
  return app.getPath("userData");
}

function setBackendStatus(menuLabel: string): void {
  const menu = Menu.buildFromTemplate(buildMenuTemplate(menuLabel));
  Menu.setApplicationMenu(menu);
}

function buildMenuTemplate(statusLabel: string): Electron.MenuItemConstructorOptions[] {
  return [
    {
      label: "Application",
      submenu: [
        { label: `Backend: ${statusLabel}`, enabled: false },
        { type: "separator" },
        {
          label: "Server Settings…",
          click: () => {
            void openSetup();
          },
        },
        {
          label: "Reload",
          accelerator: "CmdOrCtrl+R",
          click: () => mainWindow?.webContents.reload(),
        },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: "Alt+F4",
          click: () => app.quit(),
        },
      ],
    },
  ];
}

function attachWindowGuards(win: BrowserWindow, opts: { lockToFrontend: boolean }): void {
  // Top-level navigation: frontend origin stays in-window; http(s) leaves to
  // the system browser; everything else is denied.
  win.webContents.on("will-navigate", (event, url) => {
    if (!opts.lockToFrontend) return;
    const decision = classifyTopNavigation(url, frontendOrigin);
    if (decision.action === "allow") return;
    event.preventDefault();
    if (decision.action === "open-external") {
      void shell.openExternal(decision.url);
    }
  });
  // Popups (print previews are same-origin routes): same-origin opens in a
  // guarded child window; http(s) goes to the browser; the rest is denied.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!opts.lockToFrontend) return { action: "allow" as const };
    const decision = classifyPopup(url, frontendOrigin);
    if (decision.action === "allow") {
      return {
        action: "allow" as const,
        overrideBrowserWindowOptions: {
          ...buildMainWindowOptions(PRELOAD_PATH, backendUrl),
          show: true,
        },
      };
    }
    if (decision.action === "open-external") void shell.openExternal(decision.url);
    return { action: "deny" as const };
  });
  // Controlled downloads: always save into the user's Documents folder with a
  // sanitized name; never silent-save into app directories.
  win.webContents.session.on("will-download", (_event, item) => {
    const fileName = path.basename(item.getFilename()).slice(0, 128) || "download";
    item.setSavePath(path.join(app.getPath("documents"), fileName));
  });
  // Permissions: notifications are useful (sync/chat alerts); everything else
  // (media, geolocation, …) is denied by default.
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "notifications");
  });
}

async function refreshBackendStatus(): Promise<void> {
  if (!backendUrl || mainWindow === null) return;
  try {
    const probe = await probeBackend(backendUrl);
    const label = probe.health ? (probe.ready ? "Connected" : "Reachable — DB not ready") : "Unreachable";
    setBackendStatus(label);
    mainWindow.webContents.send("hsh:backend-status", {
      ok: probe.health,
      ready: probe.ready,
      detail: probe.detail,
      at: new Date().toISOString(),
    });
  } catch {
    setBackendStatus("Unknown");
  }
}

function startStatusPolling(): void {
  if (statusTimer) clearInterval(statusTimer);
  statusTimer = setInterval(() => {
    void refreshBackendStatus();
  }, 30_000);
  statusTimer.unref?.();
}

function registerIpc(): void {
  for (const channel of IPC_CHANNELS) {
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      if (!isAllowedChannel(channel)) throw new Error("Blocked IPC channel.");
      const valid = validateIpcArgs(channel, args);
      const senderUrl = event.sender.getURL();
      // IPC is served to our own windows only.
      if (mainWindow && event.sender === mainWindow.webContents) {
        if (!senderUrl.startsWith(frontendOrigin) && senderUrl !== "") {
          throw new Error("Untrusted sender.");
        }
      }
      switch (channel) {
        case "hsh:get-config":
          return { backendUrl, frontendPort: config.frontendPort, versions: versions() };
        case "hsh:set-backend-url": {
          const next = normalizeBackendUrl(valid[0]);
          const probe = await probeBackend(next);
          if (!probe.reachable || !probe.health) {
            throw new Error(probe.detail || "Backend verification failed.");
          }
          backendUrl = next;
          config = { ...config, backendUrl: next, configuredAt: new Date().toISOString(), lastVerifiedAt: new Date().toISOString() };
          saveConfig(userDataDir(), config);
          // The frontend reads the URL at module scope via the preload
          // override, so recreate the main window to apply it (the packaged
          // Next runtime itself needs no restart).
          await relaunchMainWindow();
          return { ok: true as const, detail: probe.detail };
        }
        case "hsh:validate-backend": {
          const target = typeof valid[0] === "string" ? valid[0] : backendUrl;
          const probe = await probeBackend(target);
          return probe;
        }
        case "hsh:frontend-ready":
          if (mainWindow && !mainWindow.isVisible()) mainWindow.show();
          return { ok: true as const };
        case "hsh:get-versions":
          return versions();
        case "hsh:print": {
          const w = mainWindow;
          if (!w) throw new Error("No window to print.");
          const o = valid[0] as { silent?: boolean; landscape?: boolean };
          await new Promise<void>((resolve, reject) => {
            w.webContents.print(
              { silent: o.silent === true, printBackground: true, landscape: o.landscape === true },
              (ok, err) => (ok ? resolve() : reject(new Error(err || "Print failed."))),
            );
          });
          return { ok: true as const };
        }
        case "hsh:select-files": {
          const o = valid[0] as { multiple?: boolean; filters?: Array<{ name: string; extensions: string[] }> };
          const owner = BrowserWindow.fromWebContents(event.sender) ?? mainWindow ?? undefined;
          const pickerOpts: Electron.OpenDialogOptions = {
            properties: o.multiple ? ["openFile", "multiSelections"] : ["openFile"],
            filters: o.filters,
          };
          const res = owner ? await dialog.showOpenDialog(owner, pickerOpts) : await dialog.showOpenDialog(pickerOpts);
          return { canceled: res.canceled, filePaths: res.canceled ? [] : res.filePaths };
        }
        case "hsh:open-external": {
          await shell.openExternal(valid[0] as string);
          return { ok: true as const };
        }
        default:
          throw new Error("Unknown channel.");
      }
    });
  }
}

function versions(): { app: string; electron: string; chrome: string; node: string } {
  return { app: app.getVersion(), electron: process.versions.electron ?? "", chrome: process.versions.chrome ?? "", node: process.versions.node ?? "" };
}

async function openSetup(): Promise<void> {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.focus();
    return;
  }
  setupWindow = new BrowserWindow(buildSetupWindowOptions(PRELOAD_PATH));
  attachWindowGuards(setupWindow, { lockToFrontend: false });
  setupWindow.removeMenu();
  await setupWindow.loadFile(SETUP_HTML);
  setupWindow.once("ready-to-show", () => setupWindow?.show());
  setupWindow.on("closed", () => {
    setupWindow = null;
    // First launch without configuration → quit instead of a dead main window.
    if (!config.configuredAt && !mainWindow) app.quit();
  });
}

async function relaunchMainWindow(): Promise<void> {
  if (setupWindow && !setupWindow.isDestroyed()) setupWindow.close();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
    mainWindow = null;
  }
  await openMainWindow();
}

function dbg(msg: string): void {
  if (process.env.HSH_DESKTOP_DEBUG !== "1") return;
  try {
    const fs = require("node:fs") as typeof import("node:fs");
    const p = require("node:path") as typeof import("node:path");
    fs.appendFileSync(
      path.join(process.env.TEMP || process.env.TMP || ".", "hshd-debug.log"),
      `${new Date().toISOString()} ${msg}\n`,
    );
    void p;
  } catch {
    /* never break startup for logging */
  }
}

async function openMainWindow(): Promise<void> {
  dbg("openMainWindow: creating window");
  mainWindow = new BrowserWindow(buildMainWindowOptions(PRELOAD_PATH, backendUrl));
  attachWindowGuards(mainWindow, { lockToFrontend: true });
  // Timed fallback so a hung first paint never leaves a black window forever.
  const showTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) mainWindow.show();
  }, 8000);
  showTimer.unref?.();
  mainWindow.once("ready-to-show", () => {
    clearTimeout(showTimer);
    dbg("ready-to-show: showing");
    mainWindow?.show();
  });
  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    dbg(`render-process-gone: reason=${details.reason} exitCode=${details.exitCode}`);
  });
  mainWindow.on("unresponsive", () => dbg("window unresponsive"));
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    dbg(`did-fail-load: ${code} ${desc} ${url}`);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    if (!quitting && !setupWindow) app.quit();
  });
  await mainWindow.loadURL(frontendOrigin);
  dbg(`loadURL resolved: ${frontendOrigin}`);
  // Offline-first: the app works without the backend. When the backend is
  // down at startup, say so once with explicit choices instead of a dead UI.
  const probe = await probeBackend(backendUrl).catch(() => null);
  if (probe && (!probe.reachable || !probe.health)) {
    const res = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "Backend unreachable",
      message: "The HSH server could not be reached.",
      detail:
        `${probe.detail}\n\nYou can continue offline — changes queue locally and sync when the server returns.\n` +
        `Server: ${backendUrl}`,
      buttons: ["Continue Offline", "Retry", "Server Settings…"],
      defaultId: 0,
      cancelId: 0,
    });
    if (res.response === 1) {
      const retry = await probeBackend(backendUrl).catch(() => null);
      if (!retry?.health) {
        dialog.showErrorBox("Still unreachable", retry?.detail ?? "No connection.");
      } else {
        mainWindow.webContents.reload();
      }
    } else if (res.response === 2) {
      void openSetup();
    }
  }
  void refreshBackendStatus();
}

async function startup(): Promise<void> {
  dbg("startup: begin");
  config = loadConfig(userDataDir());
  backendUrl = config.backendUrl;
  if (!isLoopbackUrl(backendUrl) && backendUrl.startsWith("http://")) {
    console.warn(
      "[security] Backend uses plain http on a non-loopback host. Prefer https for remote servers; LAN use only on trusted networks.",
    );
  }
  registerIpc();
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate("Starting…")));

  if (isDev && process.env.HSH_DESKTOP_FRONTEND_URL) {
    // Dev: reuse the already-running `next dev` server; no packaging involved.
    frontendOrigin = process.env.HSH_DESKTOP_FRONTEND_URL.replace(/\/+$/, "");
    backendUrl = process.env.HSH_DESKTOP_BACKEND_URL ?? backendUrl;
  } else {
    const basePort = validateFrontendPort(config.frontendPort);
    // Port-race resilience: two profiles on one machine (or a stale
    // listener) can collide on the configured port — shift until one binds.
    let started: FrontendRuntime | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 10 && !started; attempt++) {
      const candidate = await findFreePort(basePort + attempt);
      try {
        started = await startFrontendRuntime({
          stagingDir: STAGING_DIR,
          port: candidate,
          backendUrl,
          spawnFn: spawnRuntimeProcess,
          onRuntimeExit: (code, signal) => dbg(`runtime exited: code=${String(code)} signal=${String(signal)}`),
        });
      } catch (err) {
        lastErr = err;
      }
    }
    if (!started) {
      throw lastErr instanceof Error ? lastErr : new Error("Could not bind a local frontend port.");
    }
    runtime = started;
    config = { ...config, frontendPort: runtime.port };
    frontendOrigin = runtime.origin;
    dbg(`runtime started: ${frontendOrigin}`);
  }

  if (!config.configuredAt && !isDev) {
    await openSetup();
  } else {
    await openMainWindow();
  }
  startStatusPolling();

  // Smoke hook for automated verification: quit once the first window shows.
  if (process.env.HSH_DESKTOP_SMOKE === "1") {
    const t = setInterval(() => {
      if (mainWindow?.isVisible()) {
        clearInterval(t);
        console.log(`[smoke] main window visible at ${frontendOrigin}; backend=${backendUrl}`);
        app.quit();
      }
    }, 500);
    setTimeout(() => {
      console.error("[smoke] timeout waiting for main window");
      process.exitCode = 1;
      app.quit();
    }, 90_000).unref?.();
  }
}

app.on("second-instance", () => {
  const w = mainWindow ?? setupWindow;
  if (w) {
    if (w.isMinimized()) w.restore();
    w.focus();
  }
});

app.whenReady().then(() => {
  // Harden the default session: no remote content with privileges (our only
  // loaded origins are loopback + the configured backend API for data).
  const s = session.fromPartition("persist:hsh-desktop");
  s.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "notifications");
  });
  startup().catch((err) => {
    dialog.showErrorBox(
      "HSH Desktop failed to start",
      err instanceof Error ? err.message : String(err),
    );
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (quitting) return;
  quitting = true;
  if (runtime || statusTimer) {
    event.preventDefault();
    if (statusTimer) clearInterval(statusTimer);
    (async () => {
      try {
        await runtime?.stop();
      } finally {
        runtime = null;
        app.quit();
      }
    })();
  }
});
