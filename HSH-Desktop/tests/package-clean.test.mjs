import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanPackageClean } from "../scripts/assert-package-clean.mjs";

describe("package-clean scanner", () => {
  it("flags .env files, keys, and Mongo/JWT secrets", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hshd-dirty-"));
    fs.writeFileSync(path.join(dir, ".env"), "MONGODB_URI=mongodb+srv://u:p@c/x\n");
    fs.writeFileSync(path.join(dir, "app.js"), 'const s="AKIAIOSFODNN7EXAMPLE";');
    fs.writeFileSync(path.join(dir, "note.txt"), "RVB_JWT_ACCESS_SECRET = hunter2value here");
    const v = scanPackageClean(dir);
    assert.ok(v.some((x) => x.includes(".env")), JSON.stringify(v));
    assert.ok(v.some((x) => x.includes("mongodb") || x.includes("AKIA") || x.includes("RVB_JWT")), JSON.stringify(v));
  });
  it("passes a clean tree", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hshd-clean-"));
    fs.writeFileSync(path.join(dir, "server.js"), "console.log('NEXT_PUBLIC_API_URL default http://localhost:5000');");
    assert.deepEqual(scanPackageClean(dir), []);
  });
});
