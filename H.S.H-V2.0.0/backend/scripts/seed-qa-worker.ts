import dotenv from "dotenv";
import path from "path";
import dns from "dns";
import { v4 as uuidv4 } from "uuid";
dns.setServers(["8.8.8.8", "1.1.1.1"]);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
import { MongoClient } from "mongodb";

const WORKER_ID = "worker-r484-xrac";
const TARGET_BALANCE = 50000;
const MONTHLY_SALARY = 40000;
const STARTING_SALARY = 35000;

async function main() {
  const uri = process.env.MONGODB_URI!;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const db = client.db();
  const workers = db.collection("workers");
  const events = db.collection("worker_financial_events");
  const activities = db.collection("worker_activities");
  const requests = db.collection("worker_requests");

  const w = await workers.findOne({ id: WORKER_ID });
  if (!w) {
    console.error("Worker not found", WORKER_ID);
    process.exit(1);
  }
  console.log("Before worker", JSON.stringify({ balance: w.balance, monthlySalary: w.monthlySalary, startingSalary: w.startingSalary }, null, 2));

  // Ensure worker has controlled values
  await workers.updateOne({ id: WORKER_ID }, { $set: {
    balance: TARGET_BALANCE,
    monthlySalary: MONTHLY_SALARY,
    startingSalary: STARTING_SALARY,
    status: "active",
    updatedAt: Date.now(),
  }});
  console.log(`Set worker ${WORKER_ID} balance=${TARGET_BALANCE} monthly=${MONTHLY_SALARY} starting=${STARTING_SALARY}`);

  // Clean existing financial events for this worker to have deterministic seed? Keep but ensure at least 2 bonuses and 2 absences
  const existing = await events.find({ workerId: WORKER_ID }).toArray();
  console.log(`Existing events: ${existing.length}`);
  // If less than 2 bonuses or 2 absences, create
  const bonuses = existing.filter(e => e.type === "bonus");
  const absences = existing.filter(e => e.type === "absence");
  const now = Date.now();
  const toInsert:any[] = [];
  if (bonuses.length < 2) {
    for (let i = bonuses.length; i < 2; i++) {
      const before = TARGET_BALANCE;
      const after = TARGET_BALANCE;
      toInsert.push({
        id: `wkfe-${uuidv4()}`,
        createdAt: now - (i+1)*86400000,
        updatedAt: now - (i+1)*86400000,
        workerId: WORKER_ID,
        type: "bonus",
        amount: 5000 + i*1000,
        balanceBefore: before,
        balanceAfter: after,
        note: `QA Bonus ${i+1}`,
        actorId: null,
        actorTag: null,
        referenceId: null,
      });
    }
  }
  if (absences.length < 2) {
    for (let i = absences.length; i < 2; i++) {
      toInsert.push({
        id: `wkfe-${uuidv4()}`,
        createdAt: now - (i+3)*86400000,
        updatedAt: now - (i+3)*86400000,
        workerId: WORKER_ID,
        type: "absence",
        amount: 0,
        balanceBefore: TARGET_BALANCE,
        balanceAfter: TARGET_BALANCE,
        note: `QA Absence ${i+1}`,
        actorId: null,
        actorTag: null,
        referenceId: null,
      });
    }
  }
  if (toInsert.length) {
    await events.insertMany(toInsert as any);
    console.log(`Inserted ${toInsert.length} events`);
  }

  // Clean worker_requests for this worker to have fresh state for tests (optional: remove old under_review to avoid pollution)
  // Keep but ensure no pending under_review that would interfere? For live tests we want clean, so delete under_review for this worker
  const del = await requests.deleteMany({ workerId: WORKER_ID, status: "under_review" });
  console.log(`Deleted ${del.deletedCount} pending under_review requests for clean test`);

  // Ensure activities exist at least a few
  const acts = await activities.find({ workerId: WORKER_ID }).toArray();
  console.log(`Activities: ${acts.length}`);

  const wAfter = await workers.findOne({ id: WORKER_ID });
  console.log("After worker", JSON.stringify({ balance: wAfter?.balance }, null, 2));
  const evAfter = await events.find({ workerId: WORKER_ID }).sort({ createdAt: -1 }).limit(5).toArray();
  console.log("Recent events", JSON.stringify(evAfter.map(e=>({type:e.type, amount:e.amount, note:e.note})), null, 2));

  await client.close();
  console.log("Seed done");
}
main().catch(e=>{console.error(e); process.exit(1);});
