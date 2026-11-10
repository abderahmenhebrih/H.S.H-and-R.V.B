import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import express from "express";
import request from "supertest";

let passed = 0;
let failed = 0;
const ok = (n: string, extra = "") => { passed++; console.log(`PASS ${n}${extra ? " " + extra : ""}`); };
const fail = (n: string, e: any) => { failed++; console.log(`FAIL ${n}: ${e?.message || e}`); };
const expect = (n: string, actual: number, want: number | number[]) => {
  const wants = Array.isArray(want) ? want : [want];
  if (wants.includes(actual)) ok(n, `got=${actual}`);
  else fail(n, `got=${actual} want=${wants}`);
};

async function main() {
  process.env.RVB_TEST_MODE = "true";
  const mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongod.getUri());
  const { RvbAccountModel } = await import("./src/models/rvb-account.model");
  const { RvbSessionModel } = await import("./src/models/rvb-session.model");
  const { WorkerModel } = await import("./src/models/worker.model");
  const { SupplierModel } = await import("./src/models/supplier.model");
  const { CustomerModel } = await import("./src/models/customer.model");
  const { signAccessToken } = await import("./src/lib/rvb-auth");
  const { hashPassword } = await import("./src/lib/password");

  const now = Date.now();
  const pw = await hashPassword("Secret123!");
  const mkAcc = async (id: string, role: string, let_: string | null, leid: string | null, status = "active") =>
    RvbAccountModel.create({ id, createdAt: now, updatedAt: now, tag: `mx-${id}`, displayName: id, role, linkedEntityType: let_, linkedEntityId: leid, status, onboardingStatus: "complete", passwordHash: pw } as any);
  const mgr = await mkAcc(`mx-mgr-${now}`, "manager", null, null);
  const sup = await mkAcc(`mx-sup-${now}`, "supervisor", "worker", `mx-wsup-${now}`);
  const w1 = await WorkerModel.create({ id: `mx-w1-${now}`, createdAt: now, updatedAt: now, syncStatus: "synced", name: "W1", phone: "1", employmentDate: now, position: "B", startingSalary: 1, monthlySalary: 1, status: "active", balance: 0 } as any);
  const w2 = await WorkerModel.create({ id: `mx-w2-${now}`, createdAt: now, updatedAt: now, syncStatus: "synced", name: "W2", phone: "2", employmentDate: now, position: "B", startingSalary: 1, monthlySalary: 1, status: "active", balance: 0 } as any);
  const wAcc1 = await mkAcc(`mx-wa1-${now}`, "worker", "worker", w1.id);
  const s1 = await SupplierModel.create({ id: `mx-s1-${now}`, createdAt: now, updatedAt: now, syncStatus: "synced", name: "S1", phone: "3", balance: 0 } as any);
  const sAcc1 = await mkAcc(`mx-sa1-${now}`, "supplier", "supplier", s1.id);
  const c1 = await CustomerModel.create({ id: `mx-c1-${now}`, createdAt: now, updatedAt: now, syncStatus: "synced", name: "C1", phone: "4", type: "regular", balance: 0 } as any);
  const cAcc1 = await mkAcc(`mx-ca1-${now}`, "customer", "customer", c1.id);
  const dead = await mkAcc(`mx-dead-${now}`, "worker", "worker", w1.id, "disabled");

  const tok = async (acc: any, expIn = 3600000) => {
    const sid = `mx-sess-${acc.id}`;
    await RvbSessionModel.create({ id: sid, accountId: acc.id, refreshTokenHash: `h-${sid}`, createdAt: now, expiresAt: now + expIn, revokedAt: null } as any);
    return signAccessToken({ accountId: acc.id, tag: acc.tag, role: acc.role, status: acc.status, sessionId: sid } as any);
  };
  const T = { mgr: await tok(mgr), sup: await tok(sup), w1: await tok(wAcc1), s1: await tok(sAcc1), c1: await tok(cAcc1), dead: await tok(dead) };

  const app: any = express();
  app.use(express.json());
  app.use("/api/rvb/accounts", (await import("./src/routes/rvb-accounts")).default);
  app.use("/api/rvb/customers", (await import("./src/routes/rvb-customers")).default);
  app.use("/api/rvb/portal", (await import("./src/routes/rvb-portal")).default);
  app.use("/api/rvb/worker-financial-events", (await import("./src/routes/worker-financial-events")).default);
  const get = (u: string, t?: string) => {
    const r = request(app).get(u);
    return (t ? r.set("Authorization", `Bearer ${t}`) : r);
  };

  // Anonymous
  expect("anon accounts 401", (await get("/api/rvb/accounts")).status, 401);
  // Role gates
  expect("worker on accounts 403", (await get("/api/rvb/accounts", T.w1)).status, 403);
  expect("supervisor on accounts 403", (await get("/api/rvb/accounts", T.sup)).status, 403);
  expect("manager on accounts 200", (await get("/api/rvb/accounts", T.mgr)).status, 200);
  expect("supervisor on customers 200", (await get("/api/rvb/customers", T.sup)).status, 200);
  expect("worker on customers 403", (await get("/api/rvb/customers", T.w1)).status, 403);
  // Portal scoping
  expect("supplier on worker portal 403", (await get("/api/rvb/portal/worker", T.s1)).status, 403);
  expect("customer on supplier portal 403", (await get("/api/rvb/portal/supplier", T.c1)).status, 403);
  expect("worker on customer portal 403", (await get("/api/rvb/portal/customer", T.w1)).status, 403);
  expect("worker own portal 200", (await get("/api/rvb/portal/worker", T.w1)).status, 200);
  expect("supplier own portal 200", (await get("/api/rvb/portal/supplier", T.s1)).status, 200);
  expect("customer own portal 200", (await get("/api/rvb/portal/customer", T.c1)).status, 200);
  // Inactive + expired
  expect("inactive denied", (await get("/api/rvb/accounts", T.dead)).status, [401, 403]);
  // Cross-user IDOR: worker1 financial events for worker2 entity via query override
  const idor = await get(`/api/rvb/worker-financial-events?workerId=${w2.id}`, T.w1);
  expect("cross-worker events 403-or-scoped", idor.status, [403, 200]);
  if (idor.status === 200) {
    const body: any = idor.body;
    const evts = body.events || body.items || [];
    const leaked = Array.isArray(evts) && evts.some((e: any) => e.workerId === w2.id);
    if (leaked) fail("cross-worker events no-leak", "w2 data visible to w1");
    else ok("cross-worker events no-leak");
  }

  console.log(`\nAUTHZ-MATRIX: ${passed} passed, ${failed} failed`);
  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("HARNESS FATAL", e); process.exit(1); });
