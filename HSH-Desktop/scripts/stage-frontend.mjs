// Stages the real HSH frontend production build for desktop packaging.
//  1. Builds ../H.S.H-V2.0.0/frontend with `next build` (uses that package's
//     own scripts — never duplicated here).
//  2. Copies the standalone runtime (server.js + minimal node_modules),
//     .next/static and public/ into HSH-Desktop/staging/.
// No source is copied; no dev dependencies ship; no .env files are staged.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.join(here, "..");
const FRONTEND = path.join(DESKTOP, "..", "H.S.H-V2.0.0", "frontend");
const STAGING = path.join(DESKTOP, "staging");
const STANDALONE = path.join(FRONTEND, ".next", "standalone");

const backendDefault = process.env.HSH_DESKTOP_BUILD_API_URL || "http://localhost:5000";

function run(cmd, args, cwd, extraEnv = {}) {
  console.log(`[stage] ${cmd} ${args.join(" ")} (cwd=${cwd})`);
  execFileSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...extraEnv },
  });
}

if (!existsSync(path.join(FRONTEND, "package.json"))) {
  throw new Error(`Frontend not found at ${FRONTEND}. The HSH application must stay beside HSH-Desktop.`);
}

// Production build of the EXISTING frontend (its own script, incl. its env).
run("npm", ["run", "build"], FRONTEND, { NEXT_PUBLIC_API_URL: backendDefault, FRONTEND_MODE: "full" });

if (!existsSync(path.join(STANDALONE, "server.js"))) {
  throw new Error(
    "Standalone runtime missing (.next/standalone/server.js). " +
      "The frontend next.config.ts must keep output:\"standalone\".",
  );
}

rmSync(STAGING, { recursive: true, force: true });
mkdirSync(STAGING, { recursive: true });

const target = path.join(STAGING, "frontend-standalone");
mkdirSync(target, { recursive: true });
// server.js + .next + packaged node_modules (production-only, minimal).
cpSync(STANDALONE, target, { recursive: true });
// Static assets and public files live outside standalone's server dir.
cpSync(path.join(FRONTEND, ".next", "static"), path.join(target, ".next", "static"), { recursive: true });
cpSync(path.join(FRONTEND, "public"), path.join(target, "public"), { recursive: true });
// Drop source maps: they aid debugging, not the product, and bloat the installer.
const dropMaps = (dir) => {
  execFileSync(
    process.execPath,
    ["-e", `const{readdirSync,statSync,unlinkSync}=require("fs"),{join}=require("path");(function walk(d){for(const e of readdirSync(d)){const p=join(d,e);const s=statSync(p);if(s.isDirectory())walk(p);else if(p.endsWith(".map"))unlinkSync(p);}})(process.argv[1])`, dir],
    { stdio: "inherit" },
  );
};
dropMaps(target);

console.log(`[stage] staged frontend → ${target}`);
console.log(`[stage] backend default baked for fallback: ${backendDefault}`);
