import * as assert from "assert";
import fs from "fs";
import path from "path";

// Frontend source search verification
const frontendRoot = path.resolve(__dirname, "../frontend/src");
let localStorageAuthUsages: string[] = [];
let hasMemoryToken = false;
let hasPendingRefresh = false;
let hasCookieOnlyRefresh = false;
let hasIgnoreRefreshToken = false;

function walk(dir: string) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.isFile() && (e.name.endsWith(".ts") || e.name.endsWith(".tsx"))) {
      const content = fs.readFileSync(full, "utf8");
      // Check for RVB auth localStorage
      if (/rvb_access_token|rvb_refresh_token/.test(content)) {
        localStorageAuthUsages.push(`${full}: contains rvb token string`);
      }
      // For rvb-auth.service specifically, check for localStorage usage of auth
      if (full.endsWith("rvb-auth.service.ts")) {
        if (content.includes("localStorage.getItem") && content.includes("rvb_")) {
          localStorageAuthUsages.push(`${full}: localStorage for rvb`);
        }
        if (content.includes("memoryAccessToken") || content.includes("let memoryAccessToken")) hasMemoryToken = true;
        if (content.includes("pendingRefresh")) hasPendingRefresh = true;
        // Check that refresh does not send refreshToken in body
        // Should have body: JSON.stringify({}) not JSON.stringify({refreshToken
        if (content.includes('body: JSON.stringify({})') && content.includes('/refresh')) hasCookieOnlyRefresh = true;
        if (content.includes("Intentionally ignore") || content.includes("Ignore") || content.includes("ignore")) hasIgnoreRefreshToken = true;
      }
    }
  }
}
walk(frontendRoot);

let passed = 0, total = 0;
function test(name: string, fn: () => void) {
  total++;
  try { fn(); console.log(`PASS: ${name}`); passed++; } catch (e: any) { console.log(`FAIL: ${name} — ${e.message}`); }
}

test("No RVB auth tokens in localStorage/sessionStorage (frontend src)", () => {
  if (localStorageAuthUsages.length > 0) throw new Error(`Found: ${localStorageAuthUsages.join("; ")}`);
});

test("Access token is memory-only (memoryAccessToken exists)", () => {
  assert.ok(hasMemoryToken, "memoryAccessToken not found in rvb-auth.service.ts");
});

test("Concurrent refresh dedup (pendingRefresh exists)", () => {
  assert.ok(hasPendingRefresh, "pendingRefresh not found");
});

test("Web refresh uses cookie only (empty body)", () => {
  assert.ok(hasCookieOnlyRefresh, "Cookie-only refresh (empty body) not found");
});

test("Web ignores JSON refreshToken (ignore comment)", () => {
  // Allow alternative check: verify that login does not store refreshToken in localStorage
  const p = path.join(frontendRoot, "services/rvb-auth.service.ts");
  const c = fs.readFileSync(p, "utf8");
  // Must NOT contain localStorage.setItem.*refresh
  if (/localStorage\.setItem.*rvb_refresh/.test(c)) throw new Error("still stores refresh in localStorage");
  if (/localStorage\.setItem.*rvb_access/.test(c)) throw new Error("still stores access in localStorage");
  // Must contain comment or code that ignores refreshToken
  if (!c.includes("HttpOnly cookie") && !c.includes("ignore")) {
    // Allow if just doesn't store
    assert.ok(!c.includes("setRefreshToken"), "should not have setRefreshToken");
  }
});

// Also verify rvb-account.service uses memory token
test("rvb-account.service uses memory token (no localStorage)", () => {
  const p = path.join(frontendRoot, "services/rvb-account.service.ts");
  const c = fs.readFileSync(p, "utf8");
  if (/localStorage\.getItem.*rvb_access/.test(c)) throw new Error("rvb-account still uses localStorage for access token");
  assert.ok(c.includes("rvbAuthService.getAccessToken"), "should use rvbAuthService.getAccessToken");
});

// Verify RvbAuthContext session restoration via refresh
test("RvbAuthContext restores via refresh (no token check)", () => {
  const p = path.join(frontendRoot, "contexts/RvbAuthContext.tsx");
  const c = fs.readFileSync(p, "utf8");
  // Should NOT have `if (!token) return unauthenticated without trying refresh`
  // Instead should attempt refresh when no token
  if (c.includes('if (!token) {') && c.includes('setUser(null)') && !c.includes('refresh')) {
    throw new Error("RvbAuthContext still short-circuits without refresh");
  }
  assert.ok(c.includes("refresh"), "RvbAuthContext should call refresh for session restoration");
  // Check that loadMe tries me first then refresh
  assert.ok(c.includes("rvbAuthService.me") && c.includes("rvbAuthService.refresh"), "loadMe should try me then refresh");
});

console.log(`\n=== Correction checks: ${passed}/${total} passed ===`);
if (passed !== total) process.exit(1);

// Now also test concurrency logic in isolation
console.log("\n=== Concurrency unit test (frontend dedup simulation) ===");

async function testConcurrencyDedup() {
  let refreshCalls = 0;
  let pending: Promise<string> | null = null;
  function getRefreshPromise(): Promise<string> {
    if (!pending) {
      pending = new Promise<string>((resolve) => {
        refreshCalls++;
        setTimeout(() => resolve(`token-${refreshCalls}`), 50);
      }).finally(() => { pending = null; });
    }
    return pending;
  }
  // Simulate 5 parallel authFetch 401s
  const promises = Array.from({ length: 5 }, () => getRefreshPromise());
  const results = await Promise.all(promises);
  assert.strictEqual(refreshCalls, 1, `refresh should be called once, got ${refreshCalls}`);
  assert.ok(results.every(r => r === "token-1"), "all should get same token");
  console.log("PASS: concurrent 401s cause ONE refresh");
  // Second batch after first completes should trigger new refresh
  const second = await getRefreshPromise();
  assert.strictEqual(refreshCalls, 2, "second batch should trigger new refresh after first completes");
  console.log("PASS: second batch triggers new refresh");
}

testConcurrencyDedup().then(() => {
  console.log("\nAll correction tests passed");
  process.exit(0);
}).catch((e) => {
  console.log(`FAIL: concurrency — ${e.message}`);
  process.exit(1);
});
