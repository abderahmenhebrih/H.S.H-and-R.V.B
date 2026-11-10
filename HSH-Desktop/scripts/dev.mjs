// Dev loop: starts the EXISTING frontend `next dev` (its own script) and the
// backend is expected separately (`npm run dev` in H.S.H-V2.0.0/backend), then
// launches Electron against the dev server. Nothing is packaged in dev.
import { spawn, execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.join(here, "..");
const FRONTEND = path.join(DESKTOP, "..", "H.S.H-V2.0.0", "frontend");
const DEV_URL = process.env.HSH_DESKTOP_FRONTEND_URL || "http://localhost:3000";
const BACKEND_URL = process.env.HSH_DESKTOP_BACKEND_URL || "http://localhost:5000";

async function waitFor(url, timeoutMs = 90000) {
  const start = Date.now();
  for (;;) {
    try {
      const r = await fetch(url);
      if (r.status > 0) return;
    } catch {}
    if (Date.now() - start > timeoutMs) throw new Error(`dev server never came up at ${url}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const electronBin = path.join(DESKTOP, "node_modules", "electron", "dist", "electron.exe");
let next;
try {
  execSync("npx tsc", { cwd: DESKTOP, stdio: "inherit", shell: process.platform === "win32" });
  next = spawn("npm", ["run", "dev"], { cwd: FRONTEND, shell: true, stdio: "inherit" });
  await waitFor(DEV_URL);
  const el = spawn(electronBin, ["."], {
    cwd: DESKTOP,
    stdio: "inherit",
    env: { ...process.env, HSH_DESKTOP_DEV: "1", HSH_DESKTOP_FRONTEND_URL: DEV_URL, HSH_DESKTOP_BACKEND_URL: BACKEND_URL },
  });
  el.on("exit", () => {
    next.kill();
    process.exit(0);
  });
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  try {
    next?.kill();
  } catch {}
  process.exit(1);
}
