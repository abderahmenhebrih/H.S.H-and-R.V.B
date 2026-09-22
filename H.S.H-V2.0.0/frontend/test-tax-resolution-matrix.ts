import "fake-indexeddb/auto";
import { db } from "./src/lib/database/db";
import { productService } from "./src/services/product.service";
import { invoiceSellerProfileService } from "./src/services/invoice-seller-profile.service";
import { invoiceTaxProfileService } from "./src/services/invoice-tax-profile.service";
import { saleService } from "./src/services/sale.service";
import { customerService } from "./src/services/customer.service";

async function clear() {
  await db.open();
  for (const tbl of [db.products, db.invoiceTaxProfiles, db.invoiceSellerProfiles, db.sales, db.customers, db.syncOperations]) {
    try { await (tbl as any).clear(); } catch {}
  }
  await db.syncMeta.put({ key: "serverRevision", value: 0 } as any);
  await db.syncMeta.put({ key: "clientId", value: "test-client" } as any);
}

// Simulate frontend tax resolution hierarchy as in app/invoice/page.tsx and backend/routes/invoice.ts
function resolveTax(productTaxId: string | undefined, sellerDefault: string | undefined, explicit: string | undefined, taxProfiles: any[]): any | null {
  if (explicit) {
    const tp = taxProfiles.find(p => p.id === explicit);
    if (tp) return tp;
  }
  if (productTaxId) {
    const tp = taxProfiles.find(p => p.id === productTaxId);
    if (tp) return tp;
  }
  if (sellerDefault) {
    const tp = taxProfiles.find(p => p.id === sellerDefault);
    if (tp) return tp;
  }
  return null;
}

async function main() {
  await clear();
  console.log("Test Tax Resolution Matrix");

  const now = Date.now();
  const taxProfiles = [
    { id: "tax-19", name: "TVA 19%", code: "TVA19", vatRate: 19, enabled: true, createdAt: now, updatedAt: now, syncStatus: "pending" as const },
    { id: "tax-17", name: "TVA 17%", code: "TVA17", vatRate: 17, enabled: true, createdAt: now, updatedAt: now, syncStatus: "pending" as const },
    { id: "tax-9", name: "TVA 9%", code: "TVA9", vatRate: 9, enabled: true, createdAt: now, updatedAt: now, syncStatus: "pending" as const },
  ];
  for (const p of taxProfiles) await invoiceTaxProfileService.create(p as any).catch(() => db.invoiceTaxProfiles.put(p as any));
  const allTax = await invoiceTaxProfileService.getAll();

  // Create seller with default TVA 17%
  const seller: any = {
    id: "seller-test",
    commercialName: "Test Seller",
    legalDenomination: "Test",
    invoicePrefix: "TST",
    nextNumber: 1,
    paddingLength: 6,
    yearResetPolicy: "never",
    enabled: true,
    defaultTaxProfileId: "tax-17",
    defaultCurrency: "DA",
    address: "Addr",
    rc: "RC",
    createdAt: now,
    updatedAt: now,
    syncStatus: "pending",
  };
  await invoiceSellerProfileService.create(seller).catch(() => db.invoiceSellerProfiles.put(seller as any));

  // Create products
  await db.products.clear();
  const prodA = await productService.create({ name: "Product A", price: 100, quantity: 10, weightKg: 1, taxProfileId: "tax-19" });
  const prodB = await productService.create({ name: "Product B", price: 100, quantity: 10, weightKg: 1, taxProfileId: "tax-9" });
  console.log("Created Prod A TVA19 and Prod B TVA9");

  // Create customer and sale containing both
  const cust = await customerService.create({ name: "Cust1", phone: "01234", type: "Retail", invoiceCustomerType: "consumer", billingAddress: "Addr", address: "Addr" } as any);
  // Sale with items weight*price semantics - use direct db put to preserve id
  const sale: any = {
    id: "sale-1",
    customerId: cust.id,
    date: now,
    items: [
      { productId: prodA.id, quantity: 1, weightKg: 2, price: 50, total: 100 }, // 2kg * 50 DA/kg = 100
      { productId: prodB.id, quantity: 1, weightKg: 3, price: 30, total: 90 },
    ],
    total: 190,
    createdAt: now,
    updatedAt: now,
    syncStatus: "pending",
  };
  await db.sales.put(sale as any);
  // Need to ensure sale present
  const sales = await saleService.getAll();
  const foundSale = sales.find(s => s.id === "sale-1");
  if (!foundSale) throw new Error("Sale not found");

  // Test 1: No explicit override, Product defaults take precedence
  const sellerLoaded = await invoiceSellerProfileService.getById("seller-test") as any;
  const products = await productService.getAll();
  const pA = products.find(p => p.id === prodA.id) as any;
  const pB = products.find(p => p.id === prodB.id) as any;

  let taxA = resolveTax(pA.taxProfileId, sellerLoaded.defaultTaxProfileId, undefined, allTax);
  let taxB = resolveTax(pB.taxProfileId, sellerLoaded.defaultTaxProfileId, undefined, allTax);
  if (!taxA || taxA.vatRate !== 19) throw new Error(`Prod A tax wrong: ${taxA?.vatRate}`);
  if (!taxB || taxB.vatRate !== 9) throw new Error(`Prod B tax wrong: ${taxB?.vatRate}`);
  if (taxA.vatRate === 17 || taxB.vatRate === 17) throw new Error("Seller default incorrectly used");
  console.log("Test1 passed: Prod A 19%, Prod B 9% (seller 17% not used)");

  // Test 2: Change Product B to Not configured => should fallback to seller default 17%
  await productService.getById(prodB.id); // ensure exists
  const { productEditOperation } = await import("./src/services/operations/product-edit.operation");
  await productEditOperation.edit({ productId: prodB.id, name: "Product B", price: 100, quantity: 10, weightKg: 1, taxProfileId: undefined as any });
  const updatedProducts = await productService.getAll();
  const updatedB = updatedProducts.find(p => p.id === prodB.id) as any;
  if (updatedB.taxProfileId) throw new Error("Prod B should be cleared");
  let taxB2 = resolveTax(updatedB.taxProfileId, sellerLoaded.defaultTaxProfileId, undefined, allTax);
  if (!taxB2 || taxB2.vatRate !== 17) throw new Error(`Prod B after clear should use seller 17%, got ${taxB2?.vatRate}`);
  console.log("Test2 passed: Prod B Not configured -> seller default 17%");

  // Test 3: Remove seller default too => unresolved
  sellerLoaded.defaultTaxProfileId = undefined;
  await db.invoiceSellerProfiles.update("seller-test", { defaultTaxProfileId: null as any } as any).catch(async () => {
    const s = await db.invoiceSellerProfiles.get("seller-test");
    if (s) await db.invoiceSellerProfiles.put({ ...s, defaultTaxProfileId: undefined } as any);
  });
  const sellerNoDefault = await invoiceSellerProfileService.getById("seller-test") as any;
  let taxB3 = resolveTax(updatedB.taxProfileId, sellerNoDefault?.defaultTaxProfileId, undefined, allTax);
  if (taxB3) throw new Error(`Should be unresolved (null), got ${taxB3.vatRate}`);
  console.log("Test3 passed: Prod B unresolved blocked (no silent TVA19 fallback)");

  // Ensure no silent fallback to 19% when unresolved
  if (taxB3 && taxB3.vatRate === 19) throw new Error("Silent TVA19 fallback detected");

  // Test explicit override precedence
  let taxExplicit = resolveTax(pA.taxProfileId, sellerLoaded.defaultTaxProfileId, "tax-9", allTax);
  if (!taxExplicit || taxExplicit.vatRate !== 9) throw new Error("Explicit override should take precedence");
  console.log("Explicit override precedence passed");

  console.log("All Tax Resolution Matrix tests passed");
  await db.close();
  process.exit(0);
}

main().catch(e => { console.error("Tax matrix failed", e); process.exit(1); });
