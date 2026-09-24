import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import path from "path";
import dns from "dns";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
// override dns to google for reliability
dns.setServers(["8.8.8.8", "1.1.1.1"]);
async function main() {
  const uri = process.env.MONGODB_URI!;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db();
  const accounts = await db.collection("rvb_accounts").find({}, { projection: { tag: 1, role: 1, status: 1, onboardingStatus: 1, mustChangePassword: 1 } }).toArray();
  console.log(JSON.stringify(accounts, null, 2));
  await client.close();
}
main().catch(e => { console.error(e); process.exit(1); });
