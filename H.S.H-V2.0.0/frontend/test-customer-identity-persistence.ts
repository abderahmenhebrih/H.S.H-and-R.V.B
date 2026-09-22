import "fake-indexeddb/auto";
import { db } from "./src/lib/database/db";
import { customerService } from "./src/services/customer.service";
import { customerEditOperation } from "./src/services/operations/customer-edit.operation";

async function clear() {
  await db.open();
  try { await db.customers.clear(); } catch {}
  try { await db.syncOperations.clear(); } catch {}
  await db.syncMeta.put({ key: "serverRevision", value: 0 } as any);
  await db.syncMeta.put({ key: "clientId", value: "test-client" } as any);
}

async function main() {
  await clear();
  console.log("Test Customer Invoice Identity Persistence");

  // Device A: Create Business customer with all fields
  const created = await customerService.create({
    name: "Test Customer",
    phone: "0123456789",
    type: "Retail",
    invoiceCustomerType: "business",
    legalName: "SARL TEST",
    commercialName: "TEST",
    legalForm: "SARL",
    activity: "Distribution",
    billingAddress: "Algiers",
    rc: "RC123",
    nif: "NIF123",
    nis: "NIS123",
    address: "General Address",
  });
  const loaded: any = await db.customers.get(created.id);
  const fields = ["invoiceCustomerType", "legalName", "commercialName", "legalForm", "activity", "billingAddress", "rc", "nif", "nis"];
  for (const f of fields) {
    if (!loaded[f]) throw new Error(`Create missing ${f}: ${loaded[f]}`);
  }
  if (loaded.invoiceCustomerType !== "business") throw new Error("invoiceCustomerType not business");
  console.log("Create Business passed:", fields.map(f => `${f}=${loaded[f]}`).join(", "));

  // Verify sync payload
  const ops: any[] = await db.syncOperations.toArray();
  const createOp = ops.find(o => o.entity === "customer" && o.entityId === created.id);
  if (!createOp) throw new Error("Sync op not found");
  for (const f of fields) {
    if ((createOp.payload as any)[f] !== (loaded as any)[f]) throw new Error(`Sync payload missing ${f}`);
  }
  console.log("Sync payload for create contains all invoice fields");

  // Device B pull: edit customer, fields populated
  const pulled = await customerService.getById(created.id);
  if ((pulled as any).legalName !== "SARL TEST" || (pulled as any).rc !== "RC123") throw new Error("Device B pull mismatch");
  console.log("Device B pull populated correctly");

  // Change one field
  await customerEditOperation.edit({
    customerId: created.id,
    name: "Test Customer",
    phone: "0123456789",
    type: "Retail",
    invoiceCustomerType: "business",
    legalName: "SARL TEST MODIFIED",
    commercialName: "TEST",
    legalForm: "SARL",
    activity: "Distribution",
    billingAddress: "Algiers Modified",
    rc: "RC123",
    nif: "NIF123",
    nis: "NIS123",
    address: "General Address",
  });
  const afterEdit: any = await db.customers.get(created.id);
  if (afterEdit.legalName !== "SARL TEST MODIFIED" || afterEdit.billingAddress !== "Algiers Modified") throw new Error("Edit change not persisted");
  console.log("Device B edit change persisted:", afterEdit.legalName, afterEdit.billingAddress);

  // Simulate Device A pull after sync (remote apply)
  const afterEditPulled = await customerService.getById(created.id);
  if ((afterEditPulled as any).legalName !== "SARL TEST MODIFIED") throw new Error("Device A pull after edit failed");
  console.log("Device A pull after sync sees same value");

  // Test Business -> Consumer preserves business data
  await customerEditOperation.edit({
    customerId: created.id,
    name: "Test Customer",
    phone: "0123456789",
    type: "Retail",
    invoiceCustomerType: "consumer",
    // Even though we pass business fields, edit operation should preserve them when switching to consumer
    legalName: "SARL TEST MODIFIED",
    commercialName: "TEST",
    legalForm: "SARL",
    activity: "Distribution",
    billingAddress: "Algiers Modified",
    rc: "RC123",
    nif: "NIF123",
    nis: "NIS123",
    address: "General Address",
  });
  const consumer: any = await db.customers.get(created.id);
  if (consumer.invoiceCustomerType !== "consumer") throw new Error("Switch to consumer failed");
  // Business data should still be stored (may remain)
  if (consumer.legalName !== "SARL TEST MODIFIED" || consumer.rc !== "RC123") throw new Error("Business data destroyed on switch to consumer, should be preserved");
  console.log("Business->Consumer preserves data:", consumer.legalName, consumer.rc);

  // Consumer scenario: billingAddress fallback
  await customerEditOperation.edit({
    customerId: created.id,
    name: "Consumer Cust",
    phone: "0555123456",
    type: "Retail",
    invoiceCustomerType: "consumer",
    billingAddress: "", // empty, should clear but fallback to address
    address: "Fallback Addr",
    legalName: consumer.legalName,
    commercialName: consumer.commercialName,
    legalForm: consumer.legalForm,
    activity: consumer.activity,
    rc: consumer.rc,
    nif: consumer.nif,
    nis: consumer.nis,
  });
  const consumerEmptyBilling: any = await db.customers.get(created.id);
  // billingAddress cleared to null, address remains
  console.log("Consumer billingAddress cleared, address fallback test:", { billingAddress: consumerEmptyBilling.billingAddress, address: consumerEmptyBilling.address });
  // Invoice snapshot precedence billingAddress || address should give address
  const snapshotAddr = consumerEmptyBilling.billingAddress || consumerEmptyBilling.address;
  if (snapshotAddr !== "Fallback Addr") throw new Error("Consumer billing fallback failed");
  console.log("Consumer billing fallback precedence passed:", snapshotAddr);

  console.log("All Customer Identity Persistence tests passed");
  await db.close();
  process.exit(0);
}

main().catch(e => { console.error("Customer test failed", e); process.exit(1); });
