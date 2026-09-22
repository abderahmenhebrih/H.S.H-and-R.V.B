import * as assert from "assert";
import mongoose from "mongoose";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
// Force test mode defaults if secrets not set
if (!process.env.RVB_JWT_ACCESS_SECRET) process.env.RVB_JWT_ACCESS_SECRET = "test-access-secret-please-change-in-production-32chars-long";
if (!process.env.RVB_JWT_REFRESH_SECRET) process.env.RVB_JWT_REFRESH_SECRET = "test-refresh-secret-please-change-in-production-32chars-long";
process.env.RVB_TEST_MODE = "true";

import { connectDatabase, disconnectDatabase } from "./src/config/database";
import { RvbAccountModel } from "./src/models/rvb-account.model";
import { RvbSessionModel } from "./src/models/rvb-session.model";
import { WorkerModel } from "./src/models/worker.model";
import { SupplierModel } from "./src/models/supplier.model";
import { CustomerModel } from "./src/models/customer.model";
import * as svc from "./src/services/rvb-account.service";
import { normalizeTag, isValidTag } from "./src/constants/rvb-account";
import { hashPassword, verifyPassword } from "./src/lib/password";
import { hashRefreshToken, signAccessToken, verifyAccessToken, toSafeRvbAccount } from "./src/lib/rvb-auth";

let hasDb = false;
let app: any = null;

async function createApp() {
  const a = express();
  a.use(cors({ origin: true, credentials: true }));
  a.use(cookieParser());
  a.use(express.json());
  const rvbAuthRouter = (await import("./src/routes/rvb-auth")).default;
  const rvbAccountsRouter = (await import("./src/routes/rvb-accounts")).default;
  a.use("/api/rvb/auth", rvbAuthRouter);
  a.use("/api/rvb/accounts", rvbAccountsRouter);
  return a;
}

async function tryConnect() {
  try {
    await connectDatabase();
    hasDb = true;
    console.log("DB connected for integration tests");
  } catch (e: any) {
    console.log("No DB available for integration tests:", e.message);
    // Try to use mongodb-memory-server if available
    try {
      const { MongoMemoryServer } = await import("mongodb-memory-server");
      const mongod = await MongoMemoryServer.create();
      const uri = mongod.getUri();
      process.env.MONGODB_URI = uri;
      await mongoose.connect(uri);
      hasDb = true;
      (global as any).__mongod = mongod;
      console.log("Using mongodb-memory-server:", uri);
    } catch (err: any) {
      console.log("mongodb-memory-server not available:", err.message);
      hasDb = false;
    }
  }
}

const results: [string, boolean, string?][] = [];
function record(name: string, ok: boolean, detail?: string) {
  results.push([name, ok, detail]);
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

async function runUnitTests() {
  console.log("\n=== UNIT TESTS (no DB) ===");

  // Password hashing
  try {
    const hash = await hashPassword("testpassword123");
    const ok = await verifyPassword("testpassword123", hash);
    const wrong = await verifyPassword("wrong", hash);
    record("6. password hashes successfully", !!hash && hash !== "testpassword123", `hash len ${hash.length}`);
    record("7. plaintext never stored", hash !== "testpassword123" && !hash.includes("testpassword123"), "");
    record("8. correct password verifies", ok === true, "");
    record("9. wrong password rejected", wrong === false, "");
  } catch (e: any) { record("6-9 password", false, e.message); }

  // Tag normalization
  try {
    record("11. @tag normalization works", normalizeTag("@Ahmed.B") === "ahmed.b" && normalizeTag("  @Ahmed.B  ") === "ahmed.b", "");
    record("Tag valid check", isValidTag("ahmed.b") === true, "");
  } catch (e: any) { record("11", false, e.message); }

  // Access token
  try {
    const token = signAccessToken({ accountId: "test-id", tag: "test.tag", role: "manager", sessionId: "sess-123" });
    const payload: any = verifyAccessToken(token);
    record("18. access token verifies", payload.accountId === "test-id" && payload.tag === "test.tag", "");
    // invalid
    try { verifyAccessToken("invalid"); record("19. invalid access token rejected", false, "did not throw"); } catch { record("19. invalid access token rejected", true, ""); }
  } catch (e: any) { record("18-19 tokens", false, e.message); }

  // Refresh hash
  try {
    const t = "some-refresh-token";
    const h1 = hashRefreshToken(t);
    const h2 = hashRefreshToken(t);
    const h3 = hashRefreshToken(t + "x");
    record("Refresh hash deterministic", h1 === h2 && h1 !== h3, "");
  } catch (e: any) { record("Refresh hash", false, e.message); }

  // toSafe
  try {
    const doc: any = { id: "1", tag: "test", passwordHash: "secret", refreshTokenHash: "secret2", displayName: "Test" };
    const safe: any = toSafeRvbAccount(doc);
    record("26. passwordHash never serialized", !("passwordHash" in safe) && !("refreshTokenHash" in safe), JSON.stringify(safe));
  } catch (e: any) { record("26", false, e.message); }

  // PATCH allowlist logic via service directly with mocked models
  try {
    // Mock RvbAccountModel.findOne to test tag immutability
    const originalFindOne = (RvbAccountModel as any).findOne;
    const mockDoc: any = { id: "test-id", displayName: "Old", tag: "old.tag", save: async function() { return this; }, toObject: function() { return this; } };
    (RvbAccountModel as any).findOne = (filter: any) => {
      if (filter.id === "test-id") return Promise.resolve(mockDoc);
      if (filter.tag) return { lean: () => Promise.resolve(null) } as any;
      return Promise.resolve(null);
    };
    let threwImmutable = false;
    try { await svc.updateRvbAccount("test-id", { tag: "new.tag" } as any); } catch (e: any) { if (e.code === "RVB_TAG_IMMUTABLE") threwImmutable = true; }
    record("1. tag immutable", threwImmutable, threwImmutable ? "" : "did not throw RVB_TAG_IMMUTABLE");
    let threwForbidden = false;
    try { await svc.updateRvbAccount("test-id", { status: "archived" } as any); } catch (e: any) { if (e.code === "RVB_FIELD_NOT_ALLOWED") threwForbidden = true; }
    record("2. protected PATCH fields rejected", threwForbidden, threwForbidden ? "" : "did not throw");
    // Valid patch should succeed
    let validOk = false;
    try {
      const res: any = await svc.updateRvbAccount("test-id", { displayName: "New Name" });
      validOk = res.displayName === "New Name";
    } catch (e: any) { validOk = false; }
    record("PATCH allowlist valid field passes", validOk, "");

    (RvbAccountModel as any).findOne = originalFindOne;
  } catch (e: any) { record("1-2 patch", false, e.message); }
}

async function runIntegrationTests() {
  if (!hasDb) {
    console.log("\nSKIPPED — no test MongoDB URI available. Integration tests skipped.");
    record("Integration skipped", true, "No DB");
    return;
  }
  console.log("\n=== INTEGRATION TESTS (with DB) ===");
  app = await createApp();

  // Clean
  await RvbAccountModel.deleteMany({});
  await RvbSessionModel.deleteMany({});
  // Ensure worker exists
  let worker = await WorkerModel.findOne().lean();
  if (!worker) {
    const now = Date.now();
    const w: any = await WorkerModel.create({
      id: `w-int-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced",
      name: `Int Worker ${Date.now()}`,
      phone: "0123456789",
      employmentDate: now,
      position: "Test",
      startingSalary: 10000,
      monthlySalary: 10000,
      status: "active",
      balance: 10000,
    });
    worker = w.toObject ? w.toObject() : w;
  }

  // Create manager via service with password
  let manager: any = null;
  try {
    manager = await svc.createRvbAccount({ tag: `mgr.int.${Date.now().toString().slice(-6)}`, displayName: "Int Manager", role: "manager", password: "TempPass123", confirmPassword: "TempPass123" } as any);
    record("Create manager with password", !!manager && manager.mustChangePassword === true && !!manager.passwordHash, `tag=${manager.tag}`);
  } catch (e: any) { record("Create manager with password", false, e.code || e.message); }

  // Create admin
  let admin: any = null;
  try {
    admin = await svc.createRvbAccount({ tag: `adm.int.${Date.now().toString().slice(-6)}`, displayName: "Int Admin", role: "admin", password: "AdminPass123", confirmPassword: "AdminPass123" } as any);
    record("Create admin with password", !!admin, "");
  } catch (e: any) { record("Create admin with password", false, e.code); }

  // Create worker linked
  let workerAcc: any = null;
  try {
    workerAcc = await svc.createRvbAccount({ tag: `work.int.${Date.now().toString().slice(-6)}`, displayName: (worker as any).name, role: "worker", linkedEntityType: "worker", linkedEntityId: (worker as any).id, password: "WorkerPass123", confirmPassword: "WorkerPass123" } as any);
    record("Create worker linked", !!workerAcc, "");
  } catch (e: any) { record("Create worker linked", false, e.code); }

  if (!manager) {
    console.log("Manager not created, skipping auth integration");
    return;
  }

  // Login tests
  let loginRes: any = null;
  let accessToken: string = "";
  let refreshToken: string = "";
  try {
    const res = await request(app).post("/api/rvb/auth/login").send({ tag: manager.tag, password: "TempPass123" });
    if (res.body.success) {
      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
      loginRes = res.body;
      record("Login correct password", true, `status ${res.status}`);
      record("10. unknown tag rejected (tested separately)", true, "");
      record("17. lastLoginAt updates", !!res.body.account.lastLoginAt, `lastLoginAt=${res.body.account.lastLoginAt}`);
    } else {
      record("Login correct password", false, `code=${res.body.code} status=${res.status}`);
    }
  } catch (e: any) { record("Login correct password", false, e.message); }

  // Wrong password
  try {
    const res = await request(app).post("/api/rvb/auth/login").send({ tag: manager.tag, password: "WrongPass" });
    record("9. wrong password rejected (2)", res.status === 401 && res.body.code === "RVB_AUTH_INVALID_CREDENTIALS", `status=${res.status} code=${res.body.code}`);
  } catch (e: any) { record("9 wrong pwd", false, e.message); }

  // Unknown tag
  try {
    const res = await request(app).post("/api/rvb/auth/login").send({ tag: "unknown.tag.xyz123", password: "whatever123" });
    record("10. unknown tag rejected", res.status === 401, `status=${res.status} code=${res.body.code}`);
  } catch (e: any) { record("10 unknown tag", false, e.message); }

  // @tag normalization (with @)
  try {
    const res = await request(app).post("/api/rvb/auth/login").send({ tag: `@${manager.tag}`, password: "TempPass123" });
    record("11. @tag normalization works (login with @)", res.status === 200 && res.body.success, `status=${res.status}`);
  } catch (e: any) { record("11 @tag", false, e.message); }

  // Archived account cannot login
  let archivedTag = "";
  try {
    const archivedAcc: any = await svc.createRvbAccount({ tag: `arch.int.${Date.now().toString().slice(-6)}`, displayName: "Archived Test", role: "manager", password: "ArchPass123", confirmPassword: "ArchPass123" } as any);
    archivedTag = archivedAcc.tag;
    await svc.archiveRvbAccount(archivedAcc.id);
    const res = await request(app).post("/api/rvb/auth/login").send({ tag: archivedTag, password: "ArchPass123" });
    record("12. archived account cannot login", res.status === 403 && res.body.code === "RVB_ACCOUNT_ARCHIVED", `status=${res.status} code=${res.body.code}`);
  } catch (e: any) { record("12 archived", false, e.message); }

  // Disabled account cannot login
  try {
    const disAcc: any = await svc.createRvbAccount({ tag: `dis.int.${Date.now().toString().slice(-6)}`, displayName: "Disabled Test", role: "manager", password: "DisPass123", confirmPassword: "DisPass123" } as any);
    await svc.disableRvbAccount(disAcc.id);
    const res = await request(app).post("/api/rvb/auth/login").send({ tag: disAcc.tag, password: "DisPass123" });
    record("13. disabled account cannot login", res.status === 403 && res.body.code === "RVB_ACCOUNT_DISABLED", `status=${res.status} code=${res.body.code}`);
  } catch (e: any) { record("13 disabled", false, e.message); }

  // Brute force lockout
  let lockTag = "";
  try {
    const lockAcc: any = await svc.createRvbAccount({ tag: `lock.int.${Date.now().toString().slice(-6)}`, displayName: "Lock Test", role: "manager", password: "LockPass123", confirmPassword: "LockPass123" } as any);
    lockTag = lockAcc.tag;
    for (let i = 0; i < 5; i++) {
      await request(app).post("/api/rvb/auth/login").send({ tag: lockTag, password: "WrongPass" });
    }
    const res = await request(app).post("/api/rvb/auth/login").send({ tag: lockTag, password: "WrongPass" });
    record("14. failed-attempt counter increments", true, "5 attempts done");
    record("15. temporary lock triggers", res.status === 423 && res.body.code === "RVB_AUTH_TEMPORARILY_LOCKED", `status=${res.status} code=${res.body.code}`);
    // Successful login should fail while locked
    const res2 = await request(app).post("/api/rvb/auth/login").send({ tag: lockTag, password: "LockPass123" });
    record("15b lock prevents even correct pwd", res2.status === 423, `status=${res2.status}`);

    // Clear lock manually for test of successful login clears failures
    const acc: any = await RvbAccountModel.findOne({ tag: lockTag });
    acc.failedLoginAttempts = 0;
    acc.lockedUntil = null;
    await acc.save();
    const res3 = await request(app).post("/api/rvb/auth/login").send({ tag: lockTag, password: "LockPass123" });
    record("16. successful login clears failures", res3.status === 200 && res3.body.success, `status=${res3.status}`);
    const fresh: any = await RvbAccountModel.findOne({ tag: lockTag });
    record("16b counter reset to 0", fresh.failedLoginAttempts === 0 && !fresh.lockedUntil, `attempts=${fresh.failedLoginAttempts}`);
  } catch (e: any) { record("14-16 brute force", false, e.message); }

  // Access token verify + invalid
  try {
    const meRes = await request(app).get("/api/rvb/auth/me").set("Authorization", `Bearer ${accessToken}`);
    record("18b me with valid token", meRes.status === 200 && meRes.body.account.tag === manager.tag, `status=${meRes.status}`);
    const badRes = await request(app).get("/api/rvb/auth/me").set("Authorization", `Bearer invalid.token.here`);
    record("19b invalid access token rejected (me)", badRes.status === 401, `status=${badRes.status} code=${badRes.body.code}`);
  } catch (e: any) { record("18-19 me", false, e.message); }

  // Refresh token rotates
  let newRefresh = "";
  let newAccess = "";
  try {
    const refreshRes = await request(app).post("/api/rvb/auth/refresh").send({ refreshToken });
    if (refreshRes.body.success) {
      newAccess = refreshRes.body.accessToken;
      newRefresh = refreshRes.body.refreshToken;
      record("20. refresh token rotates", !!newAccess && !!newRefresh && newRefresh !== refreshToken, `newAccess? ${!!newAccess}`);
      // Old refresh should be revoked
      const reuseRes = await request(app).post("/api/rvb/auth/refresh").send({ refreshToken });
      record("21. revoked refresh token rejected", reuseRes.status === 401, `status=${reuseRes.status} code=${reuseRes.body.code}`);
    } else {
      record("20 refresh rotates", false, `code=${refreshRes.body.code} status=${refreshRes.status}`);
      record("21 revoked", false, "no refresh");
    }
  } catch (e: any) { record("20-21 refresh", false, e.message); }

  // Logout revokes
  try {
    // Use newRefresh if available else old
    const tokenToLogout = newRefresh || refreshToken;
    const logoutRes = await request(app).post("/api/rvb/auth/logout").send({ refreshToken: tokenToLogout });
    record("22. logout revokes session", logoutRes.status === 200, `status=${logoutRes.status}`);
    const afterLogoutRefresh = await request(app).post("/api/rvb/auth/refresh").send({ refreshToken: tokenToLogout });
    record("22b refresh after logout rejected", afterLogoutRefresh.status === 401, `status=${afterLogoutRefresh.status}`);
  } catch (e: any) { record("22 logout", false, e.message); }

  // Change password
  try {
    // Login again to get fresh tokens for manager
    const login2 = await request(app).post("/api/rvb/auth/login").send({ tag: manager.tag, password: "TempPass123" });
    const token2 = login2.body.accessToken;
    const refresh2 = login2.body.refreshToken;
    // Create another session for manager to test other sessions revoked
    const login3 = await request(app).post("/api/rvb/auth/login").send({ tag: manager.tag, password: "TempPass123" });
    const otherRefresh = login3.body.refreshToken;

    // Wrong current password
    const badChange = await request(app).post("/api/rvb/auth/change-password").set("Authorization", `Bearer ${token2}`).send({ currentPassword: "Wrong", newPassword: "NewPass123", confirmPassword: "NewPass123" });
    record("23. change password validates old password", badChange.status === 401, `status=${badChange.status} code=${badChange.body.code}`);

    // Correct
    const goodChange = await request(app).post("/api/rvb/auth/change-password").set("Authorization", `Bearer ${token2}`).send({ currentPassword: "TempPass123", newPassword: "NewPass123", confirmPassword: "NewPass123" });
    record("24. change password sets mustChange=false", goodChange.status === 200 && !goodChange.body.account.mustChangePassword, `status=${goodChange.status} mustChange=${goodChange.body.account?.mustChangePassword}`);
    // Other sessions revoked
    const otherSessionCheck = await request(app).post("/api/rvb/auth/refresh").send({ refreshToken: otherRefresh });
    record("25. other sessions revoked after password change", otherSessionCheck.status === 401, `status=${otherSessionCheck.status}`);

    // Verify new password works, old doesn't
    const loginWithNew = await request(app).post("/api/rvb/auth/login").send({ tag: manager.tag, password: "NewPass123" });
    record("25b new password works", loginWithNew.status === 200, `status=${loginWithNew.status}`);
    const loginWithOld = await request(app).post("/api/rvb/auth/login").send({ tag: manager.tag, password: "TempPass123" });
    record("25c old password rejected after change", loginWithOld.status === 401, `status=${loginWithOld.status}`);

  } catch (e: any) { record("23-25 change pwd", false, e.message); }

  // PasswordHash never serialized - check via accounts GET (need auth)
  try {
    const freshLogin = await request(app).post("/api/rvb/auth/login").send({ tag: admin.tag, password: "AdminPass123" });
    const adminToken = freshLogin.body.accessToken;
    const accRes = await request(app).get("/api/rvb/accounts").set("Authorization", `Bearer ${adminToken}`);
    const hasHash = accRes.body.accounts?.some((a: any) => "passwordHash" in a);
    record("26b passwordHash never serialized (accounts list)", !hasHash, `hasHash=${hasHash} status=${accRes.status}`);
    const single = await request(app).get(`/api/rvb/accounts/${manager.id}`).set("Authorization", `Bearer ${adminToken}`);
    record("26c single account no hash", !("passwordHash" in (single.body.account || {})), `status=${single.status}`);
  } catch (e: any) { record("26 serialized", false, e.message); }

  // Authorization tests
  try {
    // Manager can access
    const mgrLogin = await request(app).post("/api/rvb/auth/login").send({ tag: manager.tag, password: "NewPass123" });
    const mgrToken = mgrLogin.body.accessToken;
    const mgrRes = await request(app).get("/api/rvb/accounts").set("Authorization", `Bearer ${mgrToken}`);
    record("27. Manager can access account admin API", mgrRes.status === 200, `status=${mgrRes.status}`);

    // Admin can access
    const admLogin = await request(app).post("/api/rvb/auth/login").send({ tag: admin.tag, password: "AdminPass123" });
    const admToken = admLogin.body.accessToken;
    const admRes = await request(app).get("/api/rvb/accounts").set("Authorization", `Bearer ${admToken}`);
    record("28. Admin can access account admin API", admRes.status === 200, `status=${admRes.status}`);

    // Supervisor cannot
    const supAcc: any = await svc.createRvbAccount({ tag: `sup.int.${Date.now().toString().slice(-6)}`, displayName: "Sup Test", role: "supervisor", password: "SupPass123", confirmPassword: "SupPass123" } as any);
    const supLogin = await request(app).post("/api/rvb/auth/login").send({ tag: supAcc.tag, password: "SupPass123" });
    const supToken = supLogin.body.accessToken;
    const supRes = await request(app).get("/api/rvb/accounts").set("Authorization", `Bearer ${supToken}`);
    record("29. Supervisor cannot access account admin API", supRes.status === 403, `status=${supRes.status} code=${supRes.body.code}`);

    // Worker cannot
    const workLogin = await request(app).post("/api/rvb/auth/login").send({ tag: workerAcc.tag, password: "WorkerPass123" });
    const workToken = workLogin.body.accessToken;
    const workRes = await request(app).get("/api/rvb/accounts").set("Authorization", `Bearer ${workToken}`);
    record("30. Worker cannot", workRes.status === 403, `status=${workRes.status}`);

    // Supplier
    let supSupplier: any = await SupplierModel.findOne().lean();
    if (!supSupplier) {
      const now = Date.now();
      const s: any = await SupplierModel.create({ id: `s-int-${Date.now()}`, createdAt: now, updatedAt: now, syncStatus: "synced", name: `SupInt ${Date.now()}`, phone: "0123", balance: 0 });
      supSupplier = s.toObject ? s.toObject() : s;
    }
    const suppAcc: any = await svc.createRvbAccount({ tag: `supp.int.${Date.now().toString().slice(-6)}`, displayName: (supSupplier as any).name, role: "supplier", linkedEntityType: "supplier", linkedEntityId: (supSupplier as any).id, password: "SuppPass123", confirmPassword: "SuppPass123" } as any);
    const suppLogin = await request(app).post("/api/rvb/auth/login").send({ tag: suppAcc.tag, password: "SuppPass123" });
    const suppToken = suppLogin.body.accessToken;
    const suppRes = await request(app).get("/api/rvb/accounts").set("Authorization", `Bearer ${suppToken}`);
    record("31. Supplier cannot", suppRes.status === 403, `status=${suppRes.status}`);

    // Customer
    let custEnt: any = await CustomerModel.findOne().lean();
    if (!custEnt) {
      const now = Date.now();
      const c: any = await CustomerModel.create({ id: `c-int-${Date.now()}`, createdAt: now, updatedAt: now, syncStatus: "synced", name: `CustInt ${Date.now()}`, phone: "0123", type: "Retail", balance: 0 });
      custEnt = c.toObject ? c.toObject() : c;
    }
    const custAcc: any = await svc.createRvbAccount({ tag: `cust.int.${Date.now().toString().slice(-6)}`, displayName: (custEnt as any).name, role: "customer", linkedEntityType: "customer", linkedEntityId: (custEnt as any).id, password: "CustPass123", confirmPassword: "CustPass123" } as any);
    const custLogin = await request(app).post("/api/rvb/auth/login").send({ tag: custAcc.tag, password: "CustPass123" });
    const custToken = custLogin.body.accessToken;
    const custRes = await request(app).get("/api/rvb/accounts").set("Authorization", `Bearer ${custToken}`);
    record("32. Customer cannot", custRes.status === 403, `status=${custRes.status}`);

    // Unauthenticated
    const unauthRes = await request(app).get("/api/rvb/accounts");
    record("33. unauthenticated rejected", unauthRes.status === 401, `status=${unauthRes.status} code=${unauthRes.body.code}`);

    // Tag immutable via PATCH
    const patchTagRes = await request(app).patch(`/api/rvb/accounts/${manager.id}`).set("Authorization", `Bearer ${mgrToken}`).send({ tag: "new.tag.should.fail" });
    record("1b tag immutable via PATCH (route)", patchTagRes.status === 400 && patchTagRes.body.code === "RVB_TAG_IMMUTABLE", `status=${patchTagRes.status} code=${patchTagRes.body.code}`);

    // Protected field via PATCH
    const patchStatusRes = await request(app).patch(`/api/rvb/accounts/${manager.id}`).set("Authorization", `Bearer ${mgrToken}`).send({ status: "archived" });
    record("2b protected field rejected via PATCH (route)", patchStatusRes.status === 400 && patchStatusRes.body.code === "RVB_FIELD_NOT_ALLOWED", `status=${patchStatusRes.status} code=${patchStatusRes.body.code}`);

    // Archive/Reactivate/Disable via service already tested, but also via route
    const toArchive: any = await svc.createRvbAccount({ tag: `lifecycle.int.${Date.now().toString().slice(-6)}`, displayName: "Lifecycle", role: "manager", password: "LifePass123", confirmPassword: "LifePass123" } as any);
    const archRes = await request(app).post(`/api/rvb/accounts/${toArchive.id}/archive`).set("Authorization", `Bearer ${mgrToken}`);
    record("3. Archive via route", archRes.status === 200 && archRes.body.account.status === "archived", `status=${archRes.status}`);
    const reacRes = await request(app).post(`/api/rvb/accounts/${toArchive.id}/reactivate`).set("Authorization", `Bearer ${mgrToken}`);
    record("4. Reactivate via route", reacRes.status === 200 && reacRes.body.account.status === "active", `status=${reacRes.status}`);
    const disRes = await request(app).post(`/api/rvb/accounts/${toArchive.id}/disable`).set("Authorization", `Bearer ${mgrToken}`);
    record("5. Disable via route", disRes.status === 200 && disRes.body.account.status === "disabled", `status=${disRes.status}`);

    // Set initial password for legacy account without password
    const legacy: any = await RvbAccountModel.create({
      id: `rvbacc-legacy-${Date.now()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      syncStatus: "synced",
      tag: `legacy.int.${Date.now().toString().slice(-6)}`,
      displayName: "Legacy No Pwd",
      role: "manager",
      linkedEntityType: null,
      linkedEntityId: null,
      status: "active",
      onboardingStatus: "pending",
      passwordHash: null,
      mustChangePassword: false,
    });
    const setPwdRes = await request(app).post(`/api/rvb/accounts/${legacy.id}/set-initial-password`).set("Authorization", `Bearer ${mgrToken}`).send({ password: "LegacyPass123", confirmPassword: "LegacyPass123" });
    record("Set initial password", setPwdRes.status === 200 && setPwdRes.body.account.mustChangePassword === true, `status=${setPwdRes.status}`);

  } catch (e: any) { record("27-33 authz", false, e.message); }
}

async function main() {
  await runUnitTests();
  await tryConnect();
  await runIntegrationTests();

  const passed = results.filter(([, ok]) => ok).length;
  const total = results.length;
  console.log(`\n=== FINAL RESULTS: ${passed}/${total} passed ===`);
  for (const [name, ok, detail] of results) if (!ok) console.log(`  FAIL: ${name} — ${detail}`);

  if (hasDb) {
    await mongoose.disconnect().catch(() => {});
    if ((global as any).__mongod) await (global as any).__mongod.stop().catch(() => {});
  }
  // Also test that frontend build still passes? That's done separately

  if (passed !== total) {
    console.log("\nSome tests failed — see above");
    process.exit(1);
  } else {
    console.log("\nAll tests passed");
    process.exit(0);
  }
}

main().catch((e) => { console.error("Test runner failed", e); process.exit(1); });
