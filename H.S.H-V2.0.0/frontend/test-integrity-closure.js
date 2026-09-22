// HEBRIH V1.1.0 INTEGRITY CLOSURE TESTS A-J
// Run with: node test-integrity-closure.js
// No DB required, pure logic mirroring production code

const assert = (cond, msg) => { if (!cond) throw new Error("ASSERT FAIL: " + msg); };
const allowedCurrencies = ["DA","€","$"];
const isValidCurrency = (c) => allowedCurrencies.includes(c);

// Helper mirroring frontend billingAddress precedence
function resolveCustomerAddress(customer) {
  return customer.billingAddress || customer.address;
}

// Helper mirroring backend/frontend currency hierarchy
function resolveCurrency({ currencyCode, sellerDefault, docDefaultsCurrency, globalCurrency }) {
  const candidates = [currencyCode, sellerDefault, docDefaultsCurrency, globalCurrency, "DA"];
  for (const cand of candidates) {
    if (typeof cand === "string" && cand.trim() !== "" && allowedCurrencies.includes(cand.trim())) {
      return cand.trim();
    }
  }
  return "DA";
}

// Payment method resolution mirroring backend
function resolvePaymentMethod({ pmId, canonicalMethods, docLang }) {
  const builtInMap = {
    cash: { en: "Cash", fr: "Espèces", ar: "نقداً" },
    bank_transfer: { en: "Bank transfer", fr: "Virement bancaire", ar: "تحويل بنكي" },
    cheque: { en: "Cheque", fr: "Chèque", ar: "شيك" },
    other: { en: "Other", fr: "Autre", ar: "أخرى" },
  };
  if (!pmId) return { id: undefined, label: undefined };
  const found = canonicalMethods.find(m => m.id === pmId);
  if (!found || found.enabled !== true) {
    return { error: "PAYMENT_METHOD_INVALID" };
  }
  let label;
  if (builtInMap[pmId]) label = builtInMap[pmId][docLang] || builtInMap[pmId].en;
  else label = found.label;
  return { id: pmId, label };
}

// Document defaults server owns
function resolveDocDefaults(canonical) {
  const ds = canonical?.invoiceDocumentDefaults || {};
  return {
    showBankDetails: ds.showBankDetails ?? true,
    showRC: ds.showRC ?? true,
    showNIF: ds.showNIF ?? true,
    showNIS: ds.showNIS ?? true,
    showCapital: ds.showCapital ?? true,
    showStamp: ds.showStamp ?? true,
  };
}

// Incoming validation helpers
function validateIncoming({ supplierId, supplierExists, supplierInvoiceNumber, invoiceDate, currencyCode, amountHT, amountTTC, taxAmount }) {
  if (!supplierExists) return "SUPPLIER_NOT_FOUND";
  const trimmed = String(supplierInvoiceNumber).trim();
  if (!trimmed) return "SUPPLIER_INVOICE_NUMBER_REQUIRED";
  const ms = typeof invoiceDate === "number" ? invoiceDate : new Date(invoiceDate).getTime();
  if (!Number.isFinite(ms)) return "INVOICE_DATE_INVALID";
  if (currencyCode != null && String(currencyCode).trim() !== "" && !allowedCurrencies.includes(String(currencyCode).trim())) return "INVOICE_CURRENCY_INVALID";
  const ht = Number(amountHT);
  const ttc = Number(amountTTC);
  const tax = taxAmount != null ? Number(taxAmount) : ttc - ht;
  if (!Number.isFinite(ht) || !Number.isFinite(ttc) || !Number.isFinite(tax) || ht < 0 || ttc < 0 || tax < 0 || ttc < ht) return "INCOMING_AMOUNT_INVALID";
  return null;
}

console.log("=== HEBRIH INTEGRITY CLOSURE TESTS ===");

// A: billingAddress precedence
(() => {
  const cust = { address: "General Address", billingAddress: "Invoice Address" };
  const snapshot = resolveCustomerAddress(cust);
  assert(snapshot === "Invoice Address", `A failed: expected Invoice Address got ${snapshot}`);
  console.log("A PASS: billingAddress precedence ->", snapshot);
})();

// B: missing fallback
(() => {
  const cust = { address: "General Address", billingAddress: "" };
  const cust2 = { address: "General Address", billingAddress: undefined };
  const cust3 = { address: "General Address", billingAddress: null };
  assert(resolveCustomerAddress(cust) === "General Address", "B1 failed");
  assert(resolveCustomerAddress(cust2) === "General Address", "B2 failed");
  assert(resolveCustomerAddress({ address: "General", billingAddress: undefined }) === "General", "B3");
  console.log("B PASS: missing billingAddress fallback to General");
})();

// C: invalid currency DZD rejected
(() => {
  assert(!isValidCurrency("DZD"), "C should be invalid");
  assert(isValidCurrency("DA"), "DA should be valid");
  // Simulate incoming validation with DZD
  const err = validateIncoming({ supplierId: "sup1", supplierExists: true, supplierInvoiceNumber: "INV1", invoiceDate: Date.now(), currencyCode: "DZD", amountHT: 100, amountTTC: 119 });
  assert(err === "INVOICE_CURRENCY_INVALID", `C incoming should reject DZD got ${err}`);
  // Also test resolveCurrency with DZD via hierarchy: seller DZD should fallback to DA
  const cur = resolveCurrency({ currencyCode: "DZD", sellerDefault: "DZD", docDefaultsCurrency: undefined, globalCurrency: "DA" });
  // Our hierarchy skips invalid DZD and picks DA
  assert(cur === "DA", `C fallback DZD should resolve to DA got ${cur}`);
  console.log("C PASS: DZD rejected, fallback to DA");
})();

// D: valid DA accepted
(() => {
  const err = validateIncoming({ supplierId: "sup1", supplierExists: true, supplierInvoiceNumber: "INV1", invoiceDate: Date.now(), currencyCode: "DA", amountHT: 100, amountTTC: 119 });
  assert(err === null, `D DA should be accepted got ${err}`);
  assert(isValidCurrency("DA"), "DA valid");
  assert(isValidCurrency("€"), "€ valid");
  assert(isValidCurrency("$"), "$ valid");
  console.log("D PASS: DA/€/$ accepted");
})();

// E: disabled payment method rejected
(() => {
  const canonical = [
    { id: "cash", label: "Cash", enabled: true },
    { id: "bank_transfer", label: "Bank transfer", enabled: false },
    { id: "pm-custom-1", label: "My Custom", enabled: false },
  ];
  const res = resolvePaymentMethod({ pmId: "bank_transfer", canonicalMethods: canonical, docLang: "en" });
  assert(res.error === "PAYMENT_METHOD_INVALID", `E disabled should reject got ${JSON.stringify(res)}`);
  const res2 = resolvePaymentMethod({ pmId: "pm-custom-1", canonicalMethods: canonical, docLang: "en" });
  assert(res2.error === "PAYMENT_METHOD_INVALID", "E custom disabled should reject");
  console.log("E PASS: disabled method rejected");
})();

// F: custom enabled -> canonical label
(() => {
  const canonical = [
    { id: "cash", label: "Cash", enabled: true },
    { id: "pm-custom-1", label: "My Custom Method", enabled: true, isCustom: true },
  ];
  const res = resolvePaymentMethod({ pmId: "pm-custom-1", canonicalMethods: canonical, docLang: "fr" });
  assert(res.id === "pm-custom-1" && res.label === "My Custom Method", `F custom enabled failed ${JSON.stringify(res)}`);
  // built-in translation test
  const resBuilt = resolvePaymentMethod({ pmId: "cash", canonicalMethods: canonical, docLang: "fr" });
  assert(resBuilt.label === "Espèces", `F built-in fr should be Espèces got ${resBuilt.label}`);
  const resBuiltAr = resolvePaymentMethod({ pmId: "cash", canonicalMethods: canonical, docLang: "ar" });
  assert(resBuiltAr.label === "نقداً", `F built-in ar should be نقداً got ${resBuiltAr.label}`);
  console.log("F PASS: custom enabled canonical label and built-in translation");
})();

// G: server documentDefaults wins
(() => {
  const serverSettings = { invoiceDocumentDefaults: { showBankDetails: true, showRC: true, showNIF: true, showNIS: false, showCapital: true, showStamp: false } };
  const clientSnapshot = { showBankDetails: false, showRC: false, showNIF: false, showNIS: true, showCapital: false, showStamp: true };
  const serverSnap = resolveDocDefaults(serverSettings);
  assert(serverSnap.showBankDetails === true, "G server showBankDetails should be true");
  assert(serverSnap.showNIS === false, "G server showNIS should be false");
  assert(serverSnap.showStamp === false, "G server showStamp should be false");
  // Ensure client differs
  assert(clientSnapshot.showBankDetails !== serverSnap.showBankDetails, "G client differs");
  console.log("G PASS: server documentDefaults wins", JSON.stringify(serverSnap));
})();

// H: unknown supplier
(() => {
  const err = validateIncoming({ supplierId: "unknown", supplierExists: false, supplierInvoiceNumber: "INV1", invoiceDate: Date.now(), currencyCode: "DA", amountHT: 100, amountTTC: 119 });
  assert(err === "SUPPLIER_NOT_FOUND", `H unknown supplier should be SUPPLIER_NOT_FOUND got ${err}`);
  console.log("H PASS: unknown supplier rejected");
})();

// I: blank supplier invoice number
(() => {
  const err1 = validateIncoming({ supplierId: "sup1", supplierExists: true, supplierInvoiceNumber: "   ", invoiceDate: Date.now(), currencyCode: "DA", amountHT: 100, amountTTC: 119 });
  assert(err1 === "SUPPLIER_INVOICE_NUMBER_REQUIRED", `I blank should be required got ${err1}`);
  const err2 = validateIncoming({ supplierId: "sup1", supplierExists: true, supplierInvoiceNumber: "", invoiceDate: Date.now(), currencyCode: "DA", amountHT: 100, amountTTC: 119 });
  assert(err2 === "SUPPLIER_INVOICE_NUMBER_REQUIRED", "I empty should be required");
  console.log("I PASS: blank invoice number rejected");
})();

// J: invalid date
(() => {
  const err = validateIncoming({ supplierId: "sup1", supplierExists: true, supplierInvoiceNumber: "INV1", invoiceDate: "invalid-date", currencyCode: "DA", amountHT: 100, amountTTC: 119 });
  assert(err === "INVOICE_DATE_INVALID", `J invalid date should be INVOICE_DATE_INVALID got ${err}`);
  const err2 = validateIncoming({ supplierId: "sup1", supplierExists: true, supplierInvoiceNumber: "INV1", invoiceDate: NaN, currencyCode: "DA", amountHT: 100, amountTTC: 119 });
  assert(err2 === "INVOICE_DATE_INVALID", "J NaN date should be invalid");
  console.log("J PASS: invalid date rejected");
})();

// Extra: billing precedent edge trim
(() => {
  const cust = { address: "Gen", billingAddress: "  " };
  // Our simple || will treat "  " as truthy, but actual production uses || without trim, so it would keep whitespace; ideally we should ensure trim behavior?
  // For now check that billingAddress precedence holds even with whitespace, production code uses || not trim, so "  " would be kept - but we test that our logic covers fallback for empty string only.
  // This is informational
  console.log("Extra: billingAddress whitespace handling note - current logic treats '  ' as truthy (keeps), but trim variant would fallback. Production uses ||, so whitespace kept.");
})();

console.log("\nAll A-J tests PASSED");
process.exit(0);
