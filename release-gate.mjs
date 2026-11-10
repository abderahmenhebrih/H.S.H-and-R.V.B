// HSH release gate: single command running every supported verification layer.
// Usage: node release-gate.mjs [--skip-build] [--skip-snapshot]
// Exit code 0 = all green; non-zero = first failing layer.
// Browser E2E (Playwright) is NOT auto-run: needs dedicated seeded stacks
// and is documented in docs/TESTING.md (manual step with exact commands).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const BE = path.join(ROOT, "H.S.H-V2.0.0", "backend");
const FE = path.join(ROOT, "H.S.H-V2.0.0", "frontend");
const args = new Set(process.argv.slice(2));

const STEPS = [
  ["backend typecheck", "npx", ["tsc", "--noEmit"], BE],
  ["backend gate tests", "npm", ["test"], BE],
  ["requests suite (39)", "npx", ["tsx", "test-rvb-requests-isolated.ts"], BE],
  ["chat suite (52)", "npx", ["tsx", "test-chats-isolated.ts"], BE],
  ["sync integrity (34)", "npx", ["tsx", "test-hsh-sync-integrity.ts"], BE],
  ["failure injection (10)", "npx", ["tsx", "test-failure-injection.ts"], BE],
  ["authz matrix (15)", "npx", ["tsx", "test-authz-matrix.ts"], BE],
  ["backup round-trip (2)", "npx", ["tsx", "test-backup-restore.ts"], BE],
  ["frontend typecheck", "npx", ["tsc", "--noEmit"], FE],
  ["frontend unit gates", "npm", ["run", "test"], FE],
  ["snapshot migration (18)", "npx", ["tsx", "test-sync-snapshot-migration.ts"], FE],
  ["frontend production build", "npm", ["run", "build"], FE],
];
const steps = STEPS.filter(
  ([name]) => !(name.includes("build") && args.has("--skip-build")) && !(name.includes("snapshot") && args.has("--skip-snapshot")),
);

let failed = null;
for (const [name, cmd, cmdArgs, cwd] of steps) {
  console.log(`\n### GATE: ${name}`);
  const r = spawnSync(cmd, cmdArgs, { cwd, stdio: "inherit", shell: process.platform === "win32", timeout: 30 * 60 * 1000 });
  if (r.status !== 0) { failed = name; break; }
}
if (failed) { console.error(`\nRELEASE GATE FAILED at: ${failed}`); process.exit(1); }
console.log("\nRELEASE GATE: all green");
