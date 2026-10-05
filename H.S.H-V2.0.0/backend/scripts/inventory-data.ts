import dotenv from "dotenv";
import mongoose from "mongoose";
import { configureDatabaseDns } from "../src/config/dns";

dotenv.config();
configureDatabaseDns();

function sanitizedHost(uri: string): string {
  try {
    const u = new URL(uri);
    return u.hostname;
  } catch {
    return "(unparseable)";
  }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI missing");
    process.exit(2);
  }
  console.log("TARGET DATABASE: (see below after connect)");
  console.log("TARGET MONGODB HOST:", sanitizedHost(uri));
  console.log("NODE_ENV:", process.env.NODE_ENV || "(unset)");
  await mongoose.connect(uri);
  const db = mongoose.connection.db as any;
  console.log("TARGET DATABASE:", db.databaseName);

  const cols: any[] = await db.listCollections().toArray();
  console.log(`\nCollections discovered: ${cols.length}`);
  const rows: Array<{ name: string; count: number }> = [];
  for (const c of cols.sort((a: any, b: any) => a.name.localeCompare(b.name))) {
    let count = -1;
    try {
      count = await db.collection(c.name).estimatedDocumentCount();
    } catch {}
    rows.push({ name: c.name, count });
    console.log(`  ${c.name}: ${count}`);
  }

  const get = (n: string) => rows.find((r) => r.name === n)?.count ?? null;
  console.log("\n--- breakdowns ---");
  try {
    const accRoles: any[] = await db.collection("rvb_accounts").aggregate([{ $group: { _id: "$role", n: { $sum: 1 } } }]).toArray();
    console.log("rvb_accounts by role:", JSON.stringify(accRoles));
  } catch (e: any) { console.log("rvb_accounts by role: n/a", e?.message); }
  try {
    const convTypes: any[] = await db.collection("conversations").aggregate([{ $group: { _id: "$type", n: { $sum: 1 } } }]).toArray();
    console.log("conversations by type:", JSON.stringify(convTypes));
  } catch (e: any) { console.log("conversations by type: n/a", e?.message); }
  try {
    const upProv: any[] = await db.collection("chat_uploads").aggregate([{ $group: { _id: "$provider", n: { $sum: 1 } } }]).toArray();
    console.log("chat_uploads by provider:", JSON.stringify(upProv));
    const sample: any[] = await db.collection("chat_uploads").find({}).limit(3).toArray();
    console.log("chat_uploads sample publicIds:", JSON.stringify(sample.map((s: any) => ({ publicId: s.publicId, provider: s.provider, status: s.status }))));
  } catch (e: any) { console.log("chat_uploads: n/a", e?.message); }
  try {
    const settings: any[] = await db.collection("settings").find({}).toArray();
    console.log(`settings docs: ${settings.length}`, settings.length ? `keys=${Object.keys(settings[0]).join(",")}` : "");
  } catch (e: any) { console.log("settings: n/a", e?.message); }
  try {
    const idx: any[] = await db.collection("customer_orders").listIndexes().toArray().catch(() => []);
    console.log("customer_orders indexes:", JSON.stringify(idx.map((i: any) => i.name)));
  } catch (e: any) { console.log("customer_orders indexes: n/a", e?.message); }

  await mongoose.disconnect();
  console.log("\nINVENTORY DONE (read-only, nothing modified)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
