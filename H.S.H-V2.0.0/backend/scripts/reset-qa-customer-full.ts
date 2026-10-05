import dotenv from "dotenv";
import path from "path";
import dns from "dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
import { MongoClient } from "mongodb";
import { assertLiveQaTarget } from "../src/lib/test-db-guard";

const CUSTOMER_ID = "cust-r484-2mfc";

async function main(){
  const uri = process.env.MONGODB_URI!;
  // Intentional live-QA writer (fixed QA customer id only): requires explicit opt-in.
  assertLiveQaTarget(uri, { liveQa: true });
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const db = client.db();
  const customers = db.collection("customers");
  const sales = db.collection("sales");
  const customerRequests = db.collection("customer_requests");
  const customerOrders = db.collection("customer_orders");
  const products = db.collection("products");

  await customers.updateOne({id: CUSTOMER_ID}, {$set:{balance:30000, updatedAt:Date.now()}});
  console.log("Reset balance 30000");

  const delReq = await customerRequests.deleteMany({customerId: CUSTOMER_ID});
  console.log(`Deleted ${delReq.deletedCount} customer_requests`);

  const delOrd = await customerOrders.deleteMany({customerId: CUSTOMER_ID});
  console.log(`Deleted ${delOrd.deletedCount} customer_orders`);

  // Keep only 2 seeded sales: sale-5ea37e69-15f5-4708-b0dc-03a1cb5e6acc and sale-ff34cf0d-6336-48e6-80cf-372de8e009bb
  const allSales = await sales.find({customerId: CUSTOMER_ID}).toArray();
  console.log(`Sales before ${allSales.length}`, allSales.map(s=> s.id));
  const keepIds = new Set(["sale-5ea37e69-15f5-4708-b0dc-03a1cb5e6acc", "sale-ff34cf0d-6336-48e6-80cf-372de8e009bb"]);
  let delCount=0;
  for(const s of allSales){
    if(!keepIds.has(s.id)){
      await sales.deleteOne({id: s.id});
      delCount++;
      console.log(`Deleted sale ${s.id} total ${s.total}`);
      // Revert product inventory (sale reduces inventory, so revert adds back)
      for(const it of s.items as any[]){
        const prod = await products.findOne({id: it.productId});
        if(prod){
          const newQty = (prod.quantity || 0) + it.quantity;
          const newWeight = (prod.weightKg || 0) + it.weightKg;
          await products.updateOne({id: it.productId}, {$set:{quantity: newQty, weightKg: newWeight, updatedAt:Date.now()}});
          console.log(`  Reverted product ${it.productId} quantity +${it.quantity} weight +${it.weightKg}`);
        }
      }
      // Revert customer balance
      const cust = await customers.findOne({id: CUSTOMER_ID});
      if(cust){
        await customers.updateOne({id: CUSTOMER_ID}, {$set:{balance: (cust.balance || 0) - s.total}});
        console.log(`  Reverted customer balance -${s.total}`);
      }
    }
  }
  console.log(`Deleted ${delCount} extra sales`);

  // Ensure customer balance is 30000 after revert
  await customers.updateOne({id: CUSTOMER_ID}, {$set:{balance:30000}});
  console.log("Final balance 30000");

  await client.close();
  console.log("Full reset customer done");
}
main().catch(e=>{console.error(e); process.exit(1);});
