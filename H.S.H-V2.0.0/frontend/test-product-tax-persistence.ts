import "fake-indexeddb/auto";
import { db } from "./src/lib/database/db";
import { productService } from "./src/services/product.service";
import { productEditOperation } from "./src/services/operations/product-edit.operation";
import { invoiceTaxProfileService } from "./src/services/invoice-tax-profile.service";

async function clear() {
  await db.open();
  try { await db.products.clear(); } catch {}
  try { await db.invoiceTaxProfiles.clear(); } catch {}
  try { await db.syncOperations.clear(); } catch {}
  await db.syncMeta.put({ key: "serverRevision", value: 0 } as any);
  await db.syncMeta.put({ key: "clientId", value: "test-client" } as any);
}

async function main() {
  await clear();
  console.log("Test Product Tax Persistence");

  // Create tax profiles
  const now = Date.now();
  const profiles = [
    { id: "tax-19", name: "TVA 19%", code: "TVA19", vatRate: 19, enabled: true, createdAt: now, updatedAt: now, syncStatus: "pending" as const },
    { id: "tax-17", name: "TVA 17%", code: "TVA17", vatRate: 17, enabled: true, createdAt: now, updatedAt: now, syncStatus: "pending" as const },
    { id: "tax-9", name: "TVA 9%", code: "TVA9", vatRate: 9, enabled: true, createdAt: now, updatedAt: now, syncStatus: "pending" as const },
    { id: "tax-disabled", name: "TVA Disabled", code: "DIS", vatRate: 5, enabled: false, createdAt: now, updatedAt: now, syncStatus: "pending" as const },
  ];
  for (const p of profiles) {
    await invoiceTaxProfileService.create(p as any).catch(async () => {
      try { await db.invoiceTaxProfiles.put(p as any); } catch {}
    });
  }
  const allProfiles = await invoiceTaxProfileService.getAll();
  const enabled = allProfiles.filter(t => t.enabled === true);
  if (enabled.length !== 3) throw new Error(`Enabled filter failed: expected 3 got ${enabled.length}`);
  if (enabled.some(t => t.id === "tax-disabled")) throw new Error("Disabled profile leaked");
  console.log("Tax profile enabled filter passed:", enabled.map(t => t.name).join(", "));

  // Device A: Add Product -> TVA 17%
  await db.products.clear();
  try { await db.syncOperations.clear(); } catch {}
  const created = await productService.create({ name: "ProductA", price: 100, quantity: 10, weightKg: 5, description: "test", taxProfileId: "tax-17" });
  // Verify local
  const loaded: any = await db.products.get(created.id);
  if (!loaded || loaded.taxProfileId !== "tax-17") throw new Error(`Create persistence failed: taxProfileId=${loaded?.taxProfileId}`);
  console.log("Create with TVA 17% passed:", loaded.taxProfileId);

  // Verify sync operation payload contains taxProfileId
  const ops: any[] = await db.syncOperations.toArray();
  const createOp = ops.find(o => o.entity === "product" && o.entityId === created.id && o.operation === "create");
  if (!createOp) throw new Error("Sync operation for create not found");
  if ((createOp.payload as any).taxProfileId !== "tax-17") throw new Error(`Sync payload missing taxProfileId: ${JSON.stringify(createOp.payload)}`);
  console.log("Sync payload for create contains taxProfileId passed");

  // Simulate Mongo sync: backend would have taxProfileId correct
  // Device B pull: edit product - already selected
  const prodFromDB = await productService.getById(created.id);
  if (prodFromDB?.taxProfileId !== "tax-17") throw new Error("Device B pull failed to see TVA 17%");
  console.log("Device B pull sees TVA 17% passed");

  // Change to Not configured (clear)
  await productEditOperation.edit({ productId: created.id, name: "ProductA", price: 100, quantity: 10, weightKg: 5, description: "test", taxProfileId: undefined as any });
  const afterClear: any = await db.products.get(created.id);
  // Should be null or undefined (cleared), not old value
  if (afterClear.taxProfileId) throw new Error(`Clear failed: taxProfileId still ${afterClear.taxProfileId}`);
  console.log("Clear to Not configured passed: taxProfileId=", afterClear.taxProfileId);

  // Verify sync payload for clear contains null (explicit clear)
  const ops2: any[] = await db.syncOperations.toArray();
  const updateOps = ops2.filter(o => o.entity === "product" && o.entityId === created.id && o.operation === "update");
  const lastUpdate = updateOps[updateOps.length - 1];
  if (!lastUpdate) throw new Error("Update sync op not found");
  // Payload should have taxProfileId null (not omitted)
  if (!("taxProfileId" in (lastUpdate.payload as any))) throw new Error("Clear payload missing taxProfileId key (would preserve old)");
  if ((lastUpdate.payload as any).taxProfileId !== null) throw new Error(`Clear payload should be null, got ${JSON.stringify(lastUpdate.payload.taxProfileId)}`);
  console.log("Clear sync payload contains null sentinel passed");

  // Simulate Mongo cleared and Device B pull sees cleared
  const afterClearProd = await productService.getById(created.id);
  if (afterClearProd?.taxProfileId) throw new Error("Device B after clear still has tax");
  console.log("Device B after clear sees Not configured passed");

  // Also test Product A TVA19 and B TVA9 scenario
  await db.products.clear();
  try { await db.syncOperations.clear(); } catch {}
  const prodA = await productService.create({ name: "Prod19", price: 100, quantity: 1, weightKg: 1, taxProfileId: "tax-19" });
  const prodB = await productService.create({ name: "Prod9", price: 100, quantity: 1, weightKg: 1, taxProfileId: "tax-9" });
  const list = await productService.getAll();
  const foundA = list.find(p => p.id === prodA.id);
  const foundB = list.find(p => p.id === prodB.id);
  if (foundA?.taxProfileId !== "tax-19" || foundB?.taxProfileId !== "tax-9") throw new Error("Mixed products creation failed");
  console.log("Mixed products creation TVA19 and TVA9 passed");

  console.log("All Product Tax Persistence tests passed");
  await db.close();
  process.exit(0);
}

main().catch(e => { console.error("Product Tax test failed", e); process.exit(1); });
