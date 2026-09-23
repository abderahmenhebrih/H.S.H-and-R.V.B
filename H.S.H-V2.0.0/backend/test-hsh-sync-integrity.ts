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
  // 18 P0: same-client stale rejection (must fail even for same client)
  try{ await clean(); await cProd("Ps",10,10,10);
    const r1=await processSyncOperation({operationId:opId(),entity:"product",entityId:"Ps",operation:"create",payload:{id:"Ps",name:"Prod-Ps",price:10,quantity:10,weightKg:10,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const prodAfter: any = await ProductModel.findOne({id:"Ps"}).lean();
    const rev = prodAfter.serverRevision ?? 0;
    const up1=await processSyncOperation({operationId:opId(),entity:"product",entityId:"Ps",operation:"update",payload:{price:20},clientId:"A",baseRevision: rev} as any);
    if(!up1.success) throw new Error("first update should succeed");
    const prod2: any = await ProductModel.findOne({id:"Ps"}).lean();
    if(prod2.price!==20) throw new Error(`price20 got ${prod2.price}`);
    const stale = await processSyncOperation({operationId:opId(),entity:"product",entityId:"Ps",operation:"update",payload:{price:30},clientId:"A",baseRevision: rev} as any);
    if(stale.success) throw new Error("stale same-client should be rejected");
    if(stale.error!=="CONFLICT_STALE_REVISION") throw new Error(`expected CONFLICT_STALE_REVISION got ${stale.error}`);
    const prod3:any = await ProductModel.findOne({id:"Ps"}).lean();
    if(prod3.price!==20) throw new Error(`canonical remains20 got ${prod3.price}`);
    ok("18 same-client stale rejection");
  }catch(e:any){ fail("18 same-client stale",e);}
  // 19 Sale customer change
  try{ await clean(); await cProd("P19a",10,10,10); await cProd("P19b",10,10,10); await cCust("C19a"); await cCust("C19b");
    const now19=Date.now();
    await processSyncOperation({operationId:opId(),entity:"sale",entityId:"sale19",operation:"create",payload:{id:"sale19",customerId:"C19a",date:now19,items:[{productId:"P19a",quantity:2,weightKg:2,price:10,total:20}],total:20,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const upd19=await processSyncOperation({operationId:opId(),entity:"sale",entityId:"sale19",operation:"update",payload:{customerId:"C19b",date:now19,items:[{productId:"P19b",quantity:1,weightKg:1,price:10,total:10}],total:10},clientId:"A"} as any);
    if(!upd19.success) throw new Error("sale customer change should succeed");
    const p19a:any=await ProductModel.findOne({id:"P19a"}).lean();
    const p19b:any=await ProductModel.findOne({id:"P19b"}).lean();
    const c19a:any=await CustomerModel.findOne({id:"C19a"}).lean();
    const c19b:any=await CustomerModel.findOne({id:"C19b"}).lean();
    if(p19a.quantity!==10) throw new Error(`P19a restored10 got ${p19a.quantity}`);
    if(p19b.quantity!==9) throw new Error(`P19b 9 got ${p19b.quantity}`);
    if(c19a.balance!==0) throw new Error(`C19a 0 got ${c19a.balance}`);
    if(c19b.balance!==10) throw new Error(`C19b 10 got ${c19b.balance}`);
    ok("19 Sale customer+product change");
  }catch(e:any){ fail("19 Sale customer change",e);}
  // 20 Sale product change rollback on insufficient stock
  try{ await clean(); await cProd("P20a",2,10,10); await cProd("P20b",1,10,10); await cCust("C20");
    const now20=Date.now();
    await processSyncOperation({operationId:opId(),entity:"sale",entityId:"sale20",operation:"create",payload:{id:"sale20",customerId:"C20",date:now20,items:[{productId:"P20a",quantity:2,weightKg:2,price:10,total:20}],total:20,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    // P20a 0 left, P20b 1 left — try to update to need 2 of P20b (insufficient)
    const upd20=await processSyncOperation({operationId:opId(),entity:"sale",entityId:"sale20",operation:"update",payload:{customerId:"C20",date:now20,items:[{productId:"P20b",quantity:5,weightKg:5,price:10,total:50}],total:50},clientId:"A"} as any);
    if(upd20.success) throw new Error("should fail insufficient");
    const p20a:any=await ProductModel.findOne({id:"P20a"}).lean();
    const p20b:any=await ProductModel.findOne({id:"P20b"}).lean();
    const c20:any=await CustomerModel.findOne({id:"C20"}).lean();
    if(p20a.quantity!==0||p20b.quantity!==1||c20.balance!==20) throw new Error(`rollback preserved prod ${p20a.quantity} ${p20b.quantity} cust ${c20.balance}`);
    ok("20 Sale product-change insufficient rollback");
  }catch(e:any){ fail("20 Sale rollback",e);}
  // 21 Purchase supplier change
  try{ await clean(); await cProd("P21",10,10,10); await cSup("S21a"); await cSup("S21b");
    const now21=Date.now();
    await processSyncOperation({operationId:opId(),entity:"purchase",entityId:"pur21",operation:"create",payload:{id:"pur21",supplierId:"S21a",date:now21,items:[{productId:"P21",quantity:2,weightKg:2,price:10,total:20}],total:20,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const upd21=await processSyncOperation({operationId:opId(),entity:"purchase",entityId:"pur21",operation:"update",payload:{supplierId:"S21b",date:now21,items:[{productId:"P21",quantity:3,weightKg:3,price:10,total:30}],total:30},clientId:"A"} as any);
    if(!upd21.success) throw new Error("purchase supplier change should succeed");
    const p21:any=await ProductModel.findOne({id:"P21"}).lean();
    const s21a:any=await SupplierModel.findOne({id:"S21a"}).lean();
    const s21b:any=await SupplierModel.findOne({id:"S21b"}).lean();
    if(p21.quantity!==13) throw new Error(`p21 13 got ${p21.quantity}`);
    if(s21a.balance!==0||s21b.balance!==30) throw new Error(`sup balances ${s21a.balance} ${s21b.balance}`);
    ok("21 Purchase supplier+qty change");
  }catch(e:any){ fail("21 Purchase supplier change",e);}
  // 22 Purchase product change
  try{ await clean(); await cProd("P22a",10,10,10); await cProd("P22b",10,10,10); await cSup("S22");
    const now22=Date.now();
    await processSyncOperation({operationId:opId(),entity:"purchase",entityId:"pur22",operation:"create",payload:{id:"pur22",supplierId:"S22",date:now22,items:[{productId:"P22a",quantity:2,weightKg:2,price:10,total:20}],total:20,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const upd22=await processSyncOperation({operationId:opId(),entity:"purchase",entityId:"pur22",operation:"update",payload:{supplierId:"S22",date:now22,items:[{productId:"P22b",quantity:2,weightKg:2,price:10,total:20}],total:20},clientId:"A"} as any);
    if(!upd22.success) throw new Error("purchase product change should succeed");
    const p22a:any=await ProductModel.findOne({id:"P22a"}).lean();
    const p22b:any=await ProductModel.findOne({id:"P22b"}).lean();
    if(p22a.quantity!==10||p22b.quantity!==12) throw new Error(`p22a10 p22b12 got ${p22a.quantity} ${p22b.quantity}`);
    ok("22 Purchase product change");
  }catch(e:any){ fail("22 Purchase product change",e);}
  // 23 Purchase delete insufficient-stock
  try{ await clean(); await cProd("P23",10,10,10); await cSup("S23");
    const now23=Date.now();
    await processSyncOperation({operationId:opId(),entity:"purchase",entityId:"pur23",operation:"create",payload:{id:"pur23",supplierId:"S23",date:now23,items:[{productId:"P23",quantity:5,weightKg:5,price:10,total:50}],total:50,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    // sale consumes 12 of P23 -> leaves 3, so purchase delete requires removing 5 -> insufficient
    await cCust("C23");
    await processSyncOperation({operationId:opId(),entity:"sale",entityId:"sale23",operation:"create",payload:{id:"sale23",customerId:"C23",date:Date.now(),items:[{productId:"P23",quantity:12,weightKg:12,price:10,total:120}],total:120,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const del23=await processSyncOperation({operationId:opId(),entity:"purchase",entityId:"pur23",operation:"delete",payload:{id:"pur23"},clientId:"A"} as any);
    if(del23.success) throw new Error("purchase delete should be rejected insufficient stock");
    const p23:any=await ProductModel.findOne({id:"P23"}).lean();
    if(p23.quantity!==3) throw new Error(`p23 remains3 got ${p23.quantity}`);
    ok("23 Purchase delete insufficient stock rejected");
  }catch(e:any){ fail("23 Purchase delete stock",e);}
  // 24 Payment customer matrix: create incoming with empty bank
  try{ await clean(); await cBank("Bank24",0); await cCust("Cust24"); await CustomerModel.updateOne({id:"Cust24"},{$set:{balance:100}});
    const r24=await processSyncOperation({operationId:opId(),entity:"payment",entityId:"pay24",operation:"create",payload:{id:"pay24",entityType:"customer",entityId:"Cust24",accountId:"Bank24",amount:50,date:Date.now(),createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    if(!r24.success) throw new Error(`customer payment50 with bank0 should succeed, err ${r24.error}`);
    const bank24:any=await BankAccountModel.findOne({id:"Bank24"}).lean();
    const cust24:any=await CustomerModel.findOne({id:"Cust24"}).lean();
    if(bank24.balance!==50||cust24.balance!==50) throw new Error(`Bank50 Cust50 got ${bank24.balance} ${cust24.balance}`);
    ok("24 Payment customer incoming Bank0 succeeds");
  }catch(e:any){ fail("24 Payment customer Bank0",e);}
  // 25 Payment customer insufficient customer
  try{ await clean(); await cBank("Bank25",0); await cCust("Cust25"); await CustomerModel.updateOne({id:"Cust25"},{$set:{balance:40}});
    const r25=await processSyncOperation({operationId:opId(),entity:"payment",entityId:"pay25",operation:"create",payload:{id:"pay25",entityType:"customer",entityId:"Cust25",accountId:"Bank25",amount:50,date:Date.now(),createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    if(r25.success) throw new Error("customer insufficient should fail");
    if(!r25.error?.includes("INSUFFICIENT_CUSTOMER_BALANCE")) throw new Error(`wrong err ${r25.error}`);
    const bank25:any=await BankAccountModel.findOne({id:"Bank25"}).lean();
    if(bank25.balance!==0) throw new Error(`Bank stays0 got ${bank25.balance}`);
    ok("25 Payment customer insufficient rejected");
  }catch(e:any){ fail("25 Payment customer insufficient",e);}
  // 26 Customer payment update reverse old -> apply new30
  try{ await clean(); await cBank("Bank26",0); await cCust("Cust26"); await CustomerModel.updateOne({id:"Cust26"},{$set:{balance:100}});
    await processSyncOperation({operationId:opId(),entity:"payment",entityId:"pay26",operation:"create",payload:{id:"pay26",entityType:"customer",entityId:"Cust26",accountId:"Bank26",amount:50,date:Date.now(),createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const upd26=await processSyncOperation({operationId:opId(),entity:"payment",entityId:"pay26",operation:"update",payload:{amount:30},clientId:"A"} as any);
    if(!upd26.success) throw new Error(`customer update 50->30 should succeed ${upd26.error}`);
    const bank26:any=await BankAccountModel.findOne({id:"Bank26"}).lean();
    const cust26:any=await CustomerModel.findOne({id:"Cust26"}).lean();
    if(bank26.balance!==30||cust26.balance!==70) throw new Error(`Bank30 Cust70 got ${bank26.balance} ${cust26.balance}`);
    ok("26 Customer payment update 50->30");
  }catch(e:any){ fail("26 Customer payment update",e);}
  // 27 Customer -> Supplier payment transition (with reversal)
  try{ await clean(); await cBank("Bank27",50); await cSup("Sup27"); await SupplierModel.updateOne({id:"Sup27"},{$set:{balance:100}}); await cCust("Cust27"); await CustomerModel.updateOne({id:"Cust27"},{$set:{balance:100}});
    // Customer payment 50 -> Bank50->100? Actually start Bank50, Cust100 => after customer pay50 Bank100 Cust50
    await processSyncOperation({operationId:opId(),entity:"payment",entityId:"pay27",operation:"create",payload:{id:"pay27",entityType:"customer",entityId:"Cust27",accountId:"Bank27",amount:50,date:Date.now(),createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    let bank27a:any=await BankAccountModel.findOne({id:"Bank27"}).lean();
    if(bank27a.balance!==100) throw new Error(`after customer pay Bank100 got ${bank27a.balance}`);
    const upd27=await processSyncOperation({operationId:opId(),entity:"payment",entityId:"pay27",operation:"update",payload:{entityType:"supplier",entityId:"Sup27",accountId:"Bank27",amount:30},clientId:"A"} as any);
    if(!upd27.success) throw new Error(`cust->sup should succeed ${upd27.error}`);
    const bank27:any=await BankAccountModel.findOne({id:"Bank27"}).lean();
    const cust27:any=await CustomerModel.findOne({id:"Cust27"}).lean();
    const sup27:any=await SupplierModel.findOne({id:"Sup27"}).lean();
    // After reverse cust: Bank50 Cust100, then supplier 30: Bank20 Sup70? Wait Bank after reverse 50, then -30 => 20? Actually Bank start 50, +50 =100, -50 reverse =50, -30 supplier =20
    if(bank27.balance!==20) throw new Error(`Bank20 got ${bank27.balance}`);
    if(cust27.balance!==100) throw new Error(`Cust100 got ${cust27.balance}`);
    if(sup27.balance!==70) throw new Error(`Sup70 got ${sup27.balance}`);
    ok("27 Customer->Supplier transition");
  }catch(e:any){ fail("27 Cust->Sup",e);}
  // 28 Supplier -> Customer (no insufficient bank error)
  try{ await clean(); await cBank("Bank28",0); await cSup("Sup28"); await SupplierModel.updateOne({id:"Sup28"},{$set:{balance:100}}); await cCust("Cust28"); await CustomerModel.updateOne({id:"Cust28"},{$set:{balance:100}});
    // supplier payment 50 needs Bank0 -> should fail? Actually supplier outgoing requires bank 0 insufficient, so start with Bank50
    await cBank("Bank28b",50); // use another bank with funds for supplier
    await processSyncOperation({operationId:opId(),entity:"payment",entityId:"pay28",operation:"create",payload:{id:"pay28",entityType:"supplier",entityId:"Sup28",accountId:"Bank28b",amount:40,date:Date.now(),createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    // Now update same payment to customer incoming should not require bank funds (incoming)
    // Keep same bank account Bank28b which now is 10 after supplier payment, but customer incoming will add, so should succeed
    const upd28=await processSyncOperation({operationId:opId(),entity:"payment",entityId:"pay28",operation:"update",payload:{entityType:"customer",entityId:"Cust28",accountId:"Bank28b",amount:30},clientId:"A"} as any);
    if(!upd28.success) throw new Error(`sup->cust should succeed without bank insufficient ${upd28.error}`);
    const bank28:any=await BankAccountModel.findOne({id:"Bank28b"}).lean();
    // After reverse supplier: Bank10+40=50, then customer 30: Bank80
    if(bank28.balance!==80) throw new Error(`Bank80 got ${bank28.balance}`);
    ok("28 Supplier->Customer no insufficient-bank");
  }catch(e:any){ fail("28 Sup->Cust",e);}
  // 29 Payment worker create
  try{ await clean(); await cBank("Bank29",100); const wId="W29";
    // Worker requires phone, startingSalary, monthlySalary, etc — create directly to avoid generic sync validation gaps
    const { WorkerModel } = await import("./src/models/worker.model.ts");
    await WorkerModel.create({id:wId,name:"W29-"+Date.now(),phone:"+213000",address:"addr",employmentDate:Date.now(),position:"butcher",startingSalary:0,monthlySalary:0,status:"active",balance:80,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"synced",serverRevision:1} as any);
    // ensure SyncChange for this worker so baseRevision consistent? Not needed for payment test
    const r29=await processSyncOperation({operationId:opId(),entity:"payment",entityId:"pay29",operation:"create",payload:{id:"pay29",entityType:"worker",entityId:wId,accountId:"Bank29",amount:50,date:Date.now(),createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    if(!r29.success) throw new Error("worker payment should succeed " + r29.error);
    ok("29 Payment worker create");
  }catch(e:any){ fail("29 Payment worker",e);}
  // 30 Payment expense create
  try{ await clean(); await cBank("Bank30",100); const expId="E30"; await processSyncOperation({operationId:opId(),entity:"expense",entityId:expId,operation:"create",payload:{id:expId,name:"Exp",amount:0,date:Date.now(),accountId:"Bank30",createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const r30=await processSyncOperation({operationId:opId(),entity:"payment",entityId:"pay30",operation:"create",payload:{id:"pay30",entityType:"expense",entityId:expId,accountId:"Bank30",amount:30,date:Date.now(),createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    if(!r30.success) throw new Error("expense payment should succeed");
    ok("30 Payment expense create");
  }catch(e:any){ fail("30 Payment expense",e);}
  // 31 Payment account change supplier payment
  try{ await clean(); await cBank("Bank31a",100); await cBank("Bank31b",100); await cSup("Sup31"); await SupplierModel.updateOne({id:"Sup31"},{$set:{balance:100}});
    await processSyncOperation({operationId:opId(),entity:"payment",entityId:"pay31",operation:"create",payload:{id:"pay31",entityType:"supplier",entityId:"Sup31",accountId:"Bank31a",amount:30,date:Date.now(),createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const upd31=await processSyncOperation({operationId:opId(),entity:"payment",entityId:"pay31",operation:"update",payload:{accountId:"Bank31b",amount:30},clientId:"A"} as any);
    if(!upd31.success) throw new Error("account change should succeed");
    const b31a:any=await BankAccountModel.findOne({id:"Bank31a"}).lean();
    const b31b:any=await BankAccountModel.findOne({id:"Bank31b"}).lean();
    if(b31a.balance!==100||b31b.balance!==70) throw new Error(`Bank31a100 Bank31b70 got ${b31a.balance} ${b31b.balance}`);
    ok("31 Payment account change");
  }catch(e:any){ fail("31 Payment account change",e);}
  // 32 Payment entity change supplier->supplier different supplier
  try{ await clean(); await cBank("Bank32",100); await cSup("Sup32a"); await cSup("Sup32b"); await SupplierModel.updateOne({id:"Sup32a"},{$set:{balance:100}}); await SupplierModel.updateOne({id:"Sup32b"},{$set:{balance:100}});
    await processSyncOperation({operationId:opId(),entity:"payment",entityId:"pay32",operation:"create",payload:{id:"pay32",entityType:"supplier",entityId:"Sup32a",accountId:"Bank32",amount:40,date:Date.now(),createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const upd32=await processSyncOperation({operationId:opId(),entity:"payment",entityId:"pay32",operation:"update",payload:{entityType:"supplier",entityId:"Sup32b",accountId:"Bank32",amount:30},clientId:"A"} as any);
    if(!upd32.success) throw new Error("supplier->supplier diff should succeed");
    const sup32a:any=await SupplierModel.findOne({id:"Sup32a"}).lean();
    const sup32b:any=await SupplierModel.findOne({id:"Sup32b"}).lean();
    if(sup32a.balance!==100||sup32b.balance!==70) throw new Error(`Sup32a100 Sup32b70 got ${sup32a.balance} ${sup32b.balance}`);
    ok("32 Payment entity change supplier diff");
  }catch(e:any){ fail("32 Payment entity diff",e);}
  // 33 Update replay idempotency
  try{ await clean(); await cProd("P33",10,10,10);
    const c33=await processSyncOperation({operationId:opId(),entity:"product",entityId:"P33",operation:"create",payload:{id:"P33",name:"Prod-P33",price:10,quantity:10,weightKg:10,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"pending"},clientId:"A"} as any);
    const prod33a:any=await ProductModel.findOne({id:"P33"}).lean();
    const rev33=prod33a.serverRevision??0;
    const oid33=opId();
    const up33=await processSyncOperation({operationId:oid33,entity:"product",entityId:"P33",operation:"update",payload:{price:25},clientId:"A",baseRevision:rev33} as any);
    if(!up33.success) throw new Error("first update should succeed");
    const replay33=await processSyncOperation({operationId:oid33,entity:"product",entityId:"P33",operation:"update",payload:{price:25},clientId:"A",baseRevision:rev33} as any);
    if(!replay33.success) throw new Error("replay should succeed idempotently");
    const prod33:any=await ProductModel.findOne({id:"P33"}).lean();
    if(prod33.price!==25) throw new Error(`price25 got ${prod33.price}`);
    ok("33 Update replay idempotent");
  }catch(e:any){ fail("33 Update replay",e);}
  // 34 Delete replay idempotency
  try{ await clean(); await cProd("P34",10,10,10);
    const pid34="P34"; const prod34a:any=await ProductModel.findOne({id:pid34}).lean(); const rev34=prod34a.serverRevision??0;
    const oid34=opId();
    const del34=await processSyncOperation({operationId:oid34,entity:"product",entityId:pid34,operation:"delete",payload:{id:pid34},clientId:"A",baseRevision:rev34} as any);
    if(!del34.success) throw new Error("first delete should succeed");
    const replay34=await processSyncOperation({operationId:oid34,entity:"product",entityId:pid34,operation:"delete",payload:{id:pid34},clientId:"A",baseRevision:rev34} as any);
    if(!replay34.success) throw new Error("delete replay should succeed");
    const exists=await ProductModel.findOne({id:pid34}).lean();
    if(exists) throw new Error("should still be deleted");
    ok("34 Delete replay idempotent");
  }catch(e:any){ fail("34 Delete replay",e);}

  await mongoose.disconnect(); await mongod.stop();
  console.log(`\n=== H.S.H sync integrity: ${passed} passed, ${failed} failed ===`);
  if(failed>0) process.exit(1); process.exit(0);
}
run().catch(e=>{console.error(e);process.exit(1);});
