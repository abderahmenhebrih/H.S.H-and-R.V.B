import dotenv from "dotenv";
import path from "path";
import dns from "dns";
import { v4 as uuidv4 } from "uuid";
dns.setServers(["8.8.8.8", "1.1.1.1"]);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
import { MongoClient } from "mongodb";
import { assertLiveQaTarget } from "../src/lib/test-db-guard";

const CUSTOMER_ID = "cust-r484-2mfc";
const TARGET_BALANCE = 30000;

async function main(){
  const uri = process.env.MONGODB_URI!;
  // Intentional live-QA writer (fixed QA customer id only): requires explicit opt-in.
  assertLiveQaTarget(uri, { liveQa: true });
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const db = client.db();
  const customers = db.collection("customers");
  const sales = db.collection("sales");
  const products = db.collection("products");
  const customerRequests = db.collection("customer_requests");
  const customerOrders = db.collection("customer_orders");

  const cust = await customers.findOne({ id: CUSTOMER_ID });
  if(!cust){ console.error("Customer not found", CUSTOMER_ID); process.exit(1); }
  console.log("Before customer", JSON.stringify({ balance: cust.balance, name: cust.name }, null,2));

  await customers.updateOne({ id: CUSTOMER_ID }, { $set: { balance: TARGET_BALANCE, updatedAt: Date.now() }});
  console.log(`Set customer ${CUSTOMER_ID} balance=${TARGET_BALANCE}`);

  // Ensure at least 2 historical sales
  const existingSales = await sales.find({ customerId: CUSTOMER_ID }).toArray();
  console.log(`Existing sales ${existingSales.length}`);
  if(existingSales.length < 2){
    let product = await products.findOne({});
    if(!product){
      const now = Date.now();
      const prodId = `prod-${uuidv4()}`;
      await products.insertOne({
        id: prodId,
        createdAt: now,
        updatedAt: now,
        syncStatus: "synced",
        serverRevision: 1,
        name: "QA Product Chicken Cust",
        price: 600,
        quantity: 200,
        weightKg: 200,
        description: "QA product for customer test",
        taxProfileId: null,
      } as any);
      product = await products.findOne({ id: prodId });
    }
    console.log(`Using product ${product.id} price ${product.price}`);
    const now = Date.now();
    for(let i=existingSales.length; i<2; i++){
      const saleId = `sale-${uuidv4()}`;
      const item = {
        productId: product.id,
        quantity: 2 + i,
        weightKg: 5 + i*5,
        price: product.price,
        total: (5 + i*5) * product.price,
      };
      const total = item.total;
      await sales.insertOne({
        id: saleId,
        createdAt: now - (i+1)*86400000,
        updatedAt: now - (i+1)*86400000,
        syncStatus: "synced",
        serverRevision: 200 + i,
        customerId: CUSTOMER_ID,
        date: now - (i+1)*86400000,
        items: [item],
        total,
      } as any);
      console.log(`Inserted sale ${saleId} total ${total}`);
    }
  }

  // Clean under_review requests/orders for clean test
  const delReq = await customerRequests.deleteMany({ customerId: CUSTOMER_ID, status: "under_review" });
  console.log(`Deleted ${delReq.deletedCount} pending customer_requests`);
  const delOrd = await customerOrders.deleteMany({ customerId: CUSTOMER_ID, status: "under_review" });
  console.log(`Deleted ${delOrd.deletedCount} pending customer_orders`);

  // Ensure product has enough inventory for tests (200 quantity, 200 weight)
  const prod = await products.findOne({ quantity: { $gte: 0 } });
  if(prod){
    await products.updateOne({ id: prod.id }, { $set: { quantity: Math.max(200, prod.quantity), weightKg: Math.max(200, prod.weightKg), updatedAt: Date.now() } } );
    console.log(`Ensured product ${prod.id} inventory >=200`);
  }

  const custAfter = await customers.findOne({ id: CUSTOMER_ID });
  console.log("After customer balance", custAfter?.balance);
  const salesAfter = await sales.find({ customerId: CUSTOMER_ID }).sort({ date: -1 }).limit(3).toArray();
  console.log("Recent sales", JSON.stringify(salesAfter.map(s=> ({id:s.id, total:s.total})), null,2));
  const ordersAfter = await customerOrders.find({ customerId: CUSTOMER_ID }).toArray();
  console.log(`Orders ${ordersAfter.length}`);

  await client.close();
  console.log("Seed customer done");
}
main().catch(e=>{console.error(e); process.exit(1);});
