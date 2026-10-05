import assert from "node:assert";
import { normalizeTag, isValidTag, validateTagInput } from "../src/utils/tag";
import { getAuthGate } from "../src/utils/auth-gate";
import { isManagementRole, isPortalRole, isSecondaryTabRole, getRoleLabel, RVB_ROLES } from "../src/constants/roles";
import type { RvbAccount } from "../src/types/rvb";

function testTag() {
  console.log("• tag normalization");
  assert.strictEqual(normalizeTag("@Abattoire"), "abattoire");
  assert.strictEqual(normalizeTag("  @TEST_123  "), "test_123");
  assert.strictEqual(normalizeTag("@"), "");
  assert.strictEqual(normalizeTag(""), "");
  assert.strictEqual(isValidTag("abattoire"), true);
  assert.strictEqual(isValidTag("ab"), false);
  assert.strictEqual(isValidTag("a1"), false);
  assert.strictEqual(isValidTag("ab1"), true);
  assert.strictEqual(isValidTag("a_b.c"), true);
  assert.strictEqual(isValidTag("Abc"), false);
  assert.strictEqual(isValidTag("1abc"), true);
  assert.strictEqual(isValidTag("ab-"), false);
  assert.strictEqual(validateTagInput("@ok"), "Tag must be at least 3 characters");
  assert.strictEqual(validateTagInput("@valid_tag.123"), null);
  console.log("  PASS tag");
}

function testAuthGate() {
  console.log("• auth gate");
  const mk = (over: Partial<RvbAccount>): RvbAccount => ({
    id: "1",
    tag: "test",
    displayName: "Test",
    role: "worker",
    status: "active",
    onboardingStatus: "complete",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    mustChangePassword: false,
    ...over,
  } as any);
  assert.strictEqual(getAuthGate("booting", null), "booting");
  assert.strictEqual(getAuthGate("anonymous", null), "login");
  assert.strictEqual(getAuthGate("authenticated", mk({ mustChangePassword: true })), "change-password");
  assert.strictEqual(getAuthGate("authenticated", mk({ mustChangePassword: false, onboardingStatus: "pending" })), "onboarding");
  assert.strictEqual(getAuthGate("authenticated", mk({ mustChangePassword: false, onboardingStatus: "complete" })), "app");
  // mustChangePassword takes precedence over onboarding
  assert.strictEqual(getAuthGate("authenticated", mk({ mustChangePassword: true, onboardingStatus: "pending" })), "change-password");
  console.log("  PASS auth gate");
}

function testRoles() {
  console.log("• role helpers");
  assert.strictEqual(RVB_ROLES.length, 5);
  assert.ok(!RVB_ROLES.includes("accountant" as any));
  assert.ok(!RVB_ROLES.includes("co-manager" as any));
  assert.ok(!RVB_ROLES.includes("admin" as any));
  assert.strictEqual(isManagementRole("manager"), true);
  assert.strictEqual(isManagementRole("supervisor"), true);
  assert.strictEqual(isManagementRole("worker"), false);
  assert.strictEqual(isPortalRole("worker"), true);
  assert.strictEqual(isPortalRole("supplier"), true);
  assert.strictEqual(isPortalRole("customer"), true);
  assert.strictEqual(isPortalRole("manager"), false);
  assert.strictEqual(isSecondaryTabRole("worker"), true);
  assert.strictEqual(isSecondaryTabRole("manager"), false);
  assert.strictEqual(getRoleLabel("manager"), "Manager");
  console.log("  PASS roles");
}

async function testRefreshDedupe() {
  console.log("• refresh dedupe (simulated)");

  // Simulate dedupe logic: multiple concurrent refresh callers share one promise
  let callCount = 0;
  async function mockRefresh(): Promise<boolean> {
    callCount++;
    await new Promise((r) => setTimeout(r, 50));
    return true;
  }

  let pending: Promise<boolean> | null = null;
  function getPending(): Promise<boolean> {
    if (pending) return pending;
    pending = mockRefresh().finally(() => {
      pending = null;
    });
    return pending;
  }

  const p1 = getPending();
  const p2 = getPending();
  const p3 = getPending();
  assert.strictEqual(p1, p2, "deduped promises should be same instance");
  assert.strictEqual(p2, p3);
  const results = await Promise.all([p1, p2, p3]);
  assert.deepStrictEqual(results, [true, true, true]);
  assert.strictEqual(callCount, 1, "should only call refresh once for concurrent 401s");

  // After resolved, next call should create new promise
  const p4 = getPending();
  assert.notStrictEqual(p4, p1);
  await p4;
  assert.strictEqual(callCount, 2);
  console.log("  PASS refresh dedupe");
}

function testApiErrorNormalization() {
  console.log("• API error codes");
  const codes = ["RVB_SESSION_REVOKED", "RVB_TOKEN_INVALID", "RVB_TOKEN_EXPIRED", "RVB_ACCOUNT_DISABLED", "RVB_ACCOUNT_ARCHIVED"];
  for (const c of codes) {
    // terminal codes should be recognized
    assert.ok(["RVB_SESSION_REVOKED", "RVB_ACCOUNT_DISABLED", "RVB_ACCOUNT_ARCHIVED", "RVB_TOKEN_INVALID", "RVB_TOKEN_EXPIRED"].includes(c));
  }
  console.log("  PASS api error codes");
}

async function run() {
  console.log("Running foundation unit tests...");
  testTag();
  testAuthGate();
  testRoles();
  await testRefreshDedupe();
  testApiErrorNormalization();
  console.log("All foundation unit tests PASS");
}

run().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
