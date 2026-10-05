import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { CustomerModel } from "./models/customer.model";
import { RvbAccountModel } from "./models/rvb-account.model";
import { SettingsModel } from "./models/settings.model";
import { SupplierModel } from "./models/supplier.model";
import { WorkerModel } from "./models/worker.model";
import { hashPassword } from "./lib/password";

const QA_PASSWORD = process.env.RVB_QA_P1_PASSWORD || "Rvb-QA-P1!Base";
const QA_PFP = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmfkAAAAASUVORK5CYII=";

async function seedRvbPhase1Fixtures() {
  await Promise.all([
    RvbAccountModel.init(),
    WorkerModel.init(),
    SupplierModel.init(),
    CustomerModel.init(),
    SettingsModel.init(),
  ]);

  const now = Date.now();
  const roleWorkerId = "qa-rvb-p1-worker-linked";
  const supervisorWorkerId = "qa-rvb-p1-worker-supervisor";
  const unlinkedWorkerId = "qa-rvb-p1-worker-unlinked";
  const supplierId = "qa-rvb-p1-supplier-linked";
  const customerId = "qa-rvb-p1-customer-linked";

  await WorkerModel.create([
    {
      id: roleWorkerId,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced",
      name: "QA RVB Phase1 Role Worker",
      phone: "5550101001",
      employmentDate: now,
      position: "QA Butcher",
      startingSalary: 0,
      monthlySalary: 0,
      status: "active",
      balance: 0,
    },
    {
      id: supervisorWorkerId,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced",
      name: "QA RVB Phase1 Supervisor Worker",
      phone: "5550101002",
      employmentDate: now,
      position: "QA Butcher",
      startingSalary: 0,
      monthlySalary: 0,
      status: "active",
      balance: 0,
    },
    {
      id: unlinkedWorkerId,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced",
      name: "QA RVB Phase1 Unlinked Worker",
      phone: "5550101003",
      employmentDate: now,
      position: "QA Butcher",
      startingSalary: 0,
      monthlySalary: 0,
      status: "active",
      balance: 0,
    },
  ] as any);

  await SupplierModel.create({
    id: supplierId,
    createdAt: now,
    updatedAt: now,
    syncStatus: "synced",
    name: "QA RVB Phase1 Role Supplier",
    phone: "5550102001",
    balance: 0,
  } as any);
  await CustomerModel.create({
    id: customerId,
    createdAt: now,
    updatedAt: now,
    syncStatus: "synced",
    name: "QA RVB Phase1 Role Customer",
    phone: "5550103001",
    type: "consumer",
    balance: 0,
  } as any);

  await SettingsModel.create({
    id: "settings",
    language: "en",
    currency: "DA",
    customerTypes: ["consumer", "business"],
    workerPositions: ["QA Butcher"],
    vehicleTypes: [],
    syncStatus: "synced",
    lastSyncedAt: now,
  } as any);

  const passwordHash = await hashPassword(QA_PASSWORD);
  const accounts = [
    { role: "manager", tag: "qa.rvb.p1.manager", displayName: "QA RVB Phase1 Manager", linkedEntityType: null, linkedEntityId: null },
    { role: "supervisor", tag: "qa.rvb.p1.supervisor", displayName: "QA RVB Phase1 Supervisor", linkedEntityType: "worker", linkedEntityId: supervisorWorkerId },
    { role: "worker", tag: "qa.rvb.p1.worker", displayName: "QA RVB Phase1 Worker", linkedEntityType: "worker", linkedEntityId: roleWorkerId },
    { role: "supplier", tag: "qa.rvb.p1.supplier", displayName: "QA RVB Phase1 Supplier", linkedEntityType: "supplier", linkedEntityId: supplierId },
    { role: "customer", tag: "qa.rvb.p1.customer", displayName: "QA RVB Phase1 Customer", linkedEntityType: "customer", linkedEntityId: customerId },
  ];

  await RvbAccountModel.create(accounts.map((account) => ({
    id: `qa-rvb-p1-${account.role}`,
    createdAt: now,
    updatedAt: now,
    syncStatus: "synced",
    tag: account.tag,
    displayName: account.displayName,
    role: account.role,
    linkedEntityType: account.linkedEntityType,
    linkedEntityId: account.linkedEntityId,
    status: "active",
    onboardingStatus: "complete",
    profilePicture: QA_PFP,
    preferences: { ui: { language: "en", theme: "light" } },
    archivedAt: null,
    lastLoginAt: null,
    passwordHash,
    mustChangePassword: false,
    passwordChangedAt: now,
    failedLoginAttempts: 0,
    lockedUntil: null,
  })) as any);

  console.log("[RVB QA] Seeded isolated Phase 1 role accounts and linked entities.");
}

async function startRvbQaServer() {
  const mongod = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: "wiredTiger",
      // This disposable single-node test database only builds tiny QA indexes.
      // The runner's volume is below MongoDB's default 500 MB preflight threshold.
      args: ["--setParameter", "indexBuildMinAvailableDiskSpaceMB=0"],
    },
  });
  const uri = mongod.getUri();
  if (!uri.startsWith("mongodb://127.0.0.1:")) {
    throw new Error("RVB Phase 1 QA server requires an in-memory MongoDB URI.");
  }

  process.env.MONGODB_URI = uri;
  process.env.QA_ISOLATED = "true";
  process.env.SERVER_MODE = "full";
  process.env.PORT = process.env.PORT || "5001";
  process.env.RVB_JWT_ACCESS_SECRET ||= "rvb-phase1-qa-access-secret-only";
  process.env.RVB_JWT_REFRESH_SECRET ||= "rvb-phase1-qa-refresh-secret-only";

  await mongoose.connect(uri);
  await seedRvbPhase1Fixtures();
  await import("./server.js");
  console.log(`[RVB QA] Isolated backend listening on port ${process.env.PORT}.`);

  const cleanup = async () => {
    try { await mongoose.disconnect(); } catch {}
    try { await mongod.stop(); } catch {}
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

startRvbQaServer().catch(async (error) => {
  console.error("[RVB QA] Failed to start isolated Phase 1 backend", error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
