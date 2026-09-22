import fs from "fs";
import path from "path";

const frontendRvb = path.resolve(__dirname, "../frontend/app/rvb");
const forbiddenPatterns = [
  "src/lib/database/db",
  "src/services/worker.service",
  "src/services/supplier.service",
  "src/services/customer.service",
  "src/services/purchase.service",
  "src/services/sale.service",
  "src/services/payment.service",
  "services/operations/worker",
  "services/operations/supplier",
  "services/operations/customer",
  "services/operations/purchase",
  "services/operations/sale",
  "services/operations/payment",
  "from \"@/src/lib/database",
  "from '@/src/lib/database",
];

const allowedPresentation = [
  // formatCurrency etc. from lib/settings is allowed
  "lib/settings",
  "lib/money",
  "lib/id",
];

function walk(dir: string, files: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && (full.endsWith(".ts") || full.endsWith(".tsx"))) files.push(full);
  }
  return files;
}

let failed = false;
if (!fs.existsSync(frontendRvb)) {
  console.error(`Frontend RVB dir not found: ${frontendRvb}`);
  process.exit(1);
}
const files = walk(frontendRvb);
for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  for (const pat of forbiddenPatterns) {
    if (content.includes(pat)) {
      // Allow if it's a comment? We check import lines explicitly
      const lines = content.split("\n").filter((l) => l.includes(pat) && l.trim().startsWith("import"));
      // For operations, any import is forbidden unless presentation-only utility (none of these are)
      if (lines.length) {
        // Check if it's explicitly presentation-only shared utility not exposing records - we have none, but we can allow if file is not business entity
        // For now, fail
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
const central = "src/services/rvb-notification.service.ts";
for (const file of backendFiles) {
  if (file.endsWith("rvb-notification.service.ts")) continue;
  const rel = path.relative(path.resolve(__dirname, "src"), file);
  const content = fs.readFileSync(file, "utf8");
  if (content.includes("NotificationModel.create")) {
    // Allow only if it's H.S.H sync? But spec says no R.V.B workflow may bypass. So any file under services that is R.V.B business should not use direct.
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
      // Allow translation definitions like comingSoon: "Coming soon" or system status where mobile is explicitly allowed
      if (trimmed.includes('comingSoon:') || trimmed.includes("comingSoon :") ) continue;
      if (!l.includes("Mobile") && !l.includes("mobile") && !l.includes("Mobile Connection") && !l.toLowerCase().includes("mobile")) {
        console.error(`FAIL: ${path.relative(process.cwd(), file)} has stale "Coming soon": ${l.trim()}`);
        failed = true;
      }
    }
  }
  // Check for remaining RvbPortalPlaceholder usage (should be zero imports)
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

if (failed) {
  console.error("\nStatic boundary test FAILED");
  process.exit(1);
} else {
  console.log("PASS: Static RVB boundary test - no forbidden imports, no direct NotificationModel.create in R.V.B services, no stale placeholders, no query token");
  process.exit(0);
}
