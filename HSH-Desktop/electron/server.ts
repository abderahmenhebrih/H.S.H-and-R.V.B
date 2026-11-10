// Lifecycle for the packaged Next.js production runtime (`server.js` from
// `output: "standalone"`). Uses only Node builtins; no Electron import so the
// spawn/wait/stop logic is testable in plain Node.

// Minimal process handle shared by the Node (dev/tests) and Electron
// (packaged app) launchers.
export interface ProcessHandle {
  kill: (signal?: string) => boolean | void;
  once: (event: string, listener: (...args: unknown[]) => void) => void;
}

export type SpawnFn = (entry: string, env: NodeJS.ProcessEnv) => ProcessHandle;

function nodeSpawn(entry: string, env: NodeJS.ProcessEnv): ProcessHandle {
  const { spawn } = require("node:child_process") as typeof import("node:child_process");
  return spawn(process.execPath, [entry], { env, stdio: "ignore", windowsHide: true }) as unknown as ProcessHandle;
}

import * as fs from "node:fs";
import * as path from "node:path";
import { FRONTEND_HOST, STARTUP_TIMEOUT_MS } from "./constants";

export interface FrontendRuntime {
  port: number;
  origin: string;
  stop: () => Promise<void>;
}

export function standaloneServerEntry(stagingDir: string): string {
  return path.join(stagingDir, "frontend-standalone", "server.js");
}

// Packaged apps keep spawned files outside app.asar (see package.json
// asarUnpack): `<resources>/app.asar.unpacked/staging/...`. Dev/test runs use
// the on-disk staging directory directly.
export function resolveStagingDir(devStagingDir: string): string {
  try {
    // `electron.app` exists only inside Electron; plain Node (tests) throws
    // on require and keeps the on-disk directory.
    const { app } = require("electron") as typeof import("electron");
    if (app && typeof app.isPackaged === "boolean" && app.isPackaged && process.resourcesPath) {
      return path.join(process.resourcesPath, "app.asar.unpacked", "staging");
    }
  } catch {
    // Not running inside Electron — fall through.
  }
  return devStagingDir;
}

export function assertStaged(stagingDir: string): void {
  const entry = standaloneServerEntry(stagingDir);
  if (!fs.existsSync(entry)) {
    throw new Error(
      `Packaged frontend runtime missing: ${entry}. Run "npm run build" in HSH-Desktop first.`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForHttp(origin: string, timeoutMs: number): Promise<void> {
  const started = Date.now();
  let delay = 150;
  for (;;) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      try {
        const res = await fetch(origin, { signal: ctrl.signal, redirect: "manual" });
        // Any HTTP answer (even 404/500) proves the runtime is up.
        if (res.status > 0) return;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // Not up yet.
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Frontend runtime did not answer at ${origin} within ${timeoutMs}ms.`);
    }
    await sleep(delay);
    delay = Math.min(delay * 1.5, 2000);
  }
}

// Find a free loopback port, preferring `preferred`. Binds transiently to
// prove freedom, then releases (a race remains in theory; the caller retries
// the server spawn on EADDRINUSE by shifting the port).
export async function findFreePort(preferred: number): Promise<number> {
  const net = await import("node:net");
  const probe = (port: number): Promise<boolean> =>
    new Promise((resolve) => {
      const s = net.createServer();
      s.once("error", () => resolve(false));
      s.listen(port, FRONTEND_HOST, () => {
        s.close(() => resolve(true));
      });
    });
  if (await probe(preferred)) return preferred;
  const srv = net.createServer();
  await new Promise<void>((resolve) => srv.listen(0, FRONTEND_HOST, () => resolve()));
  const addr = srv.address();
  const port = typeof addr === "object" && addr !== null ? addr.port : preferred + 1;
  await new Promise<void>((resolve) => srv.close(() => resolve()));
  return port;
}

export interface SpawnOptions {
  stagingDir: string;
  port: number;
  backendUrl: string;
  extraEnv?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  // Defaults to a plain-Node child (dev/tests). The packaged app passes the
  // Electron utilityProcess launcher (see runtime-spawn.ts).
  spawnFn?: SpawnFn;
  // Diagnostic hook (used for the debug log, never for control flow).
  onRuntimeExit?: (code: unknown, signal: unknown) => void;
}

export async function startFrontendRuntime(opts: SpawnOptions): Promise<FrontendRuntime> {
  assertStaged(opts.stagingDir);
  const entry = standaloneServerEntry(opts.stagingDir);
  const origin = `http://${FRONTEND_HOST}:${opts.port}`;
  const spawnFn = opts.spawnFn ?? nodeSpawn;
  const child: ProcessHandle = spawnFn(entry, {
    ...process.env,
    ...(opts.extraEnv ?? {}),
    PORT: String(opts.port),
    HOSTNAME: FRONTEND_HOST,
    // Packaged desktop always runs the full workspace (HSH + /rvb).
    FRONTEND_MODE: "full",
    NODE_ENV: "production",
  });
  const state: { exitCode: unknown } = { exitCode: undefined };
  child.once("exit", (code: unknown, signal: unknown) => {
    state.exitCode = code;
    opts.onRuntimeExit?.(code, signal);
  });
  try {
    await waitForHttp(origin, opts.timeoutMs ?? STARTUP_TIMEOUT_MS);
  } catch (err) {
    await killChild(child);
    if (state.exitCode !== undefined && state.exitCode !== null) {
      throw new Error(`Frontend runtime exited immediately (code ${String(state.exitCode)}).`);
    }
    throw err;
  }
  if (state.exitCode !== undefined && state.exitCode !== null) {
    throw new Error(`Frontend runtime exited during startup (code ${String(state.exitCode)}).`);
  }
  let stopped = false;
  return {
    port: opts.port,
    origin,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      await killChild(child);
    },
  };
}

export function killChild(child: ProcessHandle, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    child.once("exit", finish);
    try {
      child.kill();
    } catch {
      finish();
      return;
    }
    setTimeout(() => {
      if (!done) {
        try {
          child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      }
      // Resolve regardless: the OS reaps the process; never hang shutdown.
      setTimeout(finish, 1500);
    }, timeoutMs);
  });
}
