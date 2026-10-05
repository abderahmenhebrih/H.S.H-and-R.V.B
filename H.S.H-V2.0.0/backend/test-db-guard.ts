import * as assert from "assert";
import {
  assertSafeTestDatabase,
  assertLiveQaTarget,
  dbNameFromUri,
  isTestRunner,
  REFUSAL_MESSAGE,
} from "./src/lib/test-db-guard";

const PROD = "mongodb+srv://user:pass@cluster0.omxs0ia.mongodb.net/hebrih-slaughter-house?retryWrites=true";
const PROD_NOSRV = "mongodb://127.0.0.1:27017/hebrih-slaughter-house";
const TESTNAMED = "mongodb://127.0.0.1:27017/hebrih-slaughter-house-test";
const TESTRUN = "mongodb://127.0.0.1:27017/hebrih-slaughter-house-test-abc123?retryWrites=false";
const MEMORY = "mongodb://127.0.0.1:51234/test-9f8a2b1c";

function expectThrow(fn: () => void, part: string, name: string) {
  try {
    fn();
  } catch (e: any) {
    assert.ok(String(e?.message || e).includes(part), `${name}: wrong message: ${e?.message}`);
    console.log(`PASS: ${name}`);
    return;
  }
  throw new Error(`FAIL: ${name} did not throw`);
}

async function main() {
  assert.strictEqual(dbNameFromUri(PROD), "hebrih-slaughter-house");
  console.log("PASS: parses srv URI db name");
  assert.strictEqual(dbNameFromUri(MEMORY), "test-9f8a2b1c");
  console.log("PASS: parses memory URI db name");

  expectThrow(() => assertSafeTestDatabase(PROD), REFUSAL_MESSAGE, "ordinary test + prod srv URI refused");
  expectThrow(() => assertSafeTestDatabase(PROD_NOSRV), REFUSAL_MESSAGE, "ordinary test + prod db name refused");
  assert.strictEqual(assertSafeTestDatabase(TESTNAMED), "hebrih-slaughter-house-test");
  console.log("PASS: ordinary test + test db allowed");
  assert.strictEqual(assertSafeTestDatabase(TESTRUN), "hebrih-slaughter-house-test-abc123");
  console.log("PASS: ordinary test + run-scoped test db allowed");
  assert.strictEqual(assertSafeTestDatabase(MEMORY), "test-9f8a2b1c");
  console.log("PASS: ordinary test + memory db allowed");

  expectThrow(() => assertLiveQaTarget(PROD, { liveQa: true }), "ALLOW_PRODUCTION_QA", "live QA without override refused");
  expectThrow(() => assertLiveQaTarget(PROD), "liveQa:true", "live QA without caller flag refused");
  process.env.ALLOW_PRODUCTION_QA = "1";
  assert.strictEqual(assertLiveQaTarget(PROD, { liveQa: true }), "hebrih-slaughter-house");
  console.log("PASS: live QA with override allowed (no mutation performed)");
  delete process.env.ALLOW_PRODUCTION_QA;

  console.log(`isTestRunner signal present: ${isTestRunner()}`);
  console.log("\nAll guard unit checks passed.");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
