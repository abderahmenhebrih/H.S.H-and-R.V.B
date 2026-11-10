// Window creation with locked-down webPreferences. The Electron-dependent
// attach functions are thin; all policy lives in testable pure factories.

import type { BrowserWindowConstructorOptions } from "electron";
import { MAIN_WINDOW, SETUP_WINDOW } from "./constants";

export function buildMainWindowOptions(preloadPath: string, backendUrl: string): BrowserWindowConstructorOptions {
  return {
    width: MAIN_WINDOW.width,
    height: MAIN_WINDOW.height,
    minWidth: MAIN_WINDOW.minWidth,
    minHeight: MAIN_WINDOW.minHeight,
    title: MAIN_WINDOW.title,
    backgroundColor: MAIN_WINDOW.backgroundColor,
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      // Isolated storage so desktop IndexedDB/localStorage survive restarts
      // independently of any browser profile.
      partition: "persist:hsh-desktop",
      // Passes the validated backend URL to the sandboxed preload (read from
      // process.argv there). Contains no secret — credentials are rejected by
      // config validation.
      additionalArguments: [`--hsh-backend-url=${backendUrl}`],
    },
  };
}

export function buildSetupWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: SETUP_WINDOW.width,
    height: SETUP_WINDOW.height,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: SETUP_WINDOW.title,
    backgroundColor: SETUP_WINDOW.backgroundColor,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      partition: "persist:hsh-desktop",
    },
  };
}

// Security invariants asserted by tests (tests/window-options.test.mjs).
export const SECURITY_INVARIANTS: Array<{ key: string; expected: unknown }> = [
  { key: "webPreferences.contextIsolation", expected: true },
  { key: "webPreferences.nodeIntegration", expected: false },
  { key: "webPreferences.sandbox", expected: true },
  { key: "webPreferences.webSecurity", expected: true },
];
