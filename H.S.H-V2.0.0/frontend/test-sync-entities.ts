import "fake-indexeddb/auto";
import { db } from "./src/lib/database/db";
import { applyRemoteChanges, applySnapshot } from "./src/services/sync/apply";
import { getAllSyncTables, SYNC_ENTITIES } from "./src/services/sync/tables";
import { finalizeIssuedInvoiceLocal } from "./src/services/invoice-finalize.service";

async function clearAllSyncData(){
  for (const tbl of db.tables) {
    if (tbl.name==="syncMeta" || tbl.name==="syncOperations" || tbl.name==="syncConflicts") continue;
    try { await tbl.clear(); } catch {}
  }
  try { await db.syncOperations.clear(); } catch {}
  await db.syncMeta.put({ key: "serverRevision", value: 0 } as any);
}

async function prep(revision:number){
  await clearAllSyncData();
  await db.syncMeta.put({ key: "serverRevision", value: revision } as any);
  await db.syncMeta.put({ key: "clientId", value: "test-client" } as any);
}

async function main(){
  await db.open();
  console.log("TestSyncDB (production) opened, version:", (db as any).verno ?? "unknown");
  const tables = getAllSyncTables();
  const hasInvoices = tables.some((t:any)=> t=== (db as any).invoices);
  const hasOffice = tables.some((t:any)=> t=== (db as any).officeFiles);
  const hasIncoming = tables.some((t:any)=> t=== (db as any).incomingInvoices);
  if (!hasInvoices || !hasOffice || !hasIncoming) throw new Error("getAllSyncTables missing new tables");
  console.log("F passed: getAllSyncTables contains new tables");

  await prep(0);
  const invPayload:any={ id:"inv-1", sellerProfileId:"seller-hsh", invoiceNumber:"HSH-000001", status:"ISSUED", customerSnapshot:{name:"Cust1"}, customerId:"cust-1", sourceSaleIds:["sale-1"], invoiceDate: Date.now(), lines:[], subtotalHT:100, taxTotal:19, totalTTC:119, currencyCode:"DA", documentLanguage:"fr", createdAt: Date.now(), updatedAt: Date.now() };
  await applyRemoteChanges([{ revision:1, entity:"invoice", entityId:"inv-1", operation:"create", payload: invPayload } as any]);
  const inv1:any = await (db as any).invoices.get("inv-1");
  if(!inv1 || inv1.invoiceNumber!=="HSH-000001") throw new Error("A: remote invoice create failed");
  console.log("A passed: remote invoice create (real)");

  const cancelledPayload={ ...invPayload, status:"CANCELLED", cancelledAt: Date.now()+1000, cancellationReason:"Test cancel", serverRevision:2 };
  await applyRemoteChanges([{ revision:2, entity:"invoice", entityId:"inv-1", operation:"update", payload: cancelledPayload } as any]);
  const inv2:any = await (db as any).invoices.get("inv-1");
  if(!inv2 || inv2.status!=="CANCELLED" || inv2.cancellationReason!=="Test cancel") throw new Error("B: invoice cancel update failed");
  if(inv2.invoiceNumber!=="HSH-000001") throw new Error("B: invoiceNumber lost");
  if(inv2.syncStatus!=="synced") throw new Error("B: syncStatus not synced");
  const opsB:any[] = await (db as any).syncOperations.toArray();
  if(opsB.some((o:any)=> o.entity==="invoice" && o.entityId==="inv-1" && !o.synced)) throw new Error("B: pending op after remote cancel");
  console.log("B passed: remote invoice cancel/update no requeue (real)");

  await applyRemoteChanges([{ revision:3, entity:"incomingInvoice", entityId:"inc-1", operation:"create", payload:{ id:"inc-1", supplierId:"sup-1", supplierInvoiceNumber:"SUP-100", invoiceDate: Date.now(), amountHT:100, taxAmount:19, amountTTC:119, currencyCode:"DA", createdAt: Date.now(), updatedAt: Date.now() } } as any]);
  const inc1:any = await (db as any).incomingInvoices.get("inc-1");
  if(!inc1 || inc1.amountHT!==100 || inc1.amountTTC!==119) throw new Error("C1 failed");
  console.log("C1 passed: incomingInvoice create (real)");
  await applyRemoteChanges([{ revision:4, entity:"incomingInvoice", entityId:"inc-1", operation:"delete" } as any]);
  const inc2:any = await (db as any).incomingInvoices.get("inc-1");
  if(inc2) throw new Error("C2 failed");
  console.log("C2 passed: incomingInvoice delete (real)");

  await applyRemoteChanges([{ revision:5, entity:"officeFile", entityId:"off-1", operation:"create", payload:{ id:"off-1", type:"document", title:"Doc1", content:{type:"doc", content:[]}, createdAt: Date.now(), updatedAt: Date.now() } } as any]);
  const off1:any = await (db as any).officeFiles.get("off-1");
  if(!off1 || off1.title!=="Doc1") throw new Error("D1 failed");
  console.log("D1 passed: officeFile create (real)");
  await applyRemoteChanges([{ revision:6, entity:"officeFile", entityId:"off-1", operation:"update", payload:{ id:"off-1", type:"document", title:"Doc1 Updated", content:{type:"doc", content:[]}, createdAt: off1.createdAt, updatedAt: Date.now() } } as any]);
  const off2:any = await (db as any).officeFiles.get("off-1");
  if(!off2 || off2.title!=="Doc1 Updated") throw new Error("D2 failed");
  console.log("D2 passed: officeFile update (real)");
  await applyRemoteChanges([{ revision:7, entity:"officeFile", entityId:"off-1", operation:"delete" } as any]);
  const off3:any = await (db as any).officeFiles.get("off-1");
  if(off3) throw new Error("D3 failed");
  console.log("D3 passed: officeFile delete (real)");

  await prep(0);
  const snapshot: Record<string, any[]> = {
    invoice: [{ id:"inv-boot", sellerProfileId:"seller-hv", invoiceNumber:"HV-000010", status:"ISSUED", customerSnapshot:{name:"BootCust"}, customerId:"cust-boot", sourceSaleIds:["sale-boot"], invoiceDate: Date.now(), lines:[], subtotalHT:200, taxTotal:38, totalTTC:238, currencyCode:"DA", documentLanguage:"fr", createdAt: Date.now(), updatedAt: Date.now() }],
    invoiceSellerProfile: [{ id:"seller-hsh", commercialName:"HEBRIH Slaughter House", invoicePrefix:"HSH", nextNumber:2, enabled:true, createdAt: Date.now(), updatedAt: Date.now() }],
    invoiceTaxProfile: [{ id:"tax-19", code:"TVA19", vatRate:19, enabled:true, createdAt: Date.now(), updatedAt: Date.now() }],
    incomingInvoice: [{ id:"inc-boot", supplierId:"sup-boot", supplierInvoiceNumber:"BOOT-1", invoiceDate: Date.now(), amountHT:50, taxAmount:9.5, amountTTC:59.5, currencyCode:"DA", createdAt: Date.now(), updatedAt: Date.now() }],
    officeFile: [{ id:"off-boot", type:"spreadsheet", title:"Boot Sheet", content:{sheets:[]}, createdAt: Date.now(), updatedAt: Date.now() }],
    product: [{ id:"prod-boot", name:"Boot Product", createdAt: Date.now(), updatedAt: Date.now() }],
  };
  await applySnapshot(snapshot, 100);
  const checks:[string, any][]=[ ["invoice", await (db as any).invoices.get("inv-boot")], ["invoiceSellerProfile", await (db as any).invoiceSellerProfiles.get("seller-hsh")], ["invoiceTaxProfile", await (db as any).invoiceTaxProfiles.get("tax-19")], ["incomingInvoice", await (db as any).incomingInvoices.get("inc-boot")], ["officeFile", await (db as any).officeFiles.get("off-boot")], ["product", await (db as any).products.get("prod-boot")], ];
  for(const [name, doc] of checks){ if(!doc) throw new Error(`E: snapshot missing ${name}`); }
  const bootInc:any = await (db as any).incomingInvoices.get("inc-boot");
  if(bootInc.amountHT!==50 || bootInc.taxAmount!==9.5 || bootInc.amountTTC!==59.5) throw new Error("E: amounts wrong");
  console.log("E passed: bootstrap snapshot (real)");

  await prep(1);
  await (db as any).invoices.put({ id:"inv-g", invoiceNumber:"HSH-000099", status:"ISSUED", sellerProfileId:"seller-hsh", customerSnapshot:{name:"G"}, customerId:"c", sourceSaleIds:[], invoiceDate: Date.now(), lines:[], subtotalHT:10, taxTotal:1.9, totalTTC:11.9, currencyCode:"DA", documentLanguage:"fr", syncStatus:"synced", serverRevision:1, lastSyncedAt: Date.now(), createdAt: Date.now(), updatedAt: Date.now() } as any);
  await applyRemoteChanges([{ revision:2, entity:"invoice", entityId:"inv-g", operation:"update", payload:{ id:"inv-g", invoiceNumber:"HSH-000099", status:"CANCELLED", sellerProfileId:"seller-hsh", customerSnapshot:{name:"G"}, customerId:"c", sourceSaleIds:[], invoiceDate: Date.now(), lines:[], subtotalHT:10, taxTotal:1.9, totalTTC:11.9, currencyCode:"DA", documentLanguage:"fr", cancelledAt: Date.now(), cancellationReason:"Required reason test", createdAt: Date.now(), updatedAt: Date.now() } } as any]);
  const opsG:any[] = await (db as any).syncOperations.toArray();
  if(opsG.some((o:any)=> o.entity==="invoice" && o.entityId==="inv-g" && !o.synced)) throw new Error("G failed");
  const invG:any = await (db as any).invoices.get("inv-g");
  if(invG.status!=="CANCELLED" || invG.cancellationReason!=="Required reason test") throw new Error("G failed");
  if(invG.invoiceNumber!=="HSH-000099") throw new Error("G invoiceNumber lost");
  console.log("G passed: cancellation no requeue (real)");

  await prep(10);
  await applyRemoteChanges([{ revision:11, entity:"incomingInvoice", entityId:"inc-ht", operation:"create", payload:{ id:"inc-ht", supplierId:"sup-ht", supplierInvoiceNumber:"HT-100", invoiceDate: Date.now(), amountHT:100, taxAmount:19, amountTTC:119, currencyCode:"DA", createdAt: Date.now(), updatedAt: Date.now() } } as any]);
  const htDoc:any = await (db as any).incomingInvoices.get("inc-ht");
  if(htDoc.amountHT!==100 || htDoc.taxAmount!==19 || htDoc.amountTTC!==119) throw new Error("H failed");
  console.log("H passed: HT 100 TTC 119 tax 19");

  // ---- DRAFT REGRESSION: use REAL production helper finalizeIssuedInvoiceLocal ----
  // CASE A — pending CREATE
  await prep(0);
  const draftIdA = `inv-draft-${Date.now()}`;
  const draftA:any = { id: draftIdA, status:"DRAFT", sellerProfileId:"seller-hsh", customerSnapshot:{name:"DraftCust"}, customerId:"cust-draft", sourceSaleIds:["sale-draft"], invoiceDate: Date.now(), lines:[], subtotalHT:50, taxTotal:9.5, totalTTC:59.5, currencyCode:"DA", documentLanguage:"fr", createdAt: Date.now(), updatedAt: Date.now(), syncStatus:"pending" };
  await (db as any).invoices.put(draftA);
  await (db as any).syncOperations.put({ operationId:`op-${draftIdA}`, entity:"invoice", entityId: draftIdA, operation:"create", payload: draftA, createdAt: Date.now(), synced:false, attempts:0, baseRevision:0, clientId:"test-client", status:"pending" } as any);
  const issuedA:any = { ...draftA, status:"ISSUED", invoiceNumber:"HSH-000050", sequenceNumber:50, issuedAt: Date.now(), syncStatus:"synced", serverRevision:5, lastSyncedAt: Date.now(), createdAt: draftA.createdAt, updatedAt: Date.now() };
  await finalizeIssuedInvoiceLocal(issuedA, 5, "sale-draft", draftIdA);
  const finalA:any = await (db as any).invoices.get(draftIdA);
  if(!finalA || finalA.status!=="ISSUED" || finalA.invoiceNumber!=="HSH-000050") throw new Error("CASE A: canonical ISSUED not preserved: "+JSON.stringify(finalA));
  const opsA:any[] = await (db as any).syncOperations.where("entityId").equals(draftIdA).toArray();
  if(opsA.some((o:any)=>!o.synced)) throw new Error("CASE A: pending CREATE still exists after finalize");
  console.log("CASE A passed: pending CREATE removed, canonical ISSUED retained (real helper)");

  // CASE B — pending UPDATE (DRAFT) must not revert ISSUED
  await prep(0);
  const draftIdB = `inv-draft-B-${Date.now()}`;
  const draftB:any = { id: draftIdB, status:"DRAFT", sellerProfileId:"seller-hsh", customerSnapshot:{name:"DraftB"}, customerId:"cust-b", sourceSaleIds:["sale-b"], invoiceDate: Date.now(), lines:[], subtotalHT:50, taxTotal:9.5, totalTTC:59.5, currencyCode:"DA", documentLanguage:"fr", createdAt: Date.now(), updatedAt: Date.now(), syncStatus:"pending" };
  await (db as any).invoices.put(draftB);
  // pending UPDATE operation for same draft id
  await (db as any).syncOperations.put({ operationId:`op-update-${draftIdB}`, entity:"invoice", entityId: draftIdB, operation:"update", payload:{ id: draftIdB, status:"DRAFT", notes:"stale update" }, createdAt: Date.now(), synced:false, attempts:0, baseRevision:0, clientId:"test-client", status:"pending" } as any);
  const issuedB:any = { ...draftB, status:"ISSUED", invoiceNumber:"HSH-000051", sequenceNumber:51, issuedAt: Date.now(), syncStatus:"synced", serverRevision:6, lastSyncedAt: Date.now(), createdAt: draftB.createdAt, updatedAt: Date.now() };
  await finalizeIssuedInvoiceLocal(issuedB, 6, "sale-b", draftIdB);
  const finalB:any = await (db as any).invoices.get(draftIdB);
  if(!finalB || finalB.status!=="ISSUED" || finalB.invoiceNumber!=="HSH-000051") throw new Error("CASE B: canonical ISSUED not retained after UPDATE cleanup: "+JSON.stringify(finalB));
  const opsB2:any[] = await (db as any).syncOperations.where("entityId").equals(draftIdB).toArray();
  if(opsB2.some((o:any)=>!o.synced)) throw new Error("CASE B: pending UPDATE still exists after finalize — would allow revert to DRAFT");
  // Simulate future sync cycle cannot restore DRAFT: if an old pending UPDATE were pushed with server-last-write-wins, it would still be rejected because op is gone
  console.log("CASE B passed: pending UPDATE removed, canonical ISSUED cannot revert to DRAFT (real helper)");

  // CASE C — another obsolete draft id for same source sale
  await prep(0);
  const draftIdC1 = `inv-draft-C1-${Date.now()}`;
  const draftIdC2 = `inv-draft-C2-${Date.now() + 1}`;
  const obsolete:any = { id: draftIdC2, status:"DRAFT", sellerProfileId:"seller-hsh", customerSnapshot:{name:"Obsolete"}, customerId:"cust-c", sourceSaleIds:["sale-c"], invoiceDate: Date.now(), lines:[], subtotalHT:10, taxTotal:1.9, totalTTC:11.9, currencyCode:"DA", documentLanguage:"fr", createdAt: Date.now(), updatedAt: Date.now(), syncStatus:"pending" };
  await (db as any).invoices.put(obsolete);
  await (db as any).syncOperations.put({ operationId:`op-${draftIdC2}`, entity:"invoice", entityId: draftIdC2, operation:"create", payload: obsolete, createdAt: Date.now(), synced:false, attempts:0, baseRevision:0, clientId:"test-client", status:"pending" } as any);
  const canonicalC:any = { id: draftIdC1, status:"ISSUED", sellerProfileId:"seller-hsh", invoiceNumber:"HSH-000052", sequenceNumber:52, customerSnapshot:{name:"Canon"}, customerId:"cust-c", sourceSaleIds:["sale-c"], invoiceDate: Date.now(), lines:[], subtotalHT:100, taxTotal:19, totalTTC:119, currencyCode:"DA", documentLanguage:"fr", createdAt: Date.now(), updatedAt: Date.now(), issuedAt: Date.now(), syncStatus:"synced", serverRevision:7, lastSyncedAt: Date.now() };
  // Also ensure obsolete draft exists as local before finalize
  await finalizeIssuedInvoiceLocal(canonicalC, 7, "sale-c", draftIdC1);
  // finalize should have removed obsolete draftIdC2 because it shares same sale
  const obsAfter:any = await (db as any).invoices.get(draftIdC2);
  if(obsAfter) throw new Error("CASE C: obsolete draft id not removed");
  const opsObs:any[] = await (db as any).syncOperations.where("entityId").equals(draftIdC2).toArray();
  if(opsObs.some((o:any)=>!o.synced)) throw new Error("CASE C: obsolete draft queue not removed");
  const canonAfter:any = await (db as any).invoices.get(draftIdC1);
  if(!canonAfter || canonAfter.status!=="ISSUED") throw new Error("CASE C: canonical issued not retained");
  console.log("CASE C passed: obsolete draft record+queue removed, canonical retained (real helper)");

  console.log("All REAL production sync tests passed (including A/B/C draft lifecycle)");
  await db.close();
  process.exit(0);
}

main().catch(e=>{ console.error("REAL sync test failed", e); process.exit(1); });
