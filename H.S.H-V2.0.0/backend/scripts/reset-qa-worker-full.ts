import dotenv from "dotenv";
import path from "path";
import dns from "dns";
import { v4 as uuidv4 } from "uuid";
dns.setServers(["8.8.8.8", "1.1.1.1"]);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
import { MongoClient } from "mongodb";
import { assertLiveQaTarget } from "../src/lib/test-db-guard";

const WORKER_ID = "worker-r484-xrac";

async function main(){
  const uri = process.env.MONGODB_URI!;
  // Intentional live-QA writer (fixed QA worker id only): requires explicit opt-in.
  assertLiveQaTarget(uri, { liveQa: true });
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const db = client.db();
  const workers = db.collection("workers");
  const reqs = db.collection("worker_requests");
  const events = db.collection("worker_financial_events");
  const acts = db.collection("worker_activities");

  // Reset worker balance
  await workers.updateOne({id: WORKER_ID}, {$set:{balance:50000, monthlySalary:40000, startingSalary:35000, updatedAt:Date.now()}});
  console.log("Reset balance 50000");

  // Delete all requests for this worker
  const delReq = await reqs.deleteMany({workerId: WORKER_ID});
  console.log(`Deleted ${delReq.deletedCount} worker_requests for ${WORKER_ID}`);

  // Delete financial events of type payment/loan/adjustment/salary (keep bonus/absence)
  const delEv = await events.deleteMany({workerId: WORKER_ID, type: {$in:["payment","loan","salary","adjustment"]}});
  console.log(`Deleted ${delEv.deletedCount} payment/loan events`);

  // Optionally keep activities? For fresh we could clear but keep a few
  // Delete all activities for fresh
  const delAct = await acts.deleteMany({workerId: WORKER_ID});
  console.log(`Deleted ${delAct.deletedCount} activities`);

  // Ensure bonuses/absences exist (re-seed if needed)
  const bonuses = await events.countDocuments({workerId: WORKER_ID, type:"bonus"});
  const abs = await events.countDocuments({workerId: WORKER_ID, type:"absence"});
  console.log(`Before ensure bonuses ${bonuses} absences ${abs}`);
  const now=Date.now();
  const toInsert:any[]=[];
  if(bonuses<2){
    for(let i=bonuses;i<2;i++){
      toInsert.push({id:`wkfe-${uuidv4()}`,createdAt:now-(i+1)*86400000,updatedAt:now-(i+1)*86400000,workerId:WORKER_ID,type:"bonus",amount:5000+i*1000,balanceBefore:50000,balanceAfter:50000,note:`QA Bonus ${i+1}`,actorId:null,actorTag:null,referenceId:null});
    }
  }
  if(abs<2){
    for(let i=abs;i<2;i++){
      toInsert.push({id:`wkfe-${uuidv4()}`,createdAt:now-(i+3)*86400000,updatedAt:now-(i+3)*86400000,workerId:WORKER_ID,type:"absence",amount:0,balanceBefore:50000,balanceAfter:50000,note:`QA Absence ${i+1}`,actorId:null,actorTag:null,referenceId:null});
    }
  }
  if(toInsert.length){
    await events.insertMany(toInsert as any);
    console.log(`Inserted ${toInsert.length} bonus/absence`);
  }

  await client.close();
  console.log("Full reset done");
}
main().catch(e=>{console.error(e);process.exit(1);});
