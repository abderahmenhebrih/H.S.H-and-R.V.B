import dotenv from "dotenv";
import path from "path";
import dns from "dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
import { MongoClient } from "mongodb";
import { assertLiveQaTarget } from "../src/lib/test-db-guard";
async function main() {
  const uri = process.env.MONGODB_URI!;
  // Intentional live-QA writer (exact qa.* tags only): requires explicit opt-in.
  assertLiveQaTarget(uri, { liveQa: true });
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db();
  const col = db.collection("rvb_accounts");
  await col.updateOne({ tag: "qa.onboard.mobile" }, { $set: { onboardingStatus: "pending", profilePicture: null, updatedAt: Date.now() } });
  console.log("reset onboard to pending");
  await col.updateOne({ tag: "qa.pwd.mobile" }, { $set: { mustChangePassword: true, updatedAt: Date.now() } });
  console.log("reset pwd mustChangePassword true");
  await client.close();
}
main().catch(e=>{console.error(e); process.exit(1);});
