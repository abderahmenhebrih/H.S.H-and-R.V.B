import dotenv from "dotenv";
import path from "path";
import dns from "dns";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
dns.setServers(["8.8.8.8", "1.1.1.1"]);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
import { MongoClient } from "mongodb";

const QA_ACCOUNTS = [
  { tag: "qa.worker.mobile", displayName: "QA Worker Mobile", role: "worker", linkedEntityType: "worker", linkedEntityId: "worker-r484-xrac" },
  { tag: "qa.supplier.mobile", displayName: "QA Supplier Mobile", role: "supplier", linkedEntityType: "supplier", linkedEntityId: "sup-r484-b8c3" },
  { tag: "qa.customer.mobile", displayName: "QA Customer Mobile", role: "customer", linkedEntityType: "customer", linkedEntityId: "cust-r484-2mfc" },
  { tag: "qa.supervisor.mobile", displayName: "QA Supervisor Mobile", role: "supervisor", linkedEntityType: "worker", linkedEntityId: "worker-rcfk-52h5" },
  { tag: "qa.admin.mobile", displayName: "QA Admin Mobile", role: "admin", linkedEntityType: null, linkedEntityId: null },
  { tag: "qa.manager.mobile", displayName: "QA Manager Mobile", role: "manager", linkedEntityType: null, linkedEntityId: null },
  { tag: "qa.onboard.mobile", displayName: "QA Onboard Mobile", role: "worker", linkedEntityType: "worker", linkedEntityId: "w-int-1790074516163", onboardingStatus: "pending" },
  { tag: "qa.pwd.mobile", displayName: "QA Pwd Mobile", role: "worker", linkedEntityType: "worker", linkedEntityId: "274f1cce-8c2b-4f22-b712-75c3f84569fe", mustChangePassword: true },
];

async function main() {
  const uri = process.env.MONGODB_URI!;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const db = client.db();
  const col = db.collection("rvb_accounts");
  const password = "Mobile123!";
  const hash = await bcrypt.hash(password, 10);
  for (const qa of QA_ACCOUNTS) {
    const existing = await col.findOne({ tag: qa.tag });
    if (existing) {
      console.log(`Exists ${qa.tag} -> updating password/hash`);
      await col.updateOne({ tag: qa.tag }, { $set: {
        passwordHash: hash,
        mustChangePassword: (qa as any).mustChangePassword ?? false,
        onboardingStatus: (qa as any).onboardingStatus ?? "complete",
        status: "active",
        updatedAt: Date.now(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      }});
      console.log(`Updated ${qa.tag}`);
      continue;
    }
    // check linked entity already linked? if so, try alternative
    if (qa.linkedEntityId) {
      const linked = await col.findOne({ linkedEntityId: qa.linkedEntityId });
      if (linked) {
        console.log(`WARN ${qa.tag} linkedEntity ${qa.linkedEntityId} already linked to ${linked.tag}, skipping or trying alternative`);
        // try to find unlinked alternative for same type
        continue;
      }
    }
    const now = Date.now();
    const doc = {
      id: `rvbacc-${uuidv4()}`,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced",
      tag: qa.tag,
      displayName: qa.displayName,
      role: qa.role,
      linkedEntityType: qa.linkedEntityType,
      linkedEntityId: qa.linkedEntityId,
      status: "active",
      onboardingStatus: (qa as any).onboardingStatus || "complete",
      profilePicture: null,
      preferences: null,
      archivedAt: null,
      lastLoginAt: null,
      passwordHash: hash,
      mustChangePassword: (qa as any).mustChangePassword || false,
      passwordChangedAt: now,
      failedLoginAttempts: 0,
      lockedUntil: null,
    };
    await col.insertOne(doc as any);
    console.log(`Created ${qa.tag} ${qa.role} -> ${doc.id}`);
  }
  await client.close();
  console.log("Done. Password for all QA is Mobile123!");
}
main().catch(e => { console.error(e); process.exit(1); });
