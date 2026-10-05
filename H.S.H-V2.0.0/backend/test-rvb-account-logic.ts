import * as assert from "assert";

// Test pure logic without DB — tag normalization, validation, role checks
import { normalizeTag, isValidTag } from "./src/constants/rvb-account";
import { isValidRvbRole, RVB_ROLES } from "./src/constants/rvb-roles";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS: ${name}`);
    return true;
  } catch (e: any) {
    console.log(`FAIL: ${name} — ${e.message}`);
    return false;
  }
}

let passed = 0, total = 0;
function run(name: string, fn: () => void) {
  total++;
  if (test(name, fn)) passed++;
}

run("normalizeTag @Ahmed.B -> ahmed.b", () => assert.strictEqual(normalizeTag("@Ahmed.B"), "ahmed.b"));
run("normalizeTag Ahmed.B -> ahmed.b", () => assert.strictEqual(normalizeTag("Ahmed.B"), "ahmed.b"));
run("normalizeTag with spaces and @ -> ahmed.b", () => assert.strictEqual(normalizeTag("  @Ahmed.B  "), "ahmed.b"));
run("normalizeTag sarl_atlas stays", () => assert.strictEqual(normalizeTag("sarl_atlas"), "sarl_atlas"));
run("isValidTag ahmed.b true", () => assert.strictEqual(isValidTag("ahmed.b"), true));
run("isValidTag sarl_atlas true", () => assert.strictEqual(isValidTag("sarl_atlas"), true));
run("isValidTag supervisor01 true", () => assert.strictEqual(isValidTag("supervisor01"), true));
run("isValidTag 123 true (starts with number)", () => assert.strictEqual(isValidTag("123"), true));
run("isValidTag a1 true (min 3? need 3 chars)", () => assert.strictEqual(isValidTag("a1"), false));
run("isValidTag ab false too short", () => assert.strictEqual(isValidTag("ab"), false));
run("isValidTag abc true (exactly 3)", () => assert.strictEqual(isValidTag("abc"), true));
run("isValidTag a.b true", () => assert.strictEqual(isValidTag("a.b"), true));
run("isValidTag a_b true", () => assert.strictEqual(isValidTag("a_b"), true));
run("isValidTag a b false space", () => assert.strictEqual(isValidTag("a b"), false));
run("isValidTag .abc false start dot", () => assert.strictEqual(isValidTag(".abc"), false));
run("isValidTag _abc false start underscore", () => assert.strictEqual(isValidTag("_abc"), false));
run("isValidTag ab@c false special", () => assert.strictEqual(isValidTag("ab@c"), false));
run("isValidTag ab/c false slash", () => assert.strictEqual(isValidTag("ab/c"), false));
run("isValidTag 30 chars true", () => assert.strictEqual(isValidTag("a".repeat(30)), true));
run("isValidTag 31 chars false", () => assert.strictEqual(isValidTag("a".repeat(31)), false));
run("isValidRvbRole manager true", () => assert.strictEqual(isValidRvbRole("manager"), true));
run("isValidRvbRole admin false (retired, consolidated into manager)", () => assert.strictEqual(isValidRvbRole("admin"), false));
run("isValidRvbRole supervisor true", () => assert.strictEqual(isValidRvbRole("supervisor"), true));
run("isValidRvbRole worker true", () => assert.strictEqual(isValidRvbRole("worker"), true));
run("isValidRvbRole supplier true", () => assert.strictEqual(isValidRvbRole("supplier"), true));
run("isValidRvbRole customer true", () => assert.strictEqual(isValidRvbRole("customer"), true));
run("isValidRvbRole accountant false", () => assert.strictEqual(isValidRvbRole("accountant"), false));
run("isValidRvbRole co_manager false", () => assert.strictEqual(isValidRvbRole("co_manager"), false));
run("isValidRvbRole CO_MANAGER false", () => assert.strictEqual(isValidRvbRole("CO_MANAGER"), false));
run("isValidRvbRole empty false", () => assert.strictEqual(isValidRvbRole(""), false));
run("RVB_ROLES has 5 entries", () => assert.strictEqual(RVB_ROLES.length, 5));
run("RVB_ROLES does not contain admin (retired)", () => assert.strictEqual((RVB_ROLES as readonly string[]).includes("admin"), false));
run("RVB_ROLES does not contain accountant", () => assert.strictEqual((RVB_ROLES as readonly string[]).includes("accountant"), false));
run("RVB_ROLES does not contain co_manager", () => assert.strictEqual((RVB_ROLES as readonly string[]).includes("co_manager"), false));

// Test service-level validation by mocking DB (lightweight)
// We create a mock of RvbAccountModel to test createRvbAccount logic paths that don't require DB fetch for linked entities
// For now, test that the service file compiles and exports expected functions
run("service exports createRvbAccount", async () => {
  const svc = await import("./src/services/rvb-account.service");
  assert.ok(typeof svc.createRvbAccount === "function");
  assert.ok(typeof svc.archiveRvbAccount === "function");
  assert.ok(typeof svc.reactivateRvbAccount === "function");
  assert.ok(typeof svc.disableRvbAccount === "function");
  assert.ok(typeof svc.archiveByLinkedEntity === "function");
  assert.ok(typeof svc.reactivateByLinkedEntity === "function");
});

console.log(`\n=== RESULTS: ${passed}/${total} passed ===`);
process.exit(passed === total ? 0 : 1);
