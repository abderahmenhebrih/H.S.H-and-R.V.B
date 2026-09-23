import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";

async function run() {
  const mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongod.waitUntilRunning();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
  const { processSyncOperation } = await import("./src/sync/sync-service.ts");
  const { ProductModel } = await import("./src/models/product.model.ts");
  const { CustomerModel } = await import("./src/models/customer.model.ts");
  const { SupplierModel } = await import("./src/models/supplier.model.ts");
  const { SaleModel } = await import("./src/models/sale.model.ts");
  const { PurchaseModel } = await import("./src/models/purchase.model.ts");
  const { BankAccountModel } = await import("./src/models/bank-account.model.ts");
  const { PaymentModel } = await import("./src/models/payment.model.ts");
  const { TransferModel } = await import("./src/models/transfer.model.ts");
  const { IncomingInvoiceModel } = await import("./src/models/incoming-invoice.model.ts");
  const { TaskModel } = await import("./src/models/task.model.ts");
  const { SyncCounterModel } = await import("./src/models/sync-counter.model.ts");
  const { SyncChangeModel } = await import("./src/models/sync-change.model.ts");
  const { ProcessedSyncOperationModel } = await import("./src/models/processed-sync-operation.model.ts");
  const { InvoiceTaxProfileModel } = await import("./src/models/invoice-tax-profile.model.ts");
  const { ExpenseModel } = await import("./src/models/expense.model.ts");

  let passed = 0, failed = 0;
  const ok = (n: string) => { console.log(`✅ ${n}`); passed++; };
  const fail = (n: string, e: any) => { console.log(`❌ ${n}: ${e?.message || e}`); failed++; };
  const opId = () => `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clean = async () => {
    await Promise.all([
      ProductModel.deleteMany({}), CustomerModel.deleteMany({}), SupplierModel.deleteMany({}),
      SaleModel.deleteMany({}), PurchaseModel.deleteMany({}), BankAccountModel.deleteMany({}),
      PaymentModel.deleteMany({}), TransferModel.deleteMany({}), IncomingInvoiceModel.deleteMany({}),
      TaskModel.deleteMany({}), SyncChangeModel.deleteMany({}), ProcessedSyncOperationModel.deleteMany({}),
      InvoiceTaxProfileModel.deleteMany({}), ExpenseModel.deleteMany({}), SyncCounterModel.deleteMany({}),
    ]);
  };
  const cProd = async (id: string, qty: number, weight: number, price: number) => processSyncOperation({ operationId: opId(), entity: "product", entityId: id, operation: "create", payload: { id, name: `Prod-${id}`, price, quantity: qty, weightKg: weight, createdAt: Date.now(), updatedAt: Date.now(), syncStatus: "pending" }, clientId: "test" } as any);
  const cCust = async (id: string) => processSyncOperation({ operationId: opId(), entity: "customer", entityId: id, operation: "create", payload: { id, name: `Cust-${id}`, phone: "+213", type: "Retail", balance: 0, createdAt: Date.now(), updatedAt: Date.now(), syncStatus: "pending" }, clientId: "test" } as any);
  const cSup = async (id: string) => processSyncOperation({ operationId: opId(), entity: "supplier", entityId: id, operation: "create", payload: { id, name: `Sup-${id}`, phone: "+213", balance: 0, createdAt: Date.now(), updatedAt: Date.now(), syncStatus: "pending" }, clientId: "test" } as any);
  const cBank = async (id: string, bal: number) => processSyncOperation({ operationId: opId(), entity: "bankAccount", entityId: id, operation: "create", payload: { id, name: `Bank-${id}`, type: "cash", initialBalance: bal, balance: bal, createdAt: Date.now(), updatedAt: Date.now(), syncStatus: "pending" }, clientId: "test" } as any);

  // 1 Sale success
  try { await clean(); await cProd("P1", 10, 10, 10); await cCust("C1");
    const r = await processSyncOperation({ operationId: opId(), entity: "sale", entityId: "sale1", operation: "create", payload: { id:"sale1", customerId:"C1", date: Date.now(), items:[{productId:"P1", quantity:2, weightKg:2, price:10, total:20}], total:20, createdAt: Date.now(), updatedAt: Date.now(), syncStatus:"pending"}, clientId:"A"} as any);
    if(!r.success) throw new Error("sale create should succeed");
    const prod=await ProductModel.findOne({id:"P1"}).lean() as any;
    const cust=await CustomerModel.findOne({id:"C1"}).lean() as any;
    if(prod.quantity!==8||cust.balance!==20) throw new Error(`prod8 cust20 got ${prod.quantity} ${cust.balance}`);
    ok("1 Sale success Product8 Customer20");
  } catch(e:any){ fail("1 Sale success",e); }
  // 2 Sale oversell
  try { await clean(); await cProd("P2",5,10,10); await cCust("C2");
    await processSyncOperation({operationId:opId(),entity:"sale",entityId:"sA",operation:"create",payload:{id:"sA",customerId:"C2",date:Date.now(),items:[{productId:"P2",quantity:4,weightKg:4,price:10,total:40}],total:40,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const rB=await processSyncOperation({operationId:opId(),entity:"sale",entityId:"sB",operation:"create",payload:{id:"sB",customerId:"C2",date:Date.now(),items:[{productId:"P2",quantity:4,weightKg:4,price:10,total:40}],total:40,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"B"} as any);
    if(rB.success) throw new Error("oversell should fail");
    const prod=await ProductModel.findOne({id:"P2"}).lean() as any;
    if(prod.quantity!==1) throw new Error(`qty1 got ${prod.quantity}`);
    ok("2 Sale oversell rejected qty1");
  } catch(e:any){ fail("2 Sale oversell",e);}
  // 3 Sale replay
  try { await clean(); await cProd("P3",10,10,10); await cCust("C3");
    const oid=opId();
    await processSyncOperation({operationId:oid,entity:"sale",entityId:"saleR",operation:"create",payload:{id:"saleR",customerId:"C3",date:Date.now(),items:[{productId:"P3",quantity:2,weightKg:2,price:10,total:20}],total:20,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const replay=await processSyncOperation({operationId:oid,entity:"sale",entityId:"saleR",operation:"create",payload:{id:"saleR",customerId:"C3",date:Date.now(),items:[{productId:"P3",quantity:2,weightKg:2,price:10,total:20}],total:20,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const prod=await ProductModel.findOne({id:"P3"}).lean() as any;
    if(prod.quantity!==8) throw new Error(`replay double-apply got ${prod.quantity}`);
    ok("3 Sale replay idempotent");
  } catch(e:any){ fail("3 Sale replay",e);}
  // 4 concurrent Purchase
  try{ await clean(); await cProd("P4",5,10,10); await cSup("S1");
    const pA=processSyncOperation({operationId:opId(),entity:"purchase",entityId:"purA",operation:"create",payload:{id:"purA",supplierId:"S1",date:Date.now(),items:[{productId:"P4",quantity:4,weightKg:4,price:10,total:40}],total:40,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const pB=processSyncOperation({operationId:opId(),entity:"purchase",entityId:"purB",operation:"create",payload:{id:"purB",supplierId:"S1",date:Date.now(),items:[{productId:"P4",quantity:4,weightKg:4,price:10,total:40}],total:40,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"B"} as any);
    const [rA,rB]=await Promise.all([pA,pB]);
    if(!rA.success||!rB.success) throw new Error("both purchases should succeed");
    const prod=await ProductModel.findOne({id:"P4"}).lean() as any;
    if(prod.quantity!==13) throw new Error(`qty13 got ${prod.quantity}`);
    ok("4 concurrent Purchase qty13");
  }catch(e:any){ fail("4 Purchase",e);}
  // 5 concurrent Payment
  try{ await clean(); await cBank("B1",500); await cSup("S5"); await SupplierModel.updateOne({id:"S5"},{$set:{balance:400}}); await BankAccountModel.updateOne({id:"B1"},{$set:{balance:500}});
    const payA=processSyncOperation({operationId:opId(),entity:"payment",entityId:"payA",operation:"create",payload:{id:"payA",entityType:"supplier",entityId:"S5",accountId:"B1",amount:300,date:Date.now(),createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const payB=processSyncOperation({operationId:opId(),entity:"payment",entityId:"payB",operation:"create",payload:{id:"payB",entityType:"supplier",entityId:"S5",accountId:"B1",amount:300,date:Date.now(),createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"B"} as any);
    const [rA,rB]=await Promise.all([payA,payB]);
    const succ=[rA,rB].filter(r=>r.success).length;
    if(succ!==1) throw new Error(`expected 1 success got ${succ}`);
    ok("5 concurrent Payment 1 success");
  }catch(e:any){ fail("5 Payment",e);}
  // 6 concurrent Transfer
  try{ await clean(); await cBank("Src",500); await cBank("Dst",100);
    const tA=processSyncOperation({operationId:opId(),entity:"transfer",entityId:"trA",operation:"create",payload:{id:"trA",fromAccountId:"Src",toAccountId:"Dst",amount:400,date:Date.now(),createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const tB=processSyncOperation({operationId:opId(),entity:"transfer",entityId:"trB",operation:"create",payload:{id:"trB",fromAccountId:"Src",toAccountId:"Dst",amount:400,date:Date.now(),createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"B"} as any);
    const [rA,rB]=await Promise.all([tA,tB]);
    const succ=[rA,rB].filter(r=>r.success).length;
    if(succ!==1) throw new Error(`expected 1 success got ${succ}`);
    ok("6 concurrent Transfer 1 success");
  }catch(e:any){ fail("6 Transfer",e);}
  // 7 Sale update
  try{ await clean(); await cProd("P7",10,10,10); await cCust("C7");
    const nowDate=Date.now();
    await processSyncOperation({operationId:opId(),entity:"sale",entityId:"sale7",operation:"create",payload:{id:"sale7",customerId:"C7",date:nowDate,items:[{productId:"P7",quantity:2,weightKg:2,price:10,total:20}],total:20,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const prodMid=await ProductModel.findOne({id:"P7"}).lean() as any;
    const upd=await processSyncOperation({operationId:opId(),entity:"sale",entityId:"sale7",operation:"update",payload:{customerId:"C7",date:nowDate,items:[{productId:"P7",quantity:3,weightKg:3,price:10,total:30}],total:30},clientId:"A"} as any);
    if(!upd.success) throw new Error("sale update should succeed");
    const prod=await ProductModel.findOne({id:"P7"}).lean() as any;
    const cust=await CustomerModel.findOne({id:"C7"}).lean() as any;
    if(prod.quantity!==7||cust.balance!==30) throw new Error(`sale update prod7 bal30 got ${prod.quantity} ${cust.balance}`);
    ok("7 Sale update qty2->3");
  }catch(e:any){ fail("7 Sale update",e);}
  // 8 Purchase update
  try{ await clean(); await cProd("P8",10,10,10); await cSup("S8");
    const nowP=Date.now();
    await processSyncOperation({operationId:opId(),entity:"purchase",entityId:"pur8",operation:"create",payload:{id:"pur8",supplierId:"S8",date:nowP,items:[{productId:"P8",quantity:2,weightKg:2,price:10,total:20}],total:20,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const upd=await processSyncOperation({operationId:opId(),entity:"purchase",entityId:"pur8",operation:"update",payload:{supplierId:"S8",date:nowP,items:[{productId:"P8",quantity:3,weightKg:3,price:10,total:30}],total:30},clientId:"A"} as any);
    if(!upd.success) throw new Error("purchase update should succeed");
    const prod=await ProductModel.findOne({id:"P8"}).lean() as any;
    const sup=await SupplierModel.findOne({id:"S8"}).lean() as any;
    if(prod.quantity!==13||sup.balance!==30) throw new Error(`pur update prod13 bal30 got ${prod.quantity} ${sup.balance}`);
    ok("8 Purchase update");
  }catch(e:any){ fail("8 Purchase update",e);}
  // 9 Payment update
  try{ await clean(); await cBank("PB",500); await cSup("SP9"); await SupplierModel.updateOne({id:"SP9"},{$set:{balance:400}}); await BankAccountModel.updateOne({id:"PB"},{$set:{balance:500}});
    await processSyncOperation({operationId:opId(),entity:"payment",entityId:"pay9",operation:"create",payload:{id:"pay9",entityType:"supplier",entityId:"SP9",accountId:"PB",amount:100,date:Date.now(),createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const upd=await processSyncOperation({operationId:opId(),entity:"payment",entityId:"pay9",operation:"update",payload:{amount:150},clientId:"A"} as any);
    if(!upd.success) throw new Error("payment update should succeed");
    const sup=await SupplierModel.findOne({id:"SP9"}).lean() as any;
    const bank=await BankAccountModel.findOne({id:"PB"}).lean() as any;
    if(sup.balance!==250||bank.balance!==350) throw new Error(`pay update sup250 bank350 got ${sup.balance} ${bank.balance}`);
    ok("9 Payment update");
  }catch(e:any){ fail("9 Payment update",e);}
  // 10 Transfer update rejected
  try{ await clean(); await cBank("T1",500); await cBank("T2",100);
    await processSyncOperation({operationId:opId(),entity:"transfer",entityId:"tr10",operation:"create",payload:{id:"tr10",fromAccountId:"T1",toAccountId:"T2",amount:200,date:Date.now(),createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const upd=await processSyncOperation({operationId:opId(),entity:"transfer",entityId:"tr10",operation:"update",payload:{amount:250},clientId:"A"} as any);
    if(upd.success) throw new Error("transfer update should be rejected");
    if(!upd.error?.includes("TRANSFER_UPDATE_UNSUPPORTED")) throw new Error(`wrong error ${upd.error}`);
    ok("10 Transfer update rejected");
  }catch(e:any){ fail("10 Transfer update",e);}
  // 11 Sale delete
  try{ await clean(); await cProd("P11",10,10,10); await cCust("C11");
    await processSyncOperation({operationId:opId(),entity:"sale",entityId:"sale11",operation:"create",payload:{id:"sale11",customerId:"C11",date:Date.now(),items:[{productId:"P11",quantity:2,weightKg:2,price:10,total:20}],total:20,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const del=await processSyncOperation({operationId:opId(),entity:"sale",entityId:"sale11",operation:"delete",payload:{id:"sale11"},clientId:"A"} as any);
    if(!del.success) throw new Error("sale delete should succeed");
    const prod=await ProductModel.findOne({id:"P11"}).lean() as any;
    const cust=await CustomerModel.findOne({id:"C11"}).lean() as any;
    const sale=await SaleModel.findOne({id:"sale11"}).lean();
    if(sale) throw new Error("sale should be deleted");
    if(prod.quantity!==10||cust.balance!==0) throw new Error(`sale delete prod10 bal0 got ${prod.quantity} ${cust.balance}`);
    ok("11 Sale delete reversal");
  }catch(e:any){ fail("11 Sale delete",e);}
  // 12 Purchase delete (with safety)
  try{ await clean(); await cProd("P12",10,10,10); await cSup("S12");
    await processSyncOperation({operationId:opId(),entity:"purchase",entityId:"pur12",operation:"create",payload:{id:"pur12",supplierId:"S12",date:Date.now(),items:[{productId:"P12",quantity:2,weightKg:2,price:10,total:20}],total:20,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const del=await processSyncOperation({operationId:opId(),entity:"purchase",entityId:"pur12",operation:"delete",payload:{id:"pur12"},clientId:"A"} as any);
    if(!del.success) throw new Error("purchase delete should succeed");
    const prod=await ProductModel.findOne({id:"P12"}).lean() as any;
    if(prod.quantity!==10) throw new Error(`prod10 got ${prod.quantity}`);
    ok("12 Purchase delete");
  }catch(e:any){ fail("12 Purchase delete",e);}
  // 13 Payment delete
  try{ await clean(); await cBank("PB13",500); await cSup("SP13"); await SupplierModel.updateOne({id:"SP13"},{$set:{balance:400}}); await BankAccountModel.updateOne({id:"PB13"},{$set:{balance:500}});
    await processSyncOperation({operationId:opId(),entity:"payment",entityId:"pay13",operation:"create",payload:{id:"pay13",entityType:"supplier",entityId:"SP13",accountId:"PB13",amount:100,date:Date.now(),createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const del=await processSyncOperation({operationId:opId(),entity:"payment",entityId:"pay13",operation:"delete",payload:{id:"pay13"},clientId:"A"} as any);
    if(!del.success) throw new Error("payment delete should succeed");
    const sup=await SupplierModel.findOne({id:"SP13"}).lean() as any;
    const bank=await BankAccountModel.findOne({id:"PB13"}).lean() as any;
    if(sup.balance!==400||bank.balance!==500) throw new Error(`pay delete sup400 bank500 got ${sup.balance} ${bank.balance}`);
    ok("13 Payment delete reversal");
  }catch(e:any){ fail("13 Payment delete",e);}
  // 14 Transfer delete rejected
  try{ await clean(); await cBank("TD1",500); await cBank("TD2",100);
    await processSyncOperation({operationId:opId(),entity:"transfer",entityId:"tr14",operation:"create",payload:{id:"tr14",fromAccountId:"TD1",toAccountId:"TD2",amount:100,date:Date.now(),createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const del=await processSyncOperation({operationId:opId(),entity:"transfer",entityId:"tr14",operation:"delete",payload:{id:"tr14"},clientId:"A"} as any);
    if(del.success) throw new Error("transfer delete should be rejected");
    ok("14 Transfer delete rejected");
  }catch(e:any){ fail("14 Transfer delete",e);}
  // 15 rejected create no SyncChange
  try{ await clean(); await cProd("P15",5,5,10); await cCust("C15");
    await processSyncOperation({operationId:opId(),entity:"sale",entityId:"sale15a",operation:"create",payload:{id:"sale15a",customerId:"C15",date:Date.now(),items:[{productId:"P15",quantity:4,weightKg:4,price:10,total:40}],total:40,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const rej=await processSyncOperation({operationId:opId(),entity:"sale",entityId:"sale15b",operation:"create",payload:{id:"sale15b",customerId:"C15",date:Date.now(),items:[{productId:"P15",quantity:4,weightKg:4,price:10,total:40}],total:40,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"B"} as any);
    if(rej.success) throw new Error("should reject");
    const changes=await SyncChangeModel.find({entity:"sale",entityId:"sale15b"}).lean();
    if(changes.length!==0) throw new Error("rejected should emit no SyncChange");
    ok("15 rejected no SyncChange");
  }catch(e:any){ fail("15 rejected no SyncChange",e);}
  // 16 successful emits SyncChanges
  try{ await clean(); await cProd("P16",10,10,10); await cCust("C16");
    const r=await processSyncOperation({operationId:opId(),entity:"sale",entityId:"sale16",operation:"create",payload:{id:"sale16",customerId:"C16",date:Date.now(),items:[{productId:"P16",quantity:2,weightKg:2,price:10,total:20}],total:20,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    if(!r.success) throw new Error("sale should succeed");
    const changes=await SyncChangeModel.find({entity:"sale",entityId:"sale16"}).lean();
    if(changes.length===0) throw new Error("successful should emit SyncChange");
    ok("16 successful emits SyncChange");
  }catch(e:any){ fail("16 successful emits",e);}
  // 17 terminal retryable false
  try{ await clean(); const r=await processSyncOperation({operationId:opId(),entity:"product",entityId:"bad17",operation:"create",payload:{id:"bad17",name:"Bad",price:NaN,quantity:1,weightKg:1,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    if(r.retryable!==false) throw new Error("NaN should be retryable false");
    ok("17 terminal retryable false");
  }catch(e:any){ fail("17 terminal",e);}
  await mongoose.disconnect(); await mongod.stop();
  console.log(`\n=== H.S.H sync integrity: ${passed} passed, ${failed} failed ===`);
  if(failed>0) process.exit(1); process.exit(0);
}
run().catch(e=>{console.error(e);process.exit(1);});
