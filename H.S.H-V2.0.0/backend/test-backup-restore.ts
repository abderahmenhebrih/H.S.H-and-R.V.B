import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import fs from "fs";
import path from "path";
import os from "os";

let passed = 0;
let failed = 0;
const ok = (n: string, extra = "") => { passed++; console.log(`PASS ${n}${extra ? " " + extra : ""}`); };
const fail = (n: string, e: any) => { failed++; console.log(`FAIL ${n}: ${e?.message || e}`); };

// Validates the documented backup/restore procedure mechanics in isolation:
// export collections to JSON snapshot files, drop the database, re-import,
// verify counts + spot-check payloads. Mirrors HSH_PRODUCTION_DEPLOYMENT_GUIDE
// "Backup and restore" (which uses mongodump/mongorestore against real Mongo).
async function main() {
  const mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongod.getUri());
  const { SaleModel } = await import("./src/models/sale.model");
  const { CustomerModel } = await import("./src/models/customer.model");
  const now = Date.now();
  const sales: any[] = [];
  for (let i = 0; i < 200; i++) sales.push({ id: `bk-s-${i}`, customerId: "bk-c", date: now - i, createdAt: now - i, updatedAt: now, syncStatus: "synced", total: i } as any);
  await SaleModel.insertMany(sales, { ordered: false });
  await CustomerModel.create({ id: "bk-c", createdAt: now, updatedAt: now, syncStatus: "synced", name: "BK", phone: "1", type: "regular", balance: 42 } as any);

  // BACKUP: export
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hsh-backup-"));
  const dump = async (model: any, name: string) => {
    const docs = await model.find().lean();
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(docs));
    return docs.length;
  };
  const nSales = await dump(SaleModel, "sales");
  const nCust = await dump(CustomerModel, "customers");

  // DISASTER: drop everything
  await mongoose.connection.db!.dropDatabase();
  const afterDrop = await SaleModel.countDocuments({}).catch(() => -1);

  // RESTORE: re-import (strip _id so Mongo regenerates; keep business `id`)
  const restore = async (model: any, name: string) => {
    const docs = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8"));
    const clean = docs.map((d: any) => { const { _id, __v, ...rest } = d; return rest; });
    if (clean.length) await model.insertMany(clean, { ordered: false });
    return clean.length;
  };
  const rSales = await restore(SaleModel, "sales");
  const rCust = await restore(CustomerModel, "customers");

  // VERIFY
  if (nSales === 200 && afterDrop === 0 && rSales === 200) ok("backup-roundtrip-sales", `200→0→200`);
  else fail("backup-roundtrip-sales", `dump=${nSales} afterDrop=${afterDrop} restored=${rSales}`);
  const spot: any = await SaleModel.findOne({ id: "bk-s-7" }).lean();
  const cust: any = await CustomerModel.findOne({ id: "bk-c" }).lean();
  if (spot?.total === 7 && cust?.balance === 42 && rCust === 1) ok("backup-spot-check");
  else fail("backup-spot-check", `sale=${spot?.total} cust=${cust?.balance}`);
  fs.rmSync(dir, { recursive: true, force: true });

  console.log(`\nBACKUP-RESTORE: ${passed} passed, ${failed} failed`);
  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("HARNESS FATAL", e); process.exit(1); });
