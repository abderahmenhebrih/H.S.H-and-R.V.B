import dotenv from "dotenv";
import path from "path";
import dns from "dns";
import { v4 as uuidv4 } from "uuid";
dns.setServers(["8.8.8.8", "1.1.1.1"]);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
import { MongoClient } from "mongodb";

const SUPPLIER_ID = "sup-r484-b8c3";
const TARGET_BALANCE = 20000;

async function main(){
  const uri = process.env.MONGODB_URI!;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const db = client.db();
  const suppliers = db.collection("suppliers");
  const purchases = db.collection("purchases");
  const products = db.collection("products");
  const supplierRequests = db.collection("supplier_requests");
  const payments = db.collection("payments");

  const sup = await suppliers.findOne({ id: SUPPLIER_ID });
  if(!sup){ console.error("Supplier not found", SUPPLIER_ID); process.exit(1); }
  console.log("Before supplier", JSON.stringify({ balance: sup.balance, name: sup.name }, null,2));

  // Ensure supplier balance is known
  await suppliers.updateOne({ id: SUPPLIER_ID }, { $set: { balance: TARGET_BALANCE, updatedAt: Date.now() }});
  console.log(`Set supplier ${SUPPLIER_ID} balance=${TARGET_BALANCE}`);

  // Ensure at least 2 historical purchases
  const existingPurchases = await purchases.find({ supplierId: SUPPLIER_ID }).toArray();
  console.log(`Existing purchases ${existingPurchases.length}`);
  if(existingPurchases.length < 2){
    // Need at least one product to create purchases
    let product = await products.findOne({});
    if(!product){
      console.log("No products, creating one");
      const now = Date.now();
      const prodId = `prod-${uuidv4()}`;
      await products.insertOne({
        id: prodId,
        createdAt: now,
        updatedAt: now,
        syncStatus: "synced",
        serverRevision: 1,
        name: "QA Product Chicken",
        price: 500,
        quantity: 100,
        weightKg: 100,
        description: "QA product for supplier test",
        taxProfileId: null,
      } as any);
      product = await products.findOne({ id: prodId });
    }
    console.log(`Using product ${product.id} price ${product.price}`);
    const now = Date.now();
    for(let i=existingPurchases.length; i<2; i++){
      const purchaseId = `pur-${uuidv4()}`;
      const item = {
        productId: product.id,
        quantity: 5 + i,
        weightKg: 10 + i*5,
        price: product.price,
        total: (10 + i*5) * product.price,
      };
      const total = item.total;
      await purchases.insertOne({
        id: purchaseId,
        createdAt: now - (i+1)*86400000,
        updatedAt: now - (i+1)*86400000,
        syncStatus: "synced",
        serverRevision: 100 + i,
        supplierId: SUPPLIER_ID,
        date: now - (i+1)*86400000,
        items: [item],
        total,
        calculation: null,
      } as any);
      console.log(`Inserted purchase ${purchaseId} total ${total}`);
    }
  }

  // Ensure no pending under_review requests for clean test
  const del = await supplierRequests.deleteMany({ supplierId: SUPPLIER_ID, status: "under_review" });
  console.log(`Deleted ${del.deletedCount} pending supplier_requests`);

  // Show final
  const supAfter = await suppliers.findOne({ id: SUPPLIER_ID });
  console.log("After supplier balance", supAfter?.balance);
  const purAfter = await purchases.find({ supplierId: SUPPLIER_ID }).sort({ date: -1 }).limit(3).toArray();
  console.log("Recent purchases", JSON.stringify(purAfter.map(p=> ({id:p.id, total:p.total, date:p.date})), null,2));
  const payAfter = await payments.find({ entityType: "supplier", entityId: SUPPLIER_ID }).limit(3).toArray();
  console.log(`Payments ${payAfter.length}`);

  await client.close();
  console.log("Seed supplier done");
}
main().catch(e=>{console.error(e); process.exit(1);});
