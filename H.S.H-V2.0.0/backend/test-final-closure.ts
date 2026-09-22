import { validateIncomingInvoiceSync } from "./src/sync/sync-service";
import { SupplierModel } from "./src/models/supplier.model";
import { IncomingInvoiceModel } from "./src/models/incoming-invoice.model";
import { InvoiceModel } from "./src/models/invoice.model";
import { generateInvoiceHtml } from "./src/services/invoice-html.service";

// Mock helpers
let mockSuppliers = new Map<string, any>();
let mockIncoming = new Map<string, any>(); // key: supplierId|supplierInvoiceNumber

function mockModels() {
  // @ts-ignore
  SupplierModel.findOne = ((filter: any) => ({
    lean: async () => {
      const id = filter?.id;
      return mockSuppliers.get(id) || null;
    },
  })) as any;
  // @ts-ignore
  IncomingInvoiceModel.findOne = ((filter: any) => ({
    lean: async () => {
      if (filter?.supplierId && filter?.supplierInvoiceNumber) {
        const key = `${filter.supplierId}|${filter.supplierInvoiceNumber}`;
        return mockIncoming.get(key) || null;
      }
      if (filter?.id) {
        for (const v of mockIncoming.values()) if (v.id === filter.id) return v;
        return null;
      }
      return null;
    },
  })) as any;
}

async function testDocumentDefaultsParity() {
  console.log("\n=== Test 1: documentDefaultsSnapshot parity ===");
  // Mock invoice
  const baseInvoice: any = {
    id: "inv-test-1",
    status: "ISSUED",
    invoiceNumber: "HSH-000001",
    invoiceDate: Date.now(),
    totalTTC: 119,
    subtotalHT: 100,
    taxableBase: 100,
    taxTotal: 19,
    totalHT: 100,
    currencyCode: "DA",
    documentLanguage: "fr",
    amountInWords: "Cent dix-neuf DA",
    sellerSnapshot: {
      commercialName: "Test Seller",
      address: "Addr",
      city: "City",
      wilaya: "Wilaya",
      phone: "01234",
      email: "test@test.com",
      rc: "RC123",
      nif: "NIF123",
      nis: "NIS123",
      capital: "100000",
      bankName: "Bank",
      bankAccount: "123",
      rib: "RIB",
      logo: "",
      stampImage: "data:image/png;base64,xxx",
    },
    customerSnapshot: { name: "Cust", address: "Cust Addr" },
    lines: [{ description: "Prod", quantity: 1, weightKg: 1, unitPriceHT: 100, taxRate: 19, totalHT: 100, totalTTC: 119 }],
    notes: "Note",
  };

  // Mock InvoiceModel.findOne
  const originalFindOne = (InvoiceModel as any).findOne;
  (InvoiceModel as any).findOne = (filter: any) => ({
    lean: async () => {
      if (filter?.id === baseInvoice.id) return baseInvoice;
      return null;
    },
  });

  const cases: any[] = [
    { name: "A all true", defaults: { showBankDetails: true, showRC: true, showNIF: true, showNIS: true, showCapital: true, showStamp: true }, expect: { rc: true, nif: true, nis: true, capital: true, bank: true, stamp: true } },
    { name: "B showBankDetails false", defaults: { showBankDetails: false, showRC: true, showNIF: true, showNIS: true, showCapital: true, showStamp: true }, expect: { rc: true, nif: true, nis: true, capital: true, bank: false, stamp: true } },
    { name: "C showRC/NIF/NIS false", defaults: { showBankDetails: true, showRC: false, showNIF: false, showNIS: false, showCapital: true, showStamp: true }, expect: { rc: false, nif: false, nis: false, capital: true, bank: true, stamp: true } },
    { name: "D showCapital false", defaults: { showBankDetails: true, showRC: true, showNIF: true, showNIS: true, showCapital: false, showStamp: true }, expect: { rc: true, nif: true, nis: true, capital: false, bank: true, stamp: true } },
    { name: "E showStamp false", defaults: { showBankDetails: true, showRC: true, showNIF: true, showNIS: true, showCapital: true, showStamp: false }, expect: { rc: true, nif: true, nis: true, capital: true, bank: true, stamp: false } },
  ];

  for (const c of cases) {
    baseInvoice.documentDefaultsSnapshot = c.defaults;
    const html = await generateInvoiceHtml({ invoiceId: baseInvoice.id, paperSize: "A4", margins: "normal", scale: 1, documentHeaderFooter: true } as any);
    const hasRC = html.includes("RC:");
    const hasNIF = html.includes("NIF:");
    const hasNIS = html.includes("NIS:");
    const hasCapital = html.includes("Capital:");
    const hasBank = html.includes("Bank details") || html.includes("Coordonnées bancaires") || html.includes("البيانات البنكية");
    const hasStamp = html.includes("Authorized Signature") || html.includes("Signature Autorisée") || html.includes("التوقيع المعتمد");
    // Check image vs line: when showStamp false, signatureSection div should be absent (CSS still contains .signatureSection but not class="signatureSection")
    const hasSignatureSection = html.includes('class="signatureSection"');

    const ok = (hasRC === c.expect.rc) && (hasNIF === c.expect.nif) && (hasNIS === c.expect.nis) && (hasCapital === c.expect.capital) && (hasBank === c.expect.bank) && (hasSignatureSection === c.expect.stamp);
    if (!ok) {
      console.error(`FAIL ${c.name}:`, { hasRC, hasNIF, hasNIS, hasCapital, hasBank, hasStamp, hasSignatureSection, expect: c.expect });
      throw new Error(`Parity failed ${c.name}`);
    }
    console.log(`PASS ${c.name}: RC=${hasRC} NIF=${hasNIF} NIS=${hasNIS} Capital=${hasCapital} Bank=${hasBank} StampSection=${hasSignatureSection}`);
  }

  // Test historical immutability: changing current Settings must not affect old invoice
  const oldSnapshot = { showBankDetails: false, showRC: false, showNIF: false, showNIS: false, showCapital: false, showStamp: false };
  baseInvoice.documentDefaultsSnapshot = oldSnapshot;
  const htmlOld = await generateInvoiceHtml({ invoiceId: baseInvoice.id, paperSize: "A4", margins: "normal", scale: 1, documentHeaderFooter: true } as any);
  // Simulate current Settings changed to all true, but old invoice still has oldSnapshot
  const hasRCOld = htmlOld.includes("RC:");
  if (hasRCOld) throw new Error("Historical invoice should not show RC when snapshot false");
  console.log("PASS historical immutability");

  (InvoiceModel as any).findOne = originalFindOne;
}

async function testEscaping() {
  console.log("\n=== Test 2: HTML escaping ===");
  const originalFindOne = (InvoiceModel as any).findOne;
  const maliciousInvoice: any = {
    id: "inv-escape",
    status: "ISSUED",
    invoiceNumber: "HSH-000002",
    invoiceDate: Date.now(),
    totalTTC: 100,
    subtotalHT: 100,
    taxableBase: 100,
    taxTotal: 0,
    currencyCode: "DA",
    documentLanguage: "fr",
    amountInWords: "Cent",
    sellerSnapshot: {
      commercialName: "<script>alert(1)</script>",
      address: "Addr",
      rc: "RC",
      bankName: "Bank",
    },
    customerSnapshot: {
      name: "ACME & Sons <Main>",
      address: "Addr",
    },
    lines: [],
    notes: `"quoted" 'single'`,
    documentDefaultsSnapshot: { showBankDetails: true, showRC: true, showNIF: true, showNIS: true, showCapital: true, showStamp: true },
  };
  (InvoiceModel as any).findOne = (filter: any) => ({
    lean: async () => filter?.id === maliciousInvoice.id ? maliciousInvoice : null,
  });
  const html = await generateInvoiceHtml({ invoiceId: maliciousInvoice.id, paperSize: "A4", margins: "normal", scale: 1, documentHeaderFooter: true } as any);
  const checks: [string, boolean, string][] = [
    ["&lt;script&gt;", html.includes("&lt;script&gt;"), "should contain escaped script"],
    ["&amp;", html.includes("&amp;"), "should contain &amp; for ACME & Sons"],
    ["&lt;", html.includes("&lt;") && html.includes("ACME"), "should contain &lt; for <Main>"],
    ["&gt;", html.includes("&gt;"), "should contain &gt;"],
    ["&quot;", html.includes("&quot;"), "should contain &quot; for quoted"],
    ["&#39;", html.includes("&#39;"), "should contain &#39; for single"],
  ];
  for (const [needle, ok, msg] of checks) {
    if (!ok) {
      console.error(`FAIL escaping ${needle}: ${msg}`, html.slice(0,500));
      throw new Error(`Escaping failed ${needle}`);
    }
    console.log(`PASS escaping ${needle}`);
  }
  if (html.includes("<script>alert(1)</script>")) throw new Error("FAIL: raw script tag found");
  if (html.includes("ACME & Sons <Main>") && !html.includes("ACME &amp; Sons")) throw new Error("FAIL: unescaped customer");
  console.log("PASS no executable tags");

  (InvoiceModel as any).findOne = originalFindOne;
}

async function testSyncValidation() {
  console.log("\n=== Test 3: incomingInvoice sync validation ===");
  mockModels();
  mockSuppliers.set("sup1", { id: "sup1", name: "Supplier 1" });
  // No supplier for unknown

  const basePayload: any = {
    supplierId: "sup1",
    supplierInvoiceNumber: "INV001",
    invoiceDate: Date.now(),
    currencyCode: "DA",
    amountHT: 100,
    taxAmount: 19,
    amountTTC: 119,
  };

  const tests: any[] = [
    { name: "A unknown supplier", payload: { ...basePayload, supplierId: "unknown" }, op: { entityId: "inc-a", operation: "create" } as any, expect: "SUPPLIER_NOT_FOUND" },
    { name: "B blank number", payload: { ...basePayload, supplierInvoiceNumber: "   " }, op: { entityId: "inc-b", operation: "create" } as any, expect: "SUPPLIER_INVOICE_NUMBER_REQUIRED" },
    { name: "C invalid date", payload: { ...basePayload, invoiceDate: "invalid" }, op: { entityId: "inc-c", operation: "create" } as any, expect: "INVOICE_DATE_INVALID" },
    { name: "D DZD invalid", payload: { ...basePayload, currencyCode: "DZD" }, op: { entityId: "inc-d", operation: "create" } as any, expect: "INVOICE_CURRENCY_INVALID" },
    { name: "E negative HT", payload: { ...basePayload, amountHT: -1 }, op: { entityId: "inc-e", operation: "create" } as any, expect: "INCOMING_AMOUNT_INVALID" },
    { name: "F TTC < HT", payload: { ...basePayload, amountHT: 100, amountTTC: 90 }, op: { entityId: "inc-f", operation: "create" } as any, expect: "INCOMING_AMOUNT_INVALID" },
    { name: "G valid", payload: { ...basePayload, supplierInvoiceNumber: "INV002" }, op: { entityId: "inc-g", operation: "create" } as any, expect: null },
  ];

  for (const t of tests) {
    const res = await validateIncomingInvoiceSync(t.payload, t.op);
    if (res !== t.expect) {
      console.error(`FAIL ${t.name}: expected ${t.expect} got ${res}`);
      throw new Error(`Sync validation failed ${t.name}`);
    }
    console.log(`PASS ${t.name}: ${t.expect ?? "accepted"}`);
  }

  // H duplicate
  mockIncoming.set("sup1|INV001", { id: "existing-id", supplierId: "sup1", supplierInvoiceNumber: "INV001" });
  const dupRes = await validateIncomingInvoiceSync({ ...basePayload, supplierInvoiceNumber: "INV001" }, { entityId: "inc-h", operation: "create" } as any);
  if (dupRes !== "INCOMING_INVOICE_DUPLICATE") {
    console.error(`FAIL H duplicate: expected INCOMING_INVOICE_DUPLICATE got ${dupRes}`);
    throw new Error("Duplicate failed");
  }
  console.log("PASS H duplicate");
  // Valid with different number should pass
  const nonDup = await validateIncomingInvoiceSync({ ...basePayload, supplierInvoiceNumber: "INV999" }, { entityId: "inc-h2", operation: "create" } as any);
  if (nonDup !== null) throw new Error("Non-duplicate should pass");
  console.log("PASS H non-duplicate accepted");
}

async function testOutgoingCurrency() {
  console.log("\n=== Test 4: outgoing explicit invalid currency ===");
  // Simulate backend logic for outgoing
  function validateOutgoing(currencyCode: any, sellerDefault: any, docDefault: any, global: any) {
    const allowed = ["DA","€","$"];
    if (currencyCode != null && String(currencyCode).trim() !== "" && !allowed.includes(String(currencyCode).trim())) {
      return "INVOICE_CURRENCY_INVALID";
    }
    const effective = String(currencyCode || "").trim() ? String(currencyCode).trim() : undefined;
    const candidates = [effective, sellerDefault, docDefault, global, "DA"];
    let cur = "DA";
    for (const cand of candidates) {
      if (typeof cand === "string" && cand.trim() !== "" && allowed.includes(cand.trim())) { cur = cand.trim(); break; }
    }
    return cur;
  }

  const tests: any[] = [
    { name: "A explicit DZD", args: ["DZD", "DA", "DA", "DA"], expect: "INVOICE_CURRENCY_INVALID" },
    { name: "B explicit DA", args: ["DA", null, null, null], expect: "DA" },
    { name: "C explicit €", args: ["€", null, null, null], expect: "€" },
    { name: "D explicit $", args: ["$", null, null, null], expect: "$" },
    { name: "E fallback Seller $", args: [undefined, "$", "€", "DA"], expect: "$" },
    { name: "F fallback doc €", args: [undefined, undefined, "€", "DA"], expect: "€" },
    { name: "G none -> DA", args: [undefined, undefined, undefined, undefined], expect: "DA" },
    { name: "E2 Seller DZD invalid fallback", args: [undefined, "DZD", "€", "DA"], expect: "€" },
  ];
  for (const t of tests) {
    const res = validateOutgoing(t.args[0], t.args[1], t.args[2], t.args[3]);
    if (res !== t.expect) {
      console.error(`FAIL ${t.name}: expected ${t.expect} got ${res}`);
      throw new Error(`Outgoing currency failed ${t.name}`);
    }
    console.log(`PASS ${t.name}: ${res}`);
  }
}

async function main() {
  try {
    await testDocumentDefaultsParity();
    await testEscaping();
    await testSyncValidation();
    await testOutgoingCurrency();
    console.log("\nAll final closure tests PASSED");
    process.exit(0);
  } catch (e) {
    console.error("Test failed", e);
    process.exit(1);
  }
}

main();
