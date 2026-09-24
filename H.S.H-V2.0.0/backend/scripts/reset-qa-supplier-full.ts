import dotenv from "dotenv";
import path from "path";
import dns from "dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
import { MongoClient } from "mongodb";

const SUPPLIER_ID = "sup-r484-b8c3";

async function main(){
  const uri = process.env.MONGODB_URI!;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const db = client.db();
  const suppliers = db.collection("suppliers");
  const purchases = db.collection("purchases");
  const supplierRequests = db.collection("supplier_requests");
  const products = db.collection("products");

  // Reset balance
  await suppliers.updateOne({id: SUPPLIER_ID}, {$set:{balance:20000, updatedAt:Date.now()}});
  console.log("Reset balance 20000");

  // Delete all supplier requests for this supplier
  const delReq = await supplierRequests.deleteMany({supplierId: SUPPLIER_ID});
  console.log(`Deleted ${delReq.deletedCount} supplier_requests`);

  // Delete purchases created via supply acceptance that are not the 2 seeded ones
  // Our seeded purchases are pur-9747... and pur-89b9... with totals 4500 and 6750
  // Delete any other purchases for this supplier
  const allPurchases = await purchases.find({supplierId: SUPPLIER_ID}).toArray();
  console.log(`Purchases before ${allPurchases.length}`, allPurchases.map(p=> p.id));
  // Keep only the 2 seeded
  const keepIds = new Set(["pur-9747a1c2-4af8-41e8-bb30-76de593329af", "pur-89b9e0f8-8602-4994-ade3-5747c819e585"]);
  let delCount=0;
  for(const p of allPurchases){
    if(!keepIds.has(p.id)){
      await purchases.deleteOne({id: p.id});
      delCount++;
      console.log(`Deleted purchase ${p.id} total ${p.total}`);
      // Also revert product inventory? For test we don't need to revert inventory exactly, but we should revert the product quantity/weight that was added
      // For simplicity, we will not revert inventory, but for next test inventory will be slightly higher than before. That's okay for test, but to be precise we should revert.
      // We can revert by subtracting the purchase items from product
      for(const it of p.items as any[]){
        const prod = await products.findOne({id: it.productId});
        if(prod){
          const newQty = (prod.quantity || 0) - it.quantity;
          const newWeight = (prod.weightKg || 0) - it.weightKg;
          await products.updateOne({id: it.productId}, {$set:{quantity: Math.max(0,newQty), weightKg: Math.max(0,newWeight), updatedAt:Date.now()}});
          console.log(`  Reverted product ${it.productId} quantity -${it.quantity} weight -${it.weightKg}`);
        }
      }
    }
  }
  console.log(`Deleted ${delCount} extra purchases`);

  // Ensure supplier balance still 20000 after revert
  await suppliers.updateOne({id: SUPPLIER_ID}, {$set:{balance:20000}});
  console.log("Final balance 20000");

  await client.close();
  console.log("Full reset supplier done");
}
main().catch(e=>{console.error(e); process.exit(1);});
