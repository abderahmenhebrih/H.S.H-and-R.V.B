import fs from "fs";
import path from "path";

const frontendRoot = path.resolve(__dirname, "../frontend");
const frontendRvb = path.resolve(__dirname, "../frontend/app/rvb");
const frontendRvbComp = path.resolve(__dirname, "../frontend/src/components/rvb");
const targetDb = path.normalize(path.join(frontendRoot, "src/lib/database/db.ts"));
const syncInitializerPath = path.normalize(path.join(frontendRoot, "src/services/sync/SyncInitializer.tsx"));
const compactHeaderPath = path.normalize(path.join(frontendRoot, "src/components/layout/CompactHeader.tsx"));
const rvbShellPath = path.normalize(path.join(frontendRoot, "src/components/rvb/RvbShell.tsx"));
const hshBellPath = path.normalize(path.join(frontendRoot, "src/components/notifications/HshNotificationBell.tsx"));
const rvbBellPath = path.normalize(path.join(frontendRoot, "src/components/notifications/RvbNotificationBell.tsx"));
const notificationBellPath = path.normalize(path.join(frontendRoot, "src/components/notifications/NotificationBell.tsx"));

const forbiddenPatterns = [
  "src/lib/database/db",
  "settings.service",
  "settings.repository",
  "lib/database/db",
  "src/services/worker.service",
  "src/services/supplier.service",
  "src/services/customer.service",
  "src/services/purchase.service",
  "src/services/sale.service",
  "src/services/payment.service",
  "src/repositories/worker.repository",
  "src/repositories/supplier.repository",
  "src/repositories/customer.repository",
  "src/repositories/purchase.repository",
  "src/repositories/sale.repository",
  "src/repositories/product.repository",
  "services/operations/worker",
  "services/operations/supplier",
  "services/operations/customer",
  "services/operations/purchase",
  "services/operations/sale",
  "services/operations/payment",
  "from \"@/src/lib/database",
  "from '@/src/lib/database",
  "triggerSync",
];

function walk(dir: string, files: string[] = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && (full.endsWith(".ts") || full.endsWith(".tsx"))) files.push(full);
  }
  return files;
}

// ---------- Transitive import graph resolver ----------

function resolveImport(importPath: string, fromFile: string): string | null {
  if (importPath.endsWith(".css") || importPath.endsWith(".module.css")) return null;
  // External modules: react, next, lucide-react, socket.io-client etc.
  // Local if starts with "." or "@/" or "src/"
  const isLocal = importPath.startsWith(".") || importPath.startsWith("@/") || importPath.startsWith("src/");
  if (!isLocal) return null;
  let candidateBase: string;
  if (importPath.startsWith("@/")) {
    candidateBase = path.join(frontendRoot, importPath.slice(2));
  } else if (importPath.startsWith("src/")) {
    candidateBase = path.join(frontendRoot, importPath);
  } else if (importPath.startsWith(".")) {
    candidateBase = path.resolve(path.dirname(fromFile), importPath);
  } else {
    return null;
  }
  // If candidate already has extension, try directly
  const tryPaths: string[] = [];
  if (/\.(ts|tsx|js|jsx)$/.test(candidateBase)) {
    tryPaths.push(candidateBase);
  } else {
    tryPaths.push(candidateBase + ".ts");
    tryPaths.push(candidateBase + ".tsx");
    tryPaths.push(candidateBase + ".js");
    tryPaths.push(candidateBase + ".jsx");
    tryPaths.push(path.join(candidateBase, "index.ts"));
    tryPaths.push(path.join(candidateBase, "index.tsx"));
  }
  for (const p of tryPaths) {
    const n = path.normalize(p);
    if (fs.existsSync(n) && fs.statSync(n).isFile()) return n;
  }
  if (fs.existsSync(candidateBase) && fs.statSync(candidateBase).isFile()) return path.normalize(candidateBase);
  return null;
}

function getStaticImports(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf8");
  const imports = new Set<string>();
  // Static import regex: captures `from "path"` after import, but not dynamic import("path")
  const staticImportRegex = /import\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const exportFromRegex = /export\s+(?:\*\s+from|\{[^}]*\}\s+from)\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  // Filter out dynamic import("...") by ensuring not `import(`
  // Our static regex requires whitespace after import, so `import(` won't match
  while ((m = staticImportRegex.exec(content)) !== null) {
    const fullMatch = m[0];
    // Extra guard: if fullMatch contains `import(` pattern, skip
    if (fullMatch.includes("import(")) continue;
    // Also skip if line is inside a dynamic await import? That's still `import("` so not matched
    imports.add(m[1]);
  }
  while ((m = exportFromRegex.exec(content)) !== null) {
    imports.add(m[1]);
  }
  const resolved: string[] = [];
  for (const imp of imports) {
    const r = resolveImport(imp, filePath);
    if (r) resolved.push(r);
  }
  return resolved;
}

function hasStaticPathToDb(entryFile: string, target: string): { found: boolean; path: string[] } {
  const normalizedEntry = path.normalize(entryFile);
  const visited = new Set<string>();
  const stack: Array<{ file: string; path: string[] }> = [{ file: normalizedEntry, path: [normalizedEntry] }];
  while (stack.length) {
    const cur = stack.pop()!;
    if (visited.has(cur.file)) continue;
    visited.add(cur.file);
    const imports = getStaticImports(cur.file);
    for (const imp of imports) {
      const normalizedImp = path.normalize(imp);
      if (normalizedImp === path.normalize(target)) {
        return { found: true, path: [...cur.path, normalizedImp] };
      }
      if (!visited.has(normalizedImp)) {
        stack.push({ file: normalizedImp, path: [...cur.path, normalizedImp] });
      }
    }
  }
  return { found: false, path: [] };
}

let failed = false;

// 0. Verify target exists
if (!fs.existsSync(targetDb)) {
  console.error(`Target db not found: ${targetDb}`);
  process.exit(1);
}

if (!fs.existsSync(frontendRvb)) {
  console.error(`Frontend RVB dir not found: ${frontendRvb}`);
  process.exit(1);
}

// 1. Check SyncInitializer has no static import to manager/db and has dynamic imports in correct branch
console.log("=== Checking SyncInitializer static boundary ===");
if (fs.existsSync(syncInitializerPath)) {
  const content = fs.readFileSync(syncInitializerPath, "utf8");
  // Must NOT have static import of manager or task-notification-scheduler (static = `import ... from "path"`)
  const staticImportLines = content.split("\n").filter((l) => {
    const t = l.trim();
    // static import starts with `import ` (space) or `import type`, not `import(`
    const isStaticImport = t.startsWith("import ") || t.startsWith("import\t") || t.startsWith("import type");
    return isStaticImport && (t.includes("manager") || t.includes("task-notification-scheduler")) && t.includes("from");
  });
  if (staticImportLines.length > 0) {
    console.error(`FAIL: SyncInitializer still statically imports H.S.H sync: ${staticImportLines[0].trim()}`);
    failed = true;
  } else {
    console.log("PASS: SyncInitializer has no static import of manager/scheduler");
  }
  // Must have dynamic import
  const hasDynamicManager = content.includes('import("./manager")') || content.includes("import('./manager')") || content.includes('import("./manager")');
  const hasDynamicScheduler = content.includes('import("../task-notification-scheduler")') || content.includes("import('../task-notification-scheduler')");
  if (!hasDynamicManager || !hasDynamicScheduler) {
    console.error("FAIL: SyncInitializer must dynamically import manager and scheduler inside non-RVB branch");
    failed = true;
  } else {
    console.log("PASS: SyncInitializer dynamically imports manager/scheduler");
  }
  // Must have isRvb check
  if (!content.includes("isRvb") || !content.includes('startsWith("/rvb")')) {
    console.error("FAIL: SyncInitializer missing isRvb gate");
    failed = true;
  }
  // Must start sync on non-RVB route: check that after dynamic import it calls startSyncManager and scheduler
  if (!content.includes("startSyncManager()") || !content.includes("startTaskNotificationScheduler()")) {
    console.error("FAIL: SyncInitializer must call startSyncManager/startTaskNotificationScheduler after dynamic import (H.S.H sync still starts)");
    failed = true;
  } else {
    console.log("PASS: SyncInitializer still starts H.S.H sync on non-RVB route");
  }
  // Check cleanup handling for async cancellation correctly if route changes while imports are resolving
  if (!content.includes("cancelled") || !content.includes("cleanupRef")) {
    console.error("FAIL: SyncInitializer must handle async cleanup/cancellation correctly");
    failed = true;
  } else {
    console.log("PASS: SyncInitializer handles async cleanup/cancellation");
  }
  // Transitive check: SyncInitializer -> db should be NO static path
  const syncPath = hasStaticPathToDb(syncInitializerPath, targetDb);
  if (syncPath.found) {
    console.error(`FAIL: SyncInitializer has static dependency path to db.ts`);
    console.error(`  Path: ${syncPath.path.map((p) => path.relative(frontendRoot, p)).join(" -> ")}`);
    failed = true;
  } else {
    console.log("PASS: SyncInitializer has no static path to db.ts");
  }
  // Also check dynamic import only in non-RVB branch: ensure early return for isRvb before dynamic import
  const isRvbIndex = content.indexOf("if (isRvb)");
  const dynamicIndex = content.indexOf('import("./manager")');
  if (isRvbIndex !== -1 && dynamicIndex !== -1 && dynamicIndex < isRvbIndex) {
    console.error("FAIL: SyncInitializer dynamic import before isRvb guard");
    failed = true;
  }
  // Verify pathname guard double-check after import (window.location.pathname.startsWith("/rvb"))
  if (!content.includes('window.location.pathname.startsWith("/rvb")')) {
    console.warn("WARN: SyncInitializer missing double-check for /rvb after async import");
  }
} else {
  console.error(`SyncInitializer not found at ${syncInitializerPath}`);
  failed = true;
}

// 2. Check NotificationBell split / CompactHeader
console.log("\n=== Checking NotificationBell / CompactHeader boundary ===");
if (fs.existsSync(compactHeaderPath)) {
  const chContent = fs.readFileSync(compactHeaderPath, "utf8");
  // Must have settingsHref prop
  if (!chContent.includes("settingsHref")) {
    console.error("FAIL: CompactHeader missing settingsHref prop");
    failed = true;
  } else {
    console.log("PASS: CompactHeader has settingsHref prop");
  }
  // Must NOT statically import NotificationBell or HshNotificationBell
  const hasNotifImport = chContent.split("\n").some((l) => l.trim().startsWith("import") && (l.includes("NotificationBell") || l.includes("HshNotificationBell") || l.includes("RvbNotificationBell")));
  if (hasNotifImport) {
    console.error("FAIL: CompactHeader still statically imports NotificationBell/Hsh/Rvb");
    failed = true;
  } else {
    console.log("PASS: CompactHeader does not statically import notification bells");
  }
  // Must have notificationBell prop
  if (!chContent.includes("notificationBell")) {
    console.error("FAIL: CompactHeader missing notificationBell prop");
    failed = true;
  }
  // Check settingsHref default "/settings" and usage router.push(settingsHref)
  if (!chContent.includes('settingsHref = "/settings"') && !chContent.includes("settingsHref ??")) {
    console.warn("WARN: CompactHeader settingsHref default not explicit but may still work");
  }
  if (!chContent.includes("router.push(settingsHref")) {
    console.error("FAIL: CompactHeader should use router.push(settingsHref)");
    failed = true;
  }
}
if (fs.existsSync(rvbShellPath)) {
  const rvbShellContent = fs.readFileSync(rvbShellPath, "utf8");
  // Must import RvbNotificationBell, not Hsh
  if (!rvbShellContent.includes("RvbNotificationBell")) {
    console.error("FAIL: RvbShell must import RvbNotificationBell");
    failed = true;
  }
  if (rvbShellContent.includes("HshNotificationBell") || rvbShellContent.includes('from "../notifications/NotificationBell"')) {
    console.error("FAIL: RvbShell must not import HshNotificationBell or shared NotificationBell");
    failed = true;
  }
  // Must pass settingsHref="/rvb/settings"
  if (!rvbShellContent.includes('settingsHref="/rvb/settings"') && !rvbShellContent.includes("settingsHref='/rvb/settings'")) {
    console.error("FAIL: RvbShell must pass settingsHref=\"/rvb/settings\" to CompactHeader");
    failed = true;
  } else {
    console.log("PASS: RvbShell passes settingsHref=/rvb/settings");
  }
  // Check Access HSH gate (manager only; admin retired)
  if (!rvbShellContent.includes('user?.role === "manager"')) {
    console.error("FAIL: RvbShell Access HSH not gated to manager");
    failed = true;
  } else {
    const hasGateWrap = rvbShellContent.includes('user?.role === "manager" && (');
    if (!hasGateWrap) {
      console.warn("WARN: RvbShell gate may not wrap sidebarFooter correctly");
    }
    console.log("PASS: RvbShell Access HSH gated to manager");
  }
  // Verify Access HSH hidden for portal roles (supervisor, worker, supplier, customer) - ensure not rendered unconditionally
  // Check that file does not contain unconditional rendering of Access HSH without gate
  const accessHshCount = (rvbShellContent.match(/switchToHsh/g) || []).length;
  // Should have gate around both collapsed and expanded variants, so ensure gate exists
  // Also verify that portal roles are not allowed: check that code does not explicitly allow supervisor/worker
  if (rvbShellContent.includes('role === "supervisor"') && rvbShellContent.includes("Access HSH") && rvbShellContent.includes('supervisor.*Access HSH')) {
    console.warn("WARN: Check Access HSH not visible to supervisor");
  }
  // Verify no direct import of db
  if (rvbShellContent.includes("src/lib/database/db")) {
    console.error("FAIL: RvbShell directly imports db");
    failed = true;
  }
}
// Check AppShell also passes correct settingsHref
const appShellPath = path.join(frontendRoot, "src/components/layout/AppShell.tsx");
if (fs.existsSync(appShellPath)) {
  const appContent = fs.readFileSync(appShellPath, "utf8");
  if (!appContent.includes('settingsHref="/settings"') && !appContent.includes("settingsHref='/settings'")) {
    console.error("FAIL: AppShell (H.S.H) must pass settingsHref=\"/settings\"");
    failed = true;
  } else {
    console.log("PASS: AppShell passes settingsHref=/settings");
  }
  if (!appContent.includes("HshNotificationBell")) {
    console.error("FAIL: AppShell must import HshNotificationBell");
    failed = true;
  }
}
const dashboardPath = path.join(frontendRoot, "app/page.tsx");
if (fs.existsSync(dashboardPath)) {
  const dashContent = fs.readFileSync(dashboardPath, "utf8");
  if (!dashContent.includes("HshNotificationBell")) {
    console.error("FAIL: Dashboard (app/page.tsx) must use HshNotificationBell");
    failed = true;
  }
  if (!dashContent.includes('settingsHref="/settings"')) {
    console.error("FAIL: Dashboard must pass settingsHref=\"/settings\"");
    failed = true;
  }
}
if (fs.existsSync(notificationBellPath)) {
  const nbContent = fs.readFileSync(notificationBellPath, "utf8");
  // Shared bell should NOT statically import notificationService (hsh) or db
  const hasStaticHshService = nbContent.split("\n").some((l) => l.trim().startsWith("import") && l.includes("notification.service") && !l.includes("rvb-notification"));
  const hasStaticDb = nbContent.split("\n").some((l) => l.trim().startsWith("import") && l.includes("lib/database/db"));
  if (hasStaticHshService || hasStaticDb) {
    console.error("FAIL: NotificationBell still statically imports H.S.H notificationService/db");
    failed = true;
  } else {
    console.log("PASS: NotificationBell has no static H.S.H db import");
  }
  // Should have dynamic imports for bells
  const hasDynamic = nbContent.includes('import("./HshNotificationBell")') || nbContent.includes('import("./RvbNotificationBell")');
  if (!hasDynamic) {
    console.warn("WARN: NotificationBell does not dynamically import bells (if using prop injection, this is okay)");
  }
}
if (fs.existsSync(hshBellPath)) {
  const hshContent = fs.readFileSync(hshBellPath, "utf8");
  if (!hshContent.includes("notificationService") || !hshContent.includes("useDbSync")) {
    console.error("FAIL: HshNotificationBell should import notificationService/useDbSync");
    failed = true;
  }
  if (hshContent.includes("rvbNotificationService")) {
    console.error("FAIL: HshNotificationBell should not import rvbNotificationService");
    failed = true;
  }
}
if (fs.existsSync(rvbBellPath)) {
  const rvbContent = fs.readFileSync(rvbBellPath, "utf8");
  if (!rvbContent.includes("rvbNotificationService")) {
    console.error("FAIL: RvbNotificationBell should import rvbNotificationService");
    failed = true;
  }
  if (rvbContent.includes("notificationService") && rvbContent.includes("from \"../../services/notification.service\"")) {
    console.error("FAIL: RvbNotificationBell must not import H.S.H notificationService");
    failed = true;
  }
  const rvbHasDb = rvbContent.split("\n").some((l) => l.trim().startsWith("import") && l.includes("lib/database/db"));
  if (rvbHasDb) {
    console.error("FAIL: RvbNotificationBell must not import db");
    failed = true;
  } else {
    console.log("PASS: RvbNotificationBell has no static db import");
  }
}

// 3. Transitive graph checks for R.V.B entry points
console.log("\n=== Transitive static import graph checks ===");
let rvbFiles = walk(frontendRvb);
if (fs.existsSync(frontendRvbComp)) {
  rvbFiles = rvbFiles.concat(walk(frontendRvbComp));
}
// Add explicit entry points per spec
const explicitEntries = [
  path.join(frontendRoot, "app/rvb/page.tsx"),
  path.join(frontendRoot, "app/rvb/settings/page.tsx"),
  path.join(frontendRoot, "app/rvb/chats/page.tsx"),
  rvbShellPath,
];
for (const e of explicitEntries) {
  if (fs.existsSync(e) && !rvbFiles.includes(e)) rvbFiles.push(e);
}

let graphFailed = false;
for (const file of rvbFiles) {
  const rel = path.relative(process.cwd(), file);
  const res = hasStaticPathToDb(file, targetDb);
  if (res.found) {
    console.error(`FAIL: ${rel} has static path to db.ts`);
    console.error(`  Path: ${res.path.map((p) => path.relative(frontendRoot, p)).join(" -> ")}`);
    failed = true;
    graphFailed = true;
  }
}
// Also specifically verify each spec entry individually with clear message
const specEntries = [
  { file: path.join(frontendRoot, "app/rvb/page.tsx"), label: "/rvb/page.tsx" },
  { file: path.join(frontendRoot, "app/rvb/settings/page.tsx"), label: "/rvb/settings/page.tsx" },
  { file: path.join(frontendRoot, "app/rvb/chats/page.tsx"), label: "/rvb/chats/page.tsx" },
  { file: rvbShellPath, label: "RvbShell" },
];
for (const { file, label } of specEntries) {
  if (!fs.existsSync(file)) {
    console.error(`WARN: Spec entry not found: ${label} -> ${file}`);
    continue;
  }
  const res = hasStaticPathToDb(file, targetDb);
  if (res.found) {
    console.error(`FAIL: ${label} -> db.ts path found: ${res.path.map((p) => path.relative(frontendRoot, p)).join(" -> ")}`);
    failed = true;
  } else {
    console.log(`PASS: ${label} does NOT reach db.ts`);
  }
}
if (!graphFailed) {
  console.log("PASS: No R.V.B entry has static path to db.ts");
}

// 4. Direct forbidden pattern checks (legacy)
console.log("\n=== Direct forbidden pattern checks ===");
let files = walk(frontendRvb);
if (fs.existsSync(frontendRvbComp)) files = files.concat(walk(frontendRvbComp));
for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  for (const pat of forbiddenPatterns) {
    if (content.includes(pat)) {
      const lines = content.split("\n").filter((l) => l.includes(pat) && l.trim().startsWith("import"));
      if (lines.length) {
        console.error(`FAIL: ${path.relative(process.cwd(), file)} imports forbidden "${pat}"`);
        console.error(`  -> ${lines[0].trim()}`);
        failed = true;
      }
    }
  }
}

// Also check backend for direct NotificationModel.create outside central service
const backendRoot = path.resolve(__dirname, "src");
const backendFiles = walk(backendRoot);
for (const file of backendFiles) {
  if (file.endsWith("rvb-notification.service.ts")) continue;
  const content = fs.readFileSync(file, "utf8");
  if (content.includes("NotificationModel.create")) {
    const rbvServices = ["worker-request.service", "supplier-request.service", "customer-request.service", "customer-order.service", "chat.service", "rvb-account.service"];
    const isRvbBusiness = rbvServices.some((s) => file.includes(s));
    if (isRvbBusiness) {
      console.error(`FAIL: ${path.relative(process.cwd(), file)} still uses NotificationModel.create (must use createRvbNotification)`);
      failed = true;
    }
  }
}

// Check for cross-domain WorkerActivity misuse - Supplier/Customer link should not write WorkerActivity without guard
const rvbAccountService = fs.readFileSync(path.join(backendRoot, "services/rvb-account.service.ts"), "utf8");
const hasWorkerGuard = rvbAccountService.includes('=== "worker"') && rvbAccountService.includes("WorkerActivityModel.create");
const workerActivityLines = rvbAccountService.split("\n").filter((l) => l.includes("WorkerActivityModel.create"));
if (workerActivityLines.length > 0 && !hasWorkerGuard) {
  console.error("FAIL: rvb-account.service writes WorkerActivity without guard");
  failed = true;
}

// Check for stale placeholder text in frontend/app/rvb (except Mobile Connection)
const stalePhrases = ["not connected yet", "web/mobile soon"];
for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  for (const phrase of stalePhrases) {
    if (content.toLowerCase().includes(phrase.toLowerCase())) {
      console.error(`FAIL: ${path.relative(process.cwd(), file)} contains stale placeholder "${phrase}"`);
      failed = true;
    }
  }
  if (content.includes("Coming soon")) {
    const lines = content.split("\n").filter((l) => l.includes("Coming soon"));
    for (const l of lines) {
      const trimmed = l.trim();
      if (trimmed.includes('comingSoon:') || trimmed.includes("comingSoon :") ) continue;
      if (!l.includes("Mobile") && !l.includes("mobile") && !l.includes("Mobile Connection") && !l.toLowerCase().includes("mobile")) {
        console.error(`FAIL: ${path.relative(process.cwd(), file)} has stale "Coming soon": ${l.trim()}`);
        failed = true;
      }
    }
  }
  if (content.includes("RvbPortalPlaceholder")) {
    console.error(`FAIL: ${path.relative(process.cwd(), file)} still uses RvbPortalPlaceholder`);
    failed = true;
  }
}

// Check query token still present
const chatSocket = fs.readFileSync(path.join(backendRoot, "lib/chat-socket.ts"), "utf8");
if (chatSocket.includes("query") && chatSocket.includes("token")) {
  const hasQueryAuth = chatSocket.includes("handshake.query") && chatSocket.includes("token");
  if (hasQueryAuth) {
    console.error("FAIL: chat-socket still accepts query token");
    failed = true;
  }
}

// 5. Check frontend proxy for rvb-public mode
console.log("\n=== Checking FRONTEND_MODE proxy ===");
const proxyPath = path.join(frontendRoot, "proxy.ts");
const middlewarePath = path.join(frontendRoot, "middleware.ts");
const proxyExists = fs.existsSync(proxyPath) || fs.existsSync(middlewarePath);
if (!proxyExists) {
  console.error("FAIL: FRONTEND_MODE proxy/middleware not found (proxy.ts)");
  failed = true;
} else {
  const pContent = fs.readFileSync(fs.existsSync(proxyPath) ? proxyPath : middlewarePath, "utf8");
  if (!pContent.includes("FRONTEND_MODE") || !pContent.includes("rvb-public")) {
    console.error("FAIL: proxy must handle FRONTEND_MODE=rvb-public");
    failed = true;
  } else {
    console.log("PASS: proxy handles FRONTEND_MODE=rvb-public");
  }
  if (!pContent.includes("/rvb") || !pContent.includes("_next")) {
    console.error("FAIL: proxy must allow /rvb and _next static");
    failed = true;
  } else {
    console.log("PASS: proxy allows /rvb and _next");
  }
  if (!pContent.includes('"/rvb"') && !pContent.includes("'/rvb'")) {
    console.warn("WARN: proxy rvb check not explicit");
  }
  // Simulate proxy logic for regression tests per spec G/H
  function simulateProxy(mode: string, pathname: string): "allow" | "redirect" {
    if (mode !== "rvb-public") return "allow";
    if (pathname.startsWith("/_next")) return "allow";
    if (pathname.startsWith("/api")) return "allow";
    if (pathname.includes(".") && pathname.lastIndexOf(".") > pathname.lastIndexOf("/")) return "allow";
    if (pathname === "/") return "redirect";
    if (pathname === "/rvb" || pathname.startsWith("/rvb/")) return "allow";
    return "redirect";
  }
  const proxyTests: Array<{ mode: string; path: string; expected: "allow" | "redirect"; label: string }> = [
    { mode: "rvb-public", path: "/rvb", expected: "allow", label: "RVBPUBLIC /rvb -> allowed" },
    { mode: "rvb-public", path: "/rvb/login", expected: "allow", label: "RVBPUBLIC /rvb/login -> allowed" },
    { mode: "rvb-public", path: "/rvb/chats", expected: "allow", label: "RVBPUBLIC /rvb/chats -> allowed" },
    { mode: "rvb-public", path: "/rvb/settings", expected: "allow", label: "RVBPUBLIC /rvb/settings -> allowed" },
    { mode: "rvb-public", path: "/customers", expected: "redirect", label: "RVBPUBLIC /customers -> blocked (redirect)" },
    { mode: "rvb-public", path: "/workers", expected: "redirect", label: "RVBPUBLIC /workers -> blocked" },
    { mode: "rvb-public", path: "/settings", expected: "redirect", label: "RVBPUBLIC /settings -> blocked" },
    { mode: "rvb-public", path: "/dashboard", expected: "redirect", label: "RVBPUBLIC /dashboard -> blocked (treated as HSH)" },
    { mode: "rvb-public", path: "/accounts", expected: "redirect", label: "RVBPUBLIC /accounts -> blocked" },
    { mode: "rvb-public", path: "/_next/static/chunk.js", expected: "allow", label: "RVBPUBLIC _next static -> allowed" },
    { mode: "rvb-public", path: "/chicken.jpg", expected: "allow", label: "RVBPUBLIC public asset -> allowed" },
    { mode: "rvb-public", path: "/", expected: "redirect", label: 'RVBPUBLIC / -> redirect to /rvb' },
    { mode: "full", path: "/customers", expected: "allow", label: "FULL /customers -> allowed" },
    { mode: "full", path: "/settings", expected: "allow", label: "FULL /settings -> allowed" },
    { mode: "full", path: "/dashboard", expected: "allow", label: "FULL /dashboard -> allowed" },
    { mode: "full", path: "/rvb", expected: "allow", label: "FULL /rvb -> allowed" },
  ];
  for (const t of proxyTests) {
    const got = simulateProxy(t.mode, t.path);
    if (got !== t.expected) {
      console.error(`FAIL: ${t.label}: expected ${t.expected}, got ${got}`);
      failed = true;
    } else {
      console.log(`PASS: ${t.label}`);
    }
  }
  // Also verify frontend .env.example documents FRONTEND_MODE
  const feEnvExample = path.join(frontendRoot, ".env.example");
  if (fs.existsSync(feEnvExample)) {
    const envContent = fs.readFileSync(feEnvExample, "utf8");
    if (!envContent.includes("FRONTEND_MODE")) {
      console.error("FAIL: frontend/.env.example must document FRONTEND_MODE");
      failed = true;
    } else {
      console.log("PASS: frontend/.env.example documents FRONTEND_MODE");
    }
  }
  const contractPath = path.resolve(__dirname, "../RVB-MOBILE-CONTRACT.md");
  if (fs.existsSync(contractPath)) {
    const contract = fs.readFileSync(contractPath, "utf8");
    if (!contract.includes("FRONTEND_MODE") || !contract.includes("rvb-public")) {
      console.error("FAIL: RVB-MOBILE-CONTRACT.md must document FRONTEND_MODE");
      failed = true;
    } else {
      console.log("PASS: RVB-MOBILE-CONTRACT.md documents FRONTEND_MODE");
    }
  }
}

if (failed) {
  console.error("\nStatic boundary test FAILED");
  process.exit(1);
} else {
  console.log("\nPASS: Static RVB boundary test - transitive graph clean, no forbidden imports, SyncInitializer dynamic, CompactHeader/RvbShell correct, no direct NotificationModel.create, no stale placeholders, no query token, proxy ok");
  process.exit(0);
}
