// Electron-only process spawning for the packaged Next runtime.
//
// Inside the Electron main process, `process.execPath` is the Electron binary
// itself — NOT Node — so the Next standalone `server.js` cannot be launched
// with child_process + execPath. `utilityProcess.fork` runs it on Electron's
// bundled Node instead, which also means installed users need no Node.js.
// This module is imported by main.ts only (never by tests/plain Node).

import { utilityProcess } from "electron";
import type { ProcessHandle } from "./server";

interface ForkedRuntime {
  kill: (signal?: string) => boolean;
  once: (event: "exit" | "spawn" | "message", listener: (...args: unknown[]) => void) => void;
}

export function spawnRuntimeProcess(entry: string, env: NodeJS.ProcessEnv): ProcessHandle {
  const child = utilityProcess.fork(entry, [], {
    stdio: "ignore",
    env: { ...process.env, ...env },
    serviceName: "hsh-frontend-runtime",
  }) as unknown as ForkedRuntime;
  return {
    kill: (signal?: string) => {
      try {
        return signal === undefined ? child.kill() : child.kill(signal);
      } catch {
        return false;
      }
    },
    once: (event: string, listener: (...args: unknown[]) => void) => {
      child.once(event as "exit", listener);
    },
  };
}
