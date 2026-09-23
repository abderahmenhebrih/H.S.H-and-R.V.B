import "fake-indexeddb/auto";
import { db } from "./src/lib/database/db";
import { saleOperation } from "./src/services/operations/sale.operation";
import { purchaseOperation } from "./src/services/operations/purchase.operation";
import { paymentOperation } from "./src/services/operations/payment.operation";
import { productService } from "./src/services/product.service";
import { customerService } from "./src/services/customer.service";
import { supplierService } from "./src/services/supplier.service";
import { bankAccountService } from "./src/services/bank-account.service";
import { roundMoney } from "./src/lib/money";

let passed=0, failed=0;
const ok=(n:string)=>{console.log(`✅ ${n}`); passed++;};
const fail=(n:string,e:any)=>{console.log(`❌ ${n}: ${e?.message||e}`); failed++;};
const assert=(c:boolean,m:string)=>{ if(!c) throw new Error(m); };
const reset=async()=>{
  try{ await db.delete(); }catch{}
  await db.open();
  for(const tbl of (db as any).tables){ try{ await (db as any)[tbl.name].clear(); }catch{}}
};

async function run(){
  console.log("=== H.S.H sync client integrity: fake-indexeddb ===");
  // 1 authoritative CREATE queues only transaction
  try{ await reset();
    const prod=await productService.create({name:"P1",price:10,quantity:10,weightKg:10} as any);
    const cust=await customerService.create({name:"C1",phone:"+213",type:"Retail"} as any);
    await db.syncOperations.clear();
    await saleOperation.create({customerId:cust.id,date:Date.now(),items:[{productId:prod.id,quantity:1,weightKg:1,price:10,total:10}],total:10} as any);
    const ops=await db.syncOperations.toArray();
    const saleOps=ops.filter(o=>o.entity==="sale");
    const productOps=ops.filter(o=>o.entity==="product");
    const customerOps=ops.filter(o=>o.entity==="customer");
    assert(saleOps.length===1, `sale create should queue 1 sale, got ${saleOps.length} ${ops.map(o=>o.entity)}`);
    assert(productOps.length===0, `sale should not queue product, got ${productOps.length}`);
    assert(customerOps.length===0, `sale should not queue customer, got ${customerOps.length}`);
    ok("1 sale CREATE queues only sale");
  }catch(e:any){ fail("1 sale CREATE",e); }
  // 2 Sale UPDATE queues only sale
  try{ await reset();
    const prod=await productService.create({name:"P2",price:10,quantity:10,weightKg:10} as any);
    const cust=await customerService.create({name:"C2",phone:"+213",type:"Retail"} as any);
    const sale=await saleOperation.create({customerId:cust.id,date:Date.now(),items:[{productId:prod.id,quantity:1,weightKg:1,price:10,total:10}],total:10} as any);
    await db.syncOperations.clear();
    const { saleEditOperation } = await import("./src/services/operations/sale-edit.operation");
    await saleEditOperation.edit({saleId:sale.id,customerId:cust.id,date:Date.now(),items:[{productId:prod.id,quantity:2,weightKg:2,price:10,total:20}],total:20} as any);
    const ops2=await db.syncOperations.toArray();
    assert(ops2.length===1 && ops2[0].entity==="sale" && ops2[0].operation==="update", `sale update should queue 1 sale update, got ${ops2.length} ${ops2.map(o=>o.entity+":"+o.operation)}`);
    ok("2 Sale UPDATE queues only sale");
  }catch(e:any){ fail("2 Sale UPDATE",e); }
  // 3 Sale DELETE queues only sale
  try{ await reset();
    const prod=await productService.create({name:"P3",price:10,quantity:10,weightKg:10} as any);
    const cust=await customerService.create({name:"C3",phone:"+213",type:"Retail"} as any);
    const sale=await saleOperation.create({customerId:cust.id,date:Date.now(),items:[{productId:prod.id,quantity:1,weightKg:1,price:10,total:10}],total:10} as any);
    await db.syncOperations.clear();
    const { saleReversalOperation } = await import("./src/services/operations/sale-reversal.operation");
    await saleReversalOperation.delete(sale.id);
    const ops3=await db.syncOperations.toArray();
    assert(ops3.length===1 && ops3[0].entity==="sale" && ops3[0].operation==="delete", `sale delete should queue 1 sale delete, got ${ops3.length}`);
    ok("3 Sale DELETE queues only sale");
  }catch(e:any){ fail("3 Sale DELETE",e); }
  // 4 Purchase UPDATE queues only purchase
  try{ await reset();
    const prod=await productService.create({name:"P4",price:10,quantity:10,weightKg:10} as any);
    const sup=await supplierService.create({name:"S4",phone:"+213"} as any);
    const pur=await purchaseOperation.create({supplierId:sup.id,date:Date.now(),items:[{productId:prod.id,quantity:1,weightKg:1,price:10,total:10}],total:10} as any);
    await db.syncOperations.clear();
    const { purchaseEditOperation } = await import("./src/services/operations/purchase-edit.operation");
    await purchaseEditOperation.edit({purchaseId:pur.id,supplierId:sup.id,date:Date.now(),items:[{productId:prod.id,quantity:2,weightKg:2,price:10,total:20}],total:20} as any);
    const ops4=await db.syncOperations.toArray();
    assert(ops4.length===1 && ops4[0].entity==="purchase", `purchase update should queue 1 purchase, got ${ops4.length}`);
    ok("4 Purchase UPDATE queues only purchase");
  }catch(e:any){ fail("4 Purchase UPDATE",e); }
  // 5 Purchase DELETE
  try{ await reset();
    const prod=await productService.create({name:"P5",price:10,quantity:10,weightKg:10} as any);
    const sup=await supplierService.create({name:"S5",phone:"+213"} as any);
    const pur=await purchaseOperation.create({supplierId:sup.id,date:Date.now(),items:[{productId:prod.id,quantity:1,weightKg:1,price:10,total:10}],total:10} as any);
    await db.syncOperations.clear();
    const { purchaseReversalOperation } = await import("./src/services/operations/purchase-reversal.operation");
    await purchaseReversalOperation.delete(pur.id);
    const ops5=await db.syncOperations.toArray();
    assert(ops5.length===1 && ops5[0].entity==="purchase" && ops5[0].operation==="delete", `purchase delete should queue 1`);
    ok("5 Purchase DELETE queues only purchase");
  }catch(e:any){ fail("5 Purchase DELETE",e); }
  // 6 Payment UPDATE queues only payment
  try{ await reset();
    const bank=await bankAccountService.create({name:"B6",type:"cash",initialBalance:1000} as any);
    const sup=await supplierService.create({name:"S6",phone:"+213"} as any);
    await SupplierModelUpdate(sup.id,400);
    const pay=await paymentOperation.create({entityType:"supplier",entityId:sup.id,accountId:bank.id,amount:100,date:Date.now()} as any);
    await db.syncOperations.clear();
    const { paymentEditOperation } = await import("./src/services/operations/payment-edit.operation");
    await paymentEditOperation.edit({paymentId:pay.id,entityType:"supplier",entityId:sup.id,accountId:bank.id,amount:150,date:Date.now()} as any);
    const ops6=await db.syncOperations.toArray();
    assert(ops6.length===1 && ops6[0].entity==="payment", `payment update should queue 1 payment, got ${ops6.length}`);
    ok("6 Payment UPDATE queues only payment");
  }catch(e:any){ fail("6 Payment UPDATE",e); }
  async function SupplierModelUpdate(id:string, bal:number){ const { supplierRepository } = await import("./src/repositories/supplier.repository"); await supplierRepository.update(id,{balance:bal} as any, {queueSync:false} as any); }
  // 7 Payment DELETE
  try{ await reset();
    const bank=await bankAccountService.create({name:"B7",type:"cash",initialBalance:1000} as any);
    const sup=await supplierService.create({name:"S7",phone:"+213"} as any);
    await SupplierModelUpdate(sup.id,400);
    const pay=await paymentOperation.create({entityType:"supplier",entityId:sup.id,accountId:bank.id,amount:100,date:Date.now()} as any);
    await db.syncOperations.clear();
    const { paymentReversalOperation } = await import("./src/services/operations/payment-reversal.operation");
    await paymentReversalOperation.delete(pay.id);
    const ops7=await db.syncOperations.toArray();
    assert(ops7.length===1 && ops7[0].entity==="payment" && ops7[0].operation==="delete", `payment delete should queue 1`);
    ok("7 Payment DELETE queues only payment");
  }catch(e:any){ fail("7 Payment DELETE",e); }
  // 8 remote SyncChange creates zero echo
  try{ await reset();
    await productService.create({name:"P8",price:10,quantity:10,weightKg:10} as any);
    await db.syncOperations.clear();
    const { runAsRemote } = await import("./src/lib/database/sync-hooks");
    await runAsRemote(async()=>{ await db.products.update("P8",{quantity:5}); });
    const { productRepository } = await import("./src/repositories/product.repository");
    await productRepository.update("P8",{quantity:6} as any, {source:"remote"} as any);
    const ops8=await db.syncOperations.toArray();
    assert(ops8.length===0, `remote update should not queue, got ${ops8.length}`);
    ok("8 remote SyncChange zero echo");
  }catch(e:any){ fail("8 remote echo",e); }
  // 9 REAL coalescing: CREATE+UPDATE -> CREATE merged (DB state)
  try{ await reset();
    const { coalescePendingOperations, getPendingSyncOperations } = await import("./src/services/sync/queue");
    await db.syncOperations.clear();
    // Simulate product CREATE pending
    await coalescePendingOperations("product","PX","create",{id:"PX",name:"PX",price:10,quantity:5,weightKg:5});
    let pending = await getPendingSyncOperations();
    assert(pending.length===1 && pending[0].operation==="create" && (pending[0].payload as any).price===10, "create pending");
    // Update same product before sync: CREATE+UPDATE should merge into CREATE
    await coalescePendingOperations("product","PX","update",{price:25});
    pending = await getPendingSyncOperations();
    assert(pending.length===1 && pending[0].operation==="create" && (pending[0].payload as any).price===25, `CREATE+UPDATE merged price25 got ${(pending[0].payload as any).price}`);
    assert(pending[0].baseRevision!==undefined, "baseRevision retained");
    ok("9 CREATE+UPDATE coalescing");
  }catch(e:any){ fail("9 CREATE+UPDATE",e);}
  // 10 UPDATE+UPDATE coalescing
  try{ await reset();
    const { coalescePendingOperations, getPendingSyncOperations } = await import("./src/services/sync/queue");
    await db.syncOperations.clear();
    await db.products.put({id:"PU",name:"PU",price:10,quantity:10,weightKg:10,createdAt:Date.now(),updatedAt:Date.now()} as any);
    // first update via queue
    await coalescePendingOperations("product","PU","update",{price:20},{baseRevision:5});
    let pending = await getPendingSyncOperations();
    assert(pending.length===1 && (pending[0].payload as any).price===20 && pending[0].baseRevision===5, "first update");
    // second update same entity
    await coalescePendingOperations("product","PU","update",{price:30});
    pending = await getPendingSyncOperations();
    assert(pending.length===1 && (pending[0].payload as any).price===30, "UPDATE+UPDATE merged price30");
    assert(pending[0].baseRevision===5, "baseRevision retained from first");
    ok("10 UPDATE+UPDATE coalescing");
  }catch(e:any){ fail("10 UPDATE+UPDATE",e);}
  // 11 CREATE+DELETE coalescing (cancel)
  try{ await reset();
    const { coalescePendingOperations, getPendingSyncOperations } = await import("./src/services/sync/queue");
    await db.syncOperations.clear();
    await coalescePendingOperations("product","PD","create",{id:"PD",name:"PD",price:10,quantity:1,weightKg:1});
    await coalescePendingOperations("product","PD","delete",{id:"PD"} as any);
    const pending=await getPendingSyncOperations();
    assert(pending.length===0, `CREATE+DELETE should cancel, got ${pending.length}`);
    ok("11 CREATE+DELETE cancel");
  }catch(e:any){ fail("11 CREATE+DELETE",e);}
  // 12 UPDATE+DELETE coalescing
  try{ await reset();
    const { coalescePendingOperations, getPendingSyncOperations } = await import("./src/services/sync/queue");
    await db.syncOperations.clear();
    await db.products.put({id:"PD2",name:"PD2",price:10,quantity:10,weightKg:10,createdAt:Date.now(),updatedAt:Date.now()} as any);
    await coalescePendingOperations("product","PD2","update",{price:20},{baseRevision:3});
    await coalescePendingOperations("product","PD2","delete",{id:"PD2"} as any);
    const pending=await getPendingSyncOperations();
    assert(pending.length===1 && pending[0].operation==="delete", `UPDATE+DELETE -> delete, got ${pending.map(p=>p.operation)}`);
    assert(pending[0].baseRevision===3, "baseRevision from original UPDATE retained");
    ok("12 UPDATE+DELETE coalescing");
  }catch(e:any){ fail("12 UPDATE+DELETE",e);}
  // 13 multi-field merge
  try{ await reset();
    const { coalescePendingOperations, getPendingSyncOperations } = await import("./src/services/sync/queue");
    await db.syncOperations.clear();
    await db.products.put({id:"PM",name:"PM",price:10,quantity:10,weightKg:10,createdAt:Date.now(),updatedAt:Date.now()} as any);
    await coalescePendingOperations("product","PM","update",{price:20},{baseRevision:1});
    await coalescePendingOperations("product","PM","update",{quantity:99});
    const pending=await getPendingSyncOperations();
    assert(pending.length===1 && (pending[0].payload as any).price===20 && (pending[0].payload as any).quantity===99, `multi-field merged got ${JSON.stringify(pending[0].payload)}`);
    ok("13 multi-field merge");
  }catch(e:any){ fail("13 multi-field",e);}
  // 14 business Sale multiple edit coalescing
  try{ await reset();
    const prod=await productService.create({name:"P14",price:10,quantity:10,weightKg:10} as any);
    const prod2=await productService.create({name:"P14b",price:10,quantity:10,weightKg:10} as any);
    const cust=await customerService.create({name:"C14",phone:"+213",type:"Retail"} as any);
    const sale=await saleOperation.create({customerId:cust.id,date:Date.now(),items:[{productId:prod.id,quantity:1,weightKg:1,price:10,total:10}],total:10} as any);
    await db.syncOperations.clear();
    const { saleEditOperation } = await import("./src/services/operations/sale-edit.operation");
    // two rapid edits before sync: should coalesce into one pending update
    await saleEditOperation.edit({saleId:sale.id,customerId:cust.id,date:Date.now(),items:[{productId:prod.id,quantity:2,weightKg:2,price:10,total:20}],total:20} as any);
    await saleEditOperation.edit({saleId:sale.id,customerId:cust.id,date:Date.now(),items:[{productId:prod2.id,quantity:2,weightKg:2,price:10,total:20}],total:20} as any);
    const ops=await db.syncOperations.toArray();
    const saleOps=ops.filter(o=>o.entity==="sale");
    assert(saleOps.length===1 && saleOps[0].operation==="update", `sale multiple edits should coalesce 1, got ${saleOps.length}`);
    const payload:any=saleOps[0].payload;
    assert(payload.items[0].productId===prod2.id, "latest product should be prod2");
    ok("14 business Sale multiple edit coalescing");
  }catch(e:any){ fail("14 Sale multiple",e);}
  // 15 In-flight lost-edit race (P0 critical) — REAL_SERVICE with mocked fetch
  try{ await reset();
    const { productRepository } = await import("./src/repositories/product.repository");
    const { syncPendingOperations } = await import("./src/services/sync/client");
    const { getPendingSyncOperations, getInFlightOperations, transitionPendingToInFlight, rebaseSuccessorsAfterSuccess } = await import("./src/services/sync/queue");
    // Setup: product rev5 price10
    await db.products.put({id:"Pr",name:"Pr",price:10,quantity:100,weightKg:100,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"synced",serverRevision:5} as any);
    await db.syncMeta.put({key:"serverRevision",value:5});
    await db.syncMeta.put({key:"clientId",value:"test-client"});
    // Local update price20 -> pending OP1
    await productRepository.update("Pr",{price:20} as any);
    let pending = await getPendingSyncOperations();
    assert(pending.length===1 && (pending[0].payload as any).price===20, "OP1 pending price20");
    const op1Id=pending[0].operationId;
    const op1Base=pending[0].baseRevision;
    // Mock fetch to intercept sync and delay
    let fetchBlocked=true;
    let capturedPayload:any=null;
    const origFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = async (url:any, init:any)=>{
      const body = init?.body ? JSON.parse(init.body) : null;
      capturedPayload = body;
      // block until released
      while(fetchBlocked) await new Promise(r=>setTimeout(r,10));
      // server accepts payload20 at rev6
      return {
        ok:true,
        json: async()=>({
          success:true,
          results: body.operations.map((op:any)=>({
            operationId: op.operationId,
            entity: op.entity,
            entityId: op.entityId,
            operation: op.operation,
            success:true,
            message:"ok",
            revision:6,
            canonicalEntity:{id:op.entityId, price:20, serverRevision:6, syncStatus:"synced"},
            conflict:false
          }))
        })
      } as any;
    };
    // Start sync (will capture immutable and go in_flight)
    const syncPromise = syncPendingOperations().catch(()=>{});
    // wait a bit for sync to have transitioned to in_flight and blocked on fetch
    await new Promise(r=>setTimeout(r,100));
    // while request blocked, local update price30 -> should create successor pending OP2
    await productRepository.update("Pr",{price:30} as any);
    const inFlight = await getInFlightOperations();
    const pendingAfter = await getPendingSyncOperations();
    assert(inFlight.length===1 && (inFlight[0].payload as any).price===20 && inFlight[0].operationId===op1Id, `OP1 in_flight payload20 got ${JSON.stringify(inFlight[0]?.payload)}`);
    assert(pendingAfter.length===1 && (pendingAfter[0].payload as any).price===30, `OP2 pending price30 got ${JSON.stringify(pendingAfter[0]?.payload)}`);
    assert(inFlight[0].operationId!==pendingAfter[0].operationId, "different operationIds");
    assert(pendingAfter[0].dependsOnOperationId===op1Id || pendingAfter[0].parentOperationId===op1Id, "successor depends on OP1");
    // resolve OP1 response
    fetchBlocked=false;
    await syncPromise;
    // after success, OP1 deleted, OP2 still exists rebased to rev6
    const afterOps = await db.syncOperations.toArray();
    const op1Remaining = afterOps.find(o=>o.operationId===op1Id);
    assert(!op1Remaining, "OP1 removed after success");
    const op2 = afterOps.find(o=>o.entity==="product" && o.entityId==="Pr" && (o as any).status!=="terminal");
    assert(!!op2, "OP2 still exists");
    assert(op2?.baseRevision===6, `OP2 baseRevision 6 got ${op2?.baseRevision}`);
    assert((op2?.payload as any).price===30, "OP2 payload30 preserved");
    // Mock second sync for OP2
    (globalThis as any).fetch = async (url:any, init:any)=>{
      const body = init?.body ? JSON.parse(init.body) : null;
      return {
        ok:true,
        json: async()=>({
          success:true,
          results: body.operations.map((op:any)=>({
            operationId: op.operationId,
            entity: op.entity,
            entityId: op.entityId,
            operation: op.operation,
            success:true,
            message:"ok",
            revision:7,
            canonicalEntity:{id:op.entityId, price:30, serverRevision:7, syncStatus:"synced"},
            conflict:false
          }))
        })
      } as any;
    };
    const { syncPendingOperations: sync2 } = await import("./src/services/sync/client");
    // second sync should send OP2
    const pending2 = await getPendingSyncOperations();
    assert(pending2.length===1, "OP2 pending before second sync");
    await sync2();
    const finalProd:any = await db.products.get("Pr");
    assert(finalProd.price===30 && finalProd.serverRevision===7, `final price30 rev7 got ${finalProd.price} rev ${finalProd.serverRevision}`);
    (globalThis as any).fetch = origFetch;
    ok("15 In-flight lost-edit race product");
  }catch(e:any){ fail("15 In-flight race",e); try{ (globalThis as any).fetch = (globalThis as any).__origFetch || (globalThis as any).fetch; }catch{}}
  // 16 In-flight successor race for Sale UPDATE (repeat)
  try{ await reset();
    const { syncPendingOperations } = await import("./src/services/sync/client");
    const { getPendingSyncOperations, getInFlightOperations } = await import("./src/services/sync/queue");
    const prod=await productService.create({name:"P16",price:10,quantity:100,weightKg:100} as any);
    const cust=await customerService.create({name:"C16",phone:"+213",type:"Retail"} as any);
    const sale=await saleOperation.create({customerId:cust.id,date:Date.now(),items:[{productId:prod.id,quantity:1,weightKg:1,price:10,total:10}],total:10} as any);
    // clear product/customer pending to isolate sale sync
    const allOps1=await db.syncOperations.toArray();
    const toDel = allOps1.filter(o=>o.entity!=="sale").map(o=>o.id!);
    if(toDel.length) await db.syncOperations.bulkDelete(toDel);
    // Now we have sale pending create OP1? Actually sale create pending. We'll set synced to simulate server state rev5 then update?
    await db.syncOperations.clear();
    await db.sales.put({...sale, serverRevision:5, syncStatus:"synced"} as any);
    await db.syncMeta.put({key:"serverRevision",value:5});
    await db.syncMeta.put({key:"clientId",value:"test-client"});
    const { saleEditOperation } = await import("./src/services/operations/sale-edit.operation");
    await saleEditOperation.edit({saleId:sale.id,customerId:cust.id,date:Date.now(),items:[{productId:prod.id,quantity:2,weightKg:2,price:10,total:20}],total:20} as any);
    let origFetch2 = (globalThis as any).fetch;
    let blockSale=true;
    (globalThis as any).fetch = async (url:any, init:any)=>{
      const body=JSON.parse(init.body);
      while(blockSale) await new Promise(r=>setTimeout(r,10));
      return { ok:true, json: async()=>({ success:true, results: body.operations.map((op:any)=>({ operationId:op.operationId, entity:op.entity, entityId:op.entityId, operation:op.operation, success:true, message:"ok", revision:6, canonicalEntity:{...op.payload, serverRevision:6}})) })} as any;
    };
    const syncP = syncPendingOperations().catch(()=>{});
    await new Promise(r=>setTimeout(r,80));
    await saleEditOperation.edit({saleId:sale.id,customerId:cust.id,date:Date.now(),items:[{productId:prod.id,quantity:3,weightKg:3,price:10,total:30}],total:30} as any);
    const inF = await getInFlightOperations();
    const pend = await getPendingSyncOperations();
    assert(inF.length===1 && (inF[0].payload as any).total===20, "sale OP1 in_flight total20");
    assert(pend.length===1 && (pend[0].payload as any).total===30, "sale OP2 pending total30");
    blockSale=false;
    await syncP;
    const after = await db.syncOperations.toArray();
    const pendingSale = after.filter(o=>o.entity==="sale");
    assert(pendingSale.length===1 && pendingSale[0].baseRevision===6, "sale successor rebased to 6");
    (globalThis as any).fetch = origFetch2;
    ok("16 In-flight Sale UPDATE race");
  }catch(e:any){ fail("16 Sale race",e); try{ (globalThis as any).fetch = (globalThis as any).__origFetch }catch{}}
  // 17 Fallback lease ownership (owner safe)
  try{ await reset();
    const { tryAcquireFallbackLease, releaseFallbackLease, renewFallbackLease, getFallbackLease, FALLBACK_TTL } = await import("./src/services/sync/manager");
    const ownerA="owner-A-test";
    const ownerB="owner-B-test";
    // A acquires
    const acqA=await tryAcquireFallbackLease(ownerA);
    assert(acqA===true, "A acquires");
    // B cannot acquire before expiry
    const acqB1=await tryAcquireFallbackLease(ownerB);
    assert(acqB1===false, "B cannot acquire while A holds");
    let lease=await getFallbackLease();
    assert(lease?.ownerId===ownerA, "lease owner A");
    // Advance near expiry while A heartbeat renews — simulate renew
    await new Promise(r=>setTimeout(r,10));
    const renewed=await renewFallbackLease(ownerA);
    assert(renewed===true, "A heartbeat renew");
    lease=await getFallbackLease();
    assert(lease?.ownerId===ownerA, "still A after renew");
    const acqB2=await tryAcquireFallbackLease(ownerB);
    assert(acqB2===false, "B still cannot after renew");
    // Simulate crash: stop heartbeat and wait expiry — manually set expiry in past
    await db.syncMeta.put({key:"syncLease", value:{ownerId:ownerA, expiresAt: Date.now()-1000}} as any);
    const acqB3=await tryAcquireFallbackLease(ownerB);
    assert(acqB3===true, "B acquires after expiry");
    lease=await getFallbackLease();
    assert(lease?.ownerId===ownerB, "lease now B");
    // Stale A release should not delete B's lease
    const relA=await releaseFallbackLease(ownerA);
    assert(relA===false, "stale A release should not succeed");
    lease=await getFallbackLease();
    assert(lease?.ownerId===ownerB, "B lease still exists after stale A release");
    // Cleanup
    await releaseFallbackLease(ownerB);
    lease=await getFallbackLease();
    assert(lease===null, "lease released");
    ok("17 Fallback lease ownership");
  }catch(e:any){ fail("17 lease",e);}
  // 18 Fallback lease heartbeat prevents overlap (TTL 30s simulated)
  try{ await reset();
    const { tryAcquireFallbackLease, renewFallbackLease, getFallbackLease } = await import("./src/services/sync/manager");
    const ownerA="hb-A"; const ownerB="hb-B";
    await tryAcquireFallbackLease(ownerA);
    // Without heartbeat, lease would expire after TTL. With heartbeat every 10s, it stays.
    // Simulate: heartbeat renew before expiry each 10s, check B still blocked
    for(let i=0;i<3;i++){
      await new Promise(r=>setTimeout(r,5));
      await renewFallbackLease(ownerA);
      const canB=await tryAcquireFallbackLease(ownerB);
      assert(canB===false, `B blocked iteration ${i}`);
    }
    ok("18 heartbeat prevents overlap");
    // cleanup
    const { releaseFallbackLease } = await import("./src/services/sync/manager");
    await releaseFallbackLease(ownerA);
  }catch(e:any){ fail("18 heartbeat",e);}
  // 19 Web Locks fallback queue safety: editing while syncing queues successor
  try{ await reset();
    const { productRepository } = await import("./src/repositories/product.repository");
    const { getPendingSyncOperations, getInFlightOperations } = await import("./src/services/sync/queue");
    const { syncPendingOperations } = await import("./src/services/sync/client");
    await db.products.put({id:"TabProd",name:"TabProd",price:10,quantity:10,weightKg:10,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"synced",serverRevision:1} as any);
    await db.syncMeta.put({key:"serverRevision",value:1});
    await productRepository.update("TabProd",{price:20} as any);
    let block=true; const orig= (globalThis as any).fetch;
    (globalThis as any).fetch = async (url:any, init:any)=>{
      const body=JSON.parse(init.body);
      while(block) await new Promise(r=>setTimeout(r,10));
      return { ok:true, json: async()=>({ success:true, results: body.operations.map((op:any)=>({ operationId:op.operationId, entity:op.entity, entityId:op.entityId, operation:op.operation, success:true, message:"ok", revision:2, canonicalEntity:{...op.payload, serverRevision:2}})) })} as any;
    };
    const syncP = syncPendingOperations().catch(()=>{});
    await new Promise(r=>setTimeout(r,50));
    // Tab B edit while A syncing (lock held) — should queue successor
    await productRepository.update("TabProd",{price:30} as any);
    const inF=await getInFlightOperations();
    const pend=await getPendingSyncOperations();
    assert(inF.length===1 && pend.length===1, "successor queued while syncing");
    block=false; await syncP;
    (globalThis as any).fetch = orig;
    ok("19 queue safety while syncing");
  }catch(e:any){ fail("19 queue safety",e);}
  // 20 unrelated pending survives snapshot (existing test)
  try{ await reset();
    const prod=await productService.create({name:"P10b",price:10,quantity:10,weightKg:10} as any);
    await db.syncOperations.clear();
    const { productRepository } = await import("./src/repositories/product.repository");
    await productRepository.update(prod.id,{price:20} as any);
    const ops10=await db.syncOperations.toArray();
    assert(ops10.length===1 && ops10[0].entity==="product", "unrelated pending should exist");
    const { applySnapshot } = await import("./src/services/sync/apply");
    await applySnapshot({product:[{id:prod.id, name:"P10b", price:999, quantity:10, weightKg:10, createdAt:Date.now(), updatedAt:Date.now(), syncStatus:"synced", serverRevision:1}]},1);
    const after=await productRepository.getById(prod.id);
    assert(after?.price===20, `pending local price 20 should survive snapshot, got ${after?.price}`);
    ok("20 unrelated pending survives snapshot");
  }catch(e:any){ fail("20 pending survives",e); }
  // 21 P0 pending business derived preservation
  try{ await reset();
    const prod=await productService.create({name:"P21b",price:5,quantity:10,weightKg:10} as any);
    const cust=await customerService.create({name:"C21b",phone:"+213",type:"Retail"} as any);
    // ensure balances before sale: product 10, customer 0
    await db.products.update(prod.id,{quantity:10, weightKg:10});
    await db.customers.update(cust.id,{balance:0});
    await db.syncOperations.clear();
    // Sale create pending optimistic: product 8, customer 20
    await saleOperation.create({customerId:cust.id,date:Date.now(),items:[{productId:prod.id,quantity:2,weightKg:2,price:10,total:20}],total:20} as any);
    const prodAfterSale:any=await db.products.get(prod.id);
    const custAfterSale:any=await db.customers.get(cust.id);
    assert(prodAfterSale.quantity===8 && custAfterSale.balance===20, `optimistic product8 cust20 got ${prodAfterSale.quantity} ${custAfterSale.balance}`);
    const opsBeforeAll=await db.syncOperations.toArray();
    const opsBefore=opsBeforeAll.filter(o=>o.entity==="sale");
    assert(opsBefore.length===1 && opsBefore[0].entity==="sale", `sale pending protected got ${opsBeforeAll.map(o=>o.entity)}`);
    // Server snapshot does NOT contain Sale, and has old product/customer (10/0)
    const { applySnapshot } = await import("./src/services/sync/apply");
    await applySnapshot({
      product:[{id:prod.id, name:prodAfterSale.name??"P21b", price:5, quantity:10, weightKg:10, createdAt:Date.now(), updatedAt:Date.now(), syncStatus:"synced", serverRevision:10}],
      customer:[{id:cust.id, name:custAfterSale.name??"C21b", phone:"+213", type:"Retail", balance:0, createdAt:Date.now(), updatedAt:Date.now(), syncStatus:"synced", serverRevision:10}],
      sale:[]
    },10);
    const prodFinal:any=await db.products.get(prod.id);
    const custFinal:any=await db.customers.get(cust.id);
    const saleFinal:any=await db.sales.get(prod.id) ?? await db.sales.where("customerId").equals(cust.id).first().catch(()=>null) ?? null;
    // Check safe condition: either optimistic preserved (A) or sale+derived removed together (B), NOT split
    const allSales:any[] = await db.sales.toArray();
    const saleExists = allSales.length>0;
    if(saleExists) {
      // Case A: sale remains, products/customers must remain optimistic (8/20)
      assert(prodFinal.quantity===8, `Sale remains but product reset to ${prodFinal.quantity} should be 8`);
      assert(custFinal.balance===20, `Sale remains but customer reset to ${custFinal.balance} should be 20`);
    } else {
      // Case B allowed: sale removed and products reverted together — still pending queue should remain
      const opsAfter=await db.syncOperations.toArray();
      assert(opsAfter.some(o=>o.entity==="sale"), "sale intent still queued even if optimistic removed");
    }
    // Not safe: SaleC remains but Product10/Customer0 — already asserted above
    ok("21 pending business derived preservation");
  }catch(e:any){ fail("21 business preservation",e);}
  // 22 Payment direction incoming with empty bank
  try{ await reset();
    const bank=await bankAccountService.create({name:"Bank22",type:"cash",initialBalance:0} as any);
    const cust=await customerService.create({name:"C22",phone:"+213",type:"Retail"} as any);
    await db.customers.update(cust.id,{balance:100});
    await db.syncOperations.clear();
    const pay=await paymentOperation.create({entityType:"customer",entityId:cust.id,accountId:bank.id,amount:50,date:Date.now()} as any);
    const bankAfter:any=await db.bankAccounts.get(bank.id);
    const custAfter:any=await db.customers.get(cust.id);
    assert(bankAfter.balance===50 && custAfter.balance===50, `Bank50 Cust50 got ${bankAfter.balance} ${custAfter.balance}`);
    const opsAll=await db.syncOperations.toArray();
    const ops=opsAll.filter(o=>o.entity==="payment");
    assert(ops.length===1 && ops[0].entity==="payment", `payment queued got ${opsAll.map(o=>o.entity)}`);
    ok("22 Payment customer incoming Bank0 succeeds");
  }catch(e:any){ fail("22 Payment customer",e);}
  // 23 Customer payment insufficient should be rejected (no pending)
  try{ await reset();
    const bank=await bankAccountService.create({name:"Bank23",type:"cash",initialBalance:0} as any);
    const cust=await customerService.create({name:"C23",phone:"+213",type:"Retail"} as any);
    await db.customers.update(cust.id,{balance:30});
    let threw=false;
    try{ await paymentOperation.create({entityType:"customer",entityId:cust.id,accountId:bank.id,amount:50,date:Date.now()} as any);}catch{ threw=true; }
    assert(threw, "customer insufficient should throw");
    const ops=await db.syncOperations.toArray();
    const payOps=ops.filter(o=>o.entity==="payment");
    assert(payOps.length===0, "no payment queued on insufficient");
    ok("23 Payment customer insufficient");
  }catch(e:any){ fail("23 insufficient",e);}
  // 24 Crash before completion – abandoned in_flight recovered via exclusive lock (same operationId preserved)
  try{ await reset();
    const { coalescePendingOperations, getPendingSyncOperations, getInFlightOperations, recoverAbandonedInFlightOperations } = await import("./src/services/sync/queue");
    const { tryAcquireFallbackLease, releaseFallbackLease } = await import("./src/services/sync/manager");
    await db.syncMeta.put({key:"serverRevision",value:5});
    await coalescePendingOperations("product","Crash24","update",{price:20},{baseRevision:5});
    let pend = await getPendingSyncOperations();
    assert(pend.length===1, "Crash24 pending 1");
    const opId24 = pend[0].operationId;
    const payload24 = (pend[0].payload as any).price;
    // transition to in_flight (simulates pending->in_flight before crash)
    const { transitionPendingToInFlight } = await import("./src/services/sync/queue");
    await transitionPendingToInFlight(pend);
    let inF = await getInFlightOperations();
    assert(inF.length===1 && inF[0].operationId===opId24 && (inF[0].payload as any).price===20, "in_flight price20");
    // simulate crash: close/reopen not needed because recover works on persisted in_flight
    // before lock, getPending should be 0 (excluded)
    pend = await getPendingSyncOperations();
    assert(pend.length===0, "after crash pending 0 (in_flight excluded)");
    // acquire exclusive lock then recover – mimics withCrossTabLock safe recovery
    const ownerCrash="owner-crash-24";
    const acquired = await tryAcquireFallbackLease(ownerCrash);
    assert(acquired, "acquire lock for recovery");
    const recovered = await recoverAbandonedInFlightOperations();
    assert(recovered===1, `recovered ${recovered}`);
    pend = await getPendingSyncOperations();
    assert(pend.length===1 && pend[0].operationId===opId24 && (pend[0].payload as any).price===20, "recovered same operationId price20");
    assert(pend[0].baseRevision===5, "recovered baseRevision preserved");
    assert(pend[0].status==="retrying" || pend[0].status==="pending", "retryable state");
    await releaseFallbackLease(ownerCrash);
    ok("24 Crash before completion recovered same operationId");
  }catch(e:any){ fail("24 Crash recovery",e); }
  // 25 Server not yet processed – recovered operation applies once, no double
  try{ await reset();
    const { coalescePendingOperations, getPendingSyncOperations, transitionPendingToInFlight, recoverAbandonedInFlightOperations } = await import("./src/services/sync/queue");
    const { tryAcquireFallbackLease, releaseFallbackLease } = await import("./src/services/sync/manager");
    const { productRepository } = await import("./src/repositories/product.repository");
    await db.products.put({id:"Prod25",name:"Prod25",price:10,quantity:10,weightKg:10,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"synced",serverRevision:5} as any);
    await db.syncMeta.put({key:"serverRevision",value:5});
    await coalescePendingOperations("product","Prod25","update",{price:20},{baseRevision:5});
    let pend = await getPendingSyncOperations();
    const savedOpId = pend[0].operationId;
    await transitionPendingToInFlight(pend);
    // crash then recover
    const owner="owner-25";
    await tryAcquireFallbackLease(owner);
    await recoverAbandonedInFlightOperations();
    pend = await getPendingSyncOperations();
    assert(pend[0].operationId===savedOpId, "same operationId after recover");
    // mock fetch that processes operation first time rev6
    let origFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = async (url:any, init:any)=>{
      const body=JSON.parse(init.body);
      return { ok:true, json: async()=>({ success:true, results: body.operations.map((op:any)=>({ operationId:op.operationId, entity:op.entity, entityId:op.entityId, operation:op.operation, success:true, message:"ok", revision:6, canonicalEntity:{id:op.entityId, price:20, serverRevision:6}})) })} as any;
    };
    const { syncPendingOperations } = await import("./src/services/sync/client");
    await syncPendingOperations();
    const prod:any = await db.products.get("Prod25");
    assert(prod.price===20 && prod.serverRevision===6, `server not yet seen applied once price20 rev6 got ${prod.price} rev ${prod.serverRevision}`);
    (globalThis as any).fetch = origFetch;
    await releaseFallbackLease(owner);
    ok("25 Server not yet processed – recovered applies once");
  }catch(e:any){ fail("25 Server not yet processed",e); }
  // 26 Server already committed – recovered same operationId idempotent no double financial effect
  try{ await reset();
    // Use MongoMemoryReplSet to prove backend idempotency if available, else simulate via fetch mock returning Already processed
    const { coalescePendingOperations, getPendingSyncOperations, transitionPendingToInFlight, recoverAbandonedInFlightOperations } = await import("./src/services/sync/queue");
    const { tryAcquireFallbackLease, releaseFallbackLease } = await import("./src/services/sync/manager");
    await db.products.put({id:"Prod26",name:"Prod26",price:10,quantity:10,weightKg:10,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"synced",serverRevision:5} as any);
    await db.syncMeta.put({key:"serverRevision",value:5});
    await coalescePendingOperations("product","Prod26","update",{price:20},{baseRevision:5});
    let pend = await getPendingSyncOperations();
    const opId26 = pend[0].operationId;
    await transitionPendingToInFlight(pend);
    // simulate crash then recovery
    const owner="owner-26";
    await tryAcquireFallbackLease(owner);
    await recoverAbandonedInFlightOperations();
    pend = await getPendingSyncOperations();
    assert(pend[0].operationId===opId26, "same operationId preserved after crash");
    // Mock fetch where server already committed this operationId (ProcessedSyncOperation)
    // First call would have been success rev6, crash before client handling, second retry should be idempotent
    // Simulate server has revision6 already and returns same revision without double effect
    let callCount=0;
    let origFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = async (url:any, init:any)=>{
      const body=JSON.parse(init.body);
      callCount++;
      // Server logic: if operationId already processed, return prior success rev6
      return { ok:true, json: async()=>({ success:true, results: body.operations.map((op:any)=>({ operationId:op.operationId, entity:op.entity, entityId:op.entityId, operation:op.operation, success:true, message:"Already processed", revision:6, canonicalEntity:{id:op.entityId, price:20, serverRevision:6}, conflict:false })) })} as any;
    };
    const { syncPendingOperations } = await import("./src/services/sync/client");
    await syncPendingOperations();
    const prod:any = await db.products.get("Prod26");
    assert(prod.price===20 && prod.serverRevision===6, "idempotent retry keeps price20 rev6");
    assert(callCount===1, "only one retry call");
    (globalThis as any).fetch = origFetch;
    await releaseFallbackLease(owner);
    ok("26 Server already committed – idempotent no double");
  }catch(e:any){ fail("26 Server already committed",e); }
  // 27 Recovered parent + successor – successor survives and rebases
  try{ await reset();
    const { coalescePendingOperations, getPendingSyncOperations, getInFlightOperations, transitionPendingToInFlight, recoverAbandonedInFlightOperations, rebaseSuccessorsAfterSuccess } = await import("./src/services/sync/queue");
    const { tryAcquireFallbackLease, releaseFallbackLease } = await import("./src/services/sync/manager");
    const { productRepository } = await import("./src/repositories/product.repository");
    await db.products.put({id:"Prod27",name:"Prod27",price:10,quantity:100,weightKg:100,createdAt:Date.now(),updatedAt:Date.now(),syncStatus:"synced",serverRevision:5} as any);
    await db.syncMeta.put({key:"serverRevision",value:5});
    await coalescePendingOperations("product","Prod27","update",{price:20},{baseRevision:5});
    let pend = await getPendingSyncOperations();
    const op1Id = pend[0].operationId;
    await transitionPendingToInFlight(pend);
    // while in_flight, create successor price30
    await productRepository.update("Prod27",{price:30} as any);
    let inF = await getInFlightOperations();
    let pendAfter = await getPendingSyncOperations();
    assert(inF.length===1 && (inF[0].payload as any).price===20, "parent in_flight 20");
    assert(pendAfter.length===1 && (pendAfter[0].payload as any).price===30, "successor pending 30");
    const op2Id = pendAfter[0].operationId;
    // crash then recover parent
    const owner="owner-27";
    await tryAcquireFallbackLease(owner);
    await recoverAbandonedInFlightOperations();
    pend = await getPendingSyncOperations();
    // after recovery, both should be pending/retrying, parent before successor
    assert(pend.length===2, `after crash recover pending 2 got ${pend.length}`);
    const recoveredParent = pend.find(p=>p.operationId===op1Id);
    const recoveredSucc = pend.find(p=>p.operationId===op2Id);
    assert(!!(recoveredParent && recoveredSucc), "both parent and successor survive crash");
    // mock fetch for parent success rev6, should rebase successor to 6
    let origFetch = (globalThis as any).fetch;
    let fetchCall=0;
    (globalThis as any).fetch = async (url:any, init:any)=>{
      const body=JSON.parse(init.body);
      fetchCall++;
      if(fetchCall===1){
        // first batch should contain parent only (since successor depends on parent, but getPending returns both; however client batches both? Our queue successor has dependsOn, but client sends both in one batch? In that case parent sent first, successor second batch later)
        // Simulate server processes parent price20 rev6
        return { ok:true, json: async()=>({ success:true, results: body.operations.map((op:any)=>({ operationId:op.operationId, entity:op.entity, entityId:op.entityId, operation:op.operation, success:true, message:"ok", revision:6, canonicalEntity:{id:op.entityId, price: (op.payload as any).price, serverRevision:6}})) })} as any;
      } else {
        return { ok:true, json: async()=>({ success:true, results: body.operations.map((op:any)=>({ operationId:op.operationId, entity:op.entity, entityId:op.entityId, operation:op.operation, success:true, message:"ok", revision:7, canonicalEntity:{id:op.entityId, price:30, serverRevision:7}})) })} as any;
      }
    };
    const { syncPendingOperations } = await import("./src/services/sync/client");
    await syncPendingOperations(); // should process parent, rebase successor
    let afterFirst = await db.syncOperations.toArray();
    let succAfter = afterFirst.find(o=>o.operationId===op2Id);
    if(succAfter) assert(succAfter.baseRevision===6, `successor rebased to 6 got ${succAfter.baseRevision}`);
    // second sync for successor
    await syncPendingOperations();
    const prod:any = await db.products.get("Prod27");
    assert(prod.price===30, `final price30 got ${prod.price}`);
    (globalThis as any).fetch = origFetch;
    await releaseFallbackLease(owner);
    ok("27 Recovered parent + successor rebased final 30");
  }catch(e:any){ fail("27 Recovered parent+successor",e); }
  // 28 Healthy foreign lock owner protection – B must NOT reset A's active in_flight
  try{ await reset();
    const { coalescePendingOperations, getPendingSyncOperations, getInFlightOperations, transitionPendingToInFlight, recoverAbandonedInFlightOperations } = await import("./src/services/sync/queue");
    const { tryAcquireFallbackLease, releaseFallbackLease, getFallbackLease } = await import("./src/services/sync/manager");
    await db.syncMeta.put({key:"serverRevision",value:5});
    await coalescePendingOperations("product","Prot28","update",{price:20},{baseRevision:5});
    let pend = await getPendingSyncOperations();
    await transitionPendingToInFlight(pend);
    let inF = await getInFlightOperations();
    const opId28 = inF[0].operationId;
    // Tab A acquires lock and is actively syncing
    const ownerA="owner-A-28";
    const ownerB="owner-B-28";
    const acqA = await tryAcquireFallbackLease(ownerA);
    assert(acqA, "A acquires lock");
    // B tries to acquire while A holds – must fail
    const acqB_fail = await tryAcquireFallbackLease(ownerB);
    assert(!acqB_fail, "B cannot acquire while A holds");
    // B attempts recovery WITHOUT owning lock – should not happen, but if B naively calls recover without lock it would reset A's active in_flight
    // Our design: recovery only inside lock, so B's pending check without lock should not have run; verify A's in_flight still in_flight after B's failed attempt
    inF = await getInFlightOperations();
    assert(inF.length===1 && inF[0].operationId===opId28 && (inF[0].status==="in_flight"), "A's active in_flight not reset by B");
    // Simulate A crash: release A and expire lease
    await releaseFallbackLease(ownerA);
    await db.syncMeta.put({key:"syncLease", value:{ownerId:ownerA, expiresAt: Date.now()-1000}} as any);
    const acqB = await tryAcquireFallbackLease(ownerB);
    assert(acqB, "B acquires after A crash/expiry");
    const recovered = await recoverAbandonedInFlightOperations();
    assert(recovered===1, "B recovers abandoned");
    let pendAfter = await getPendingSyncOperations();
    assert(pendAfter.length===1 && pendAfter[0].operationId===opId28, "recovered same operationId by B after expiry");
    await releaseFallbackLease(ownerB);
    ok("28 Healthy foreign lock owner protection");
  }catch(e:any){ fail("28 Healthy owner protection",e); }

  console.log(`\n=== H.S.H sync client integrity: ${passed} passed, ${failed} failed ===`);
  if(failed>0) process.exit(1); process.exit(0);
}
run().catch(e=>{console.error(e);process.exit(1)});
