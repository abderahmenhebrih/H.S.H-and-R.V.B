import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import path from "path";
import dns from "dns";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dns.setServers(["8.8.8.8", "1.1.1.1"]);
async function main() {
  const uri = process.env.MONGODB_URI!;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db();
  const workers = await db.collection("workers").find({}, { projection: { id: 1, name: 1 } }).limit(10).toArray();
  console.log(JSON.stringify(workers, null, 2));
  const suppliers = await db.collection("suppliers").find({}, { projection: { id: 1, name: 1 } }).limit(5).toArray();
  console.log("suppliers", JSON.stringify(suppliers, null, 2));
  const customers = await db.collection("customers").find({}, { projection: { id: 1, name: 1 } }).limit(5).toArray();
  console.log("customers", JSON.stringify(customers, null, 2));
  await client.close();
}
main().catch(e => { console.error(e); process.exit(1); });
