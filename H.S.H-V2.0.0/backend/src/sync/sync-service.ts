import mongoose from "mongoose";
import { getModel } from "./model-registry";
import type { SyncRequestOperation, SyncOperationResult, SyncChange } from "./types";
import { SyncCounterModel } from "../models/sync-counter.model";
import { SyncChangeModel } from "../models/sync-change.model";
import { ProcessedSyncOperationModel } from "../models/processed-sync-operation.model";
import { SupplierModel } from "../models/supplier.model";
import { IncomingInvoiceModel } from "../models/incoming-invoice.model";

type SyncModel = {
  findOne: (filter: { id: string }) => Promise<any>;
  create: (payload: Record<string, unknown>) => Promise<any>;
  updateOne: (filter: { id: string }, update: { $set: Record<string, unknown> }) => Promise<any>;
  deleteOne: (filter: { id: string }) => Promise<any>;
  findById?: (id: string) => Promise<any>;
};

function getSyncModel(entity: string): SyncModel {
  return getModel(entity) as unknown as SyncModel;
}

async function getNextRevision(session?: any): Promise<number> {
  const opts = session ? { session } : {};
  const doc = await SyncCounterModel.findOneAndUpdate(
    { name: "global" },
    { $inc: { revision: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true, ...opts },
  );
  if (!doc) {
    const created = await SyncCounterModel.create([{ name: "global", revision: 1 }], opts as any);
    return (created[0] as any).revision;
  }
  if (typeof (doc as any).revision !== "number") {
    await SyncCounterModel.updateOne({ name: "global" }, { $set: { revision: 1 } }, opts as any);
    return 1;
  }
  return (doc as any).revision;
}

function isTransientError(error: unknown): boolean {
  const err: any = error;
  const msg = err instanceof Error ? err.message : String(err);
  const name = err?.name ? String(err.name) : "";
  const code: any = err?.code;
  const codeName: any = err?.codeName;
  const labels: string[] = Array.isArray(err?.errorLabels) ? err.errorLabels : Array.isArray(err?.labels) ? err.labels : [];
  const hasTransientLabel = labels.some((l: string) => /TransientTransactionError|UnknownTransactionCommitResult|RetryableWriteError/i.test(l));
  if (hasTransientLabel) return true;
  // Explicit Mongo error codes / names
  if (code === 11000 || codeName === "DuplicateKey" || msg.includes("E11000")) return false;
  if (name === "MongoNetworkError" || name === "MongoServerSelectionError" || name === "MongoTimeoutError" || msg.includes("MongoNetworkError") || msg.includes("MongoServerSelectionError") || msg.includes("NetworkTimeout") || msg.includes("MongoTimeout")) return true;
  if (name === "MongooseError" && /buffering timed out/i.test(msg)) return true;
  if (/ETIMEDOUT|ECONNRESET|ENOTFOUND|ECONNREFUSED|EPIPE/i.test(msg)) return true;
  if (msg.includes("TransientTransactionError")) return true;
  if (msg.includes("UnknownTransactionCommitResult")) return true;
  if (msg.includes("NoSuchTransaction")) return true;
  if (msg.includes("WriteConflict")) return true;
  // Terminal duplicate key / validation errors — never retry
  if (msg.toLowerCase().includes("duplicate")) return false;
  if (msg.includes("INCOMING_INVOICE_DUPLICATE")) return false;
  if (msg.includes("INVOICE_IMMUTABLE")) return false;
  if (msg.includes("Validation")) return false;
  if (msg.includes("Unsupported")) return false;
  if (msg.includes("Entity not found")) return false;
  if (msg.includes("Missing operationId")) return false;
  if (msg.includes("already exists")) return false;
  if (msg.includes("must be")) return false;
  if (msg.includes("required")) return false;
  // Default: treat known transient only, otherwise terminal to avoid infinite retry
  const terminalKeywords = ["Unsupported", "Entity not found", "Missing", "Invalid entity", "Validation", "already exists", "INVOICE", "INCOMING"];
  for (const kw of terminalKeywords) if (msg.includes(kw)) return false;
  return false;
}

// SERVER-SIDE H.S.H sync validation layer — H.S.H only, do not touch R.V.B
// Mirrors frontend money helper: round to 2 decimals
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export const HSH_SYNC_ENTITIES = new Set<string>([
  "product",
  "customer",
  "supplier",
  "bankAccount",
  "transfer",
  "purchase",
  "sale",
  "payment",
  "worker",
  "vehicle",
  "task",
  "invoiceTaxProfile",
  "incomingInvoice",
]);

function isNonEmptyString(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function toFiniteNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v.trim());
  return Number(v);
}

function isFiniteNumeric(v: unknown): boolean {
  const n = toFiniteNumber(v);
  return Number.isFinite(n);
}

function validatePurchaseSalePayload(
  payload: Record<string, unknown>,
  operation: string,
  entity: string,
): string | null {
  const rawItems: any = (payload as any).items;
  const rawTotal: any = (payload as any).total;
  const hasItems = rawItems !== undefined;
  const isCreateUpsert = operation === "create" || operation === "upsert";

  // For create/upsert require items
  if (isCreateUpsert && !hasItems) {
    return entity === "purchase" ? "PURCHASE_ITEMS_REQUIRED" : "SALE_ITEMS_REQUIRED";
  }

  // If items present, validate thoroughly
  if (hasItems) {
    if (!Array.isArray(rawItems)) {
      return entity === "purchase" ? "PURCHASE_ITEMS_INVALID" : "SALE_ITEMS_INVALID";
    }
    if (rawItems.length === 0) {
      return entity === "purchase" ? "PURCHASE_ITEMS_REQUIRED" : "SALE_ITEMS_REQUIRED";
    }
    if (rawItems.length > 500) {
      return entity === "purchase" ? "PURCHASE_ITEMS_TOO_MANY" : "SALE_ITEMS_TOO_MANY";
    }

    let grand = 0;
    for (let i = 0; i < rawItems.length; i++) {
      const it: any = rawItems[i];
      if (it == null || typeof it !== "object" || Array.isArray(it)) {
        return entity === "purchase" ? "PURCHASE_ITEM_INVALID" : "SALE_ITEM_INVALID";
      }
      const productId = it.productId;
      if (!isNonEmptyString(productId)) {
        return entity === "purchase" ? "PURCHASE_ITEM_PRODUCT_REQUIRED" : "SALE_ITEM_PRODUCT_REQUIRED";
      }
      const quantityRaw = it.quantity;
      if (quantityRaw === undefined || quantityRaw === null) {
        return entity === "purchase" ? "PURCHASE_QUANTITY_REQUIRED" : "SALE_QUANTITY_REQUIRED";
      }
      const quantity = toFiniteNumber(quantityRaw);
      if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
        return entity === "purchase" ? "PURCHASE_QUANTITY_INVALID" : "SALE_QUANTITY_INVALID";
      }
      const weightRaw = it.weightKg !== undefined ? it.weightKg : it.weight;
      if (weightRaw === undefined || weightRaw === null) {
        return entity === "purchase" ? "PURCHASE_WEIGHT_REQUIRED" : "SALE_WEIGHT_REQUIRED";
      }
      const weightKg = toFiniteNumber(weightRaw);
      if (!Number.isFinite(weightKg) || weightKg < 0) {
        return entity === "purchase" ? "PURCHASE_WEIGHT_INVALID" : "SALE_WEIGHT_INVALID";
      }
      const priceRaw = it.price;
      if (priceRaw === undefined || priceRaw === null) {
        return entity === "purchase" ? "PURCHASE_PRICE_REQUIRED" : "SALE_PRICE_REQUIRED";
      }
      const price = toFiniteNumber(priceRaw);
      if (!Number.isFinite(price) || price < 0) {
        return entity === "purchase" ? "PURCHASE_PRICE_INVALID" : "SALE_PRICE_INVALID";
      }
      const totalRaw = it.total;
      if (totalRaw === undefined || totalRaw === null) {
        return entity === "purchase" ? "PURCHASE_ITEM_TOTAL_REQUIRED" : "SALE_ITEM_TOTAL_REQUIRED";
      }
      const total = toFiniteNumber(totalRaw);
      if (!Number.isFinite(total) || total < 0) {
        return entity === "purchase" ? "PURCHASE_ITEM_TOTAL_INVALID" : "SALE_ITEM_TOTAL_INVALID";
      }
      // Strict finite checks via !Number.isFinite already covered, but also reject NaN/Infinity explicitly
      if (!Number.isFinite(quantity) || !Number.isFinite(weightKg) || !Number.isFinite(price) || !Number.isFinite(total)) {
        return entity === "purchase" ? "PURCHASE_NUMERIC_INVALID" : "SALE_NUMERIC_INVALID";
      }
      const expected = roundMoney(weightKg * price);
      if (!Number.isFinite(expected)) {
        return entity === "purchase" ? "PURCHASE_TOTAL_INVALID" : "SALE_TOTAL_INVALID";
      }
      if (Math.abs(total - expected) > 0.005) {
        return entity === "purchase" ? "PURCHASE_ITEM_TOTAL_MISMATCH" : "SALE_ITEM_TOTAL_MISMATCH";
      }
      grand = roundMoney(grand + expected);
    }

    if (!Number.isFinite(grand) || grand < 0) {
      return entity === "purchase" ? "PURCHASE_TOTAL_INVALID" : "SALE_TOTAL_INVALID";
    }

    if (rawTotal !== undefined && rawTotal !== null) {
      const totalNum = toFiniteNumber(rawTotal);
      if (!Number.isFinite(totalNum) || totalNum < 0) {
        return entity === "purchase" ? "PURCHASE_TOTAL_INVALID" : "SALE_TOTAL_INVALID";
      }
      if (Math.abs(totalNum - grand) > 0.005) {
        return entity === "purchase" ? "PURCHASE_TOTAL_MISMATCH" : "SALE_TOTAL_MISMATCH";
      }
    } else if (isCreateUpsert) {
      // For create/upsert total is required, never trust client to omit it
      return entity === "purchase" ? "PURCHASE_TOTAL_REQUIRED" : "SALE_TOTAL_REQUIRED";
    }
  } else {
    // No items but total present — still validate total finite
    if (rawTotal !== undefined && rawTotal !== null) {
      const totalNum = toFiniteNumber(rawTotal);
      if (!Number.isFinite(totalNum) || totalNum < 0) {
        return entity === "purchase" ? "PURCHASE_TOTAL_INVALID" : "SALE_TOTAL_INVALID";
      }
    }
  }

  // Also validate date finite if present
  const dateRaw: any = (payload as any).date;
  if (dateRaw !== undefined && dateRaw !== null) {
    const d = toFiniteNumber(dateRaw);
    if (!Number.isFinite(d)) {
      return entity === "purchase" ? "PURCHASE_DATE_INVALID" : "SALE_DATE_INVALID";
    }
  } else if (isCreateUpsert) {
    return entity === "purchase" ? "PURCHASE_DATE_REQUIRED" : "SALE_DATE_REQUIRED";
  }

  // Validate supplierId/customerId if present
  if (entity === "purchase") {
    const sid = (payload as any).supplierId;
    if (sid !== undefined && sid !== null && !isNonEmptyString(sid)) return "PURCHASE_SUPPLIER_INVALID";
    if (isCreateUpsert && !isNonEmptyString(sid)) return "PURCHASE_SUPPLIER_REQUIRED";
  }
  if (entity === "sale") {
    const cid = (payload as any).customerId;
    if (cid !== undefined && cid !== null && !isNonEmptyString(cid)) return "SALE_CUSTOMER_INVALID";
    if (isCreateUpsert && !isNonEmptyString(cid)) return "SALE_CUSTOMER_REQUIRED";
  }

  return null;
}

export function validateHshPayload(
  entity: string,
  payload: Record<string, unknown>,
  operation: string,
): string | null {
  // Scope: H.S.H only — do not touch R.V.B
  if (!HSH_SYNC_ENTITIES.has(entity)) return null;
  // Only validate mutations that go through generic path
  if (operation !== "create" && operation !== "upsert" && operation !== "update") return null;
  if (payload == null || typeof payload !== "object") return "HSH_PAYLOAD_INVALID";

  const isCreateUpsert = operation === "create" || operation === "upsert";

  // Entity-specific validations — run before generic sweep to return specific error codes
  switch (entity) {
    case "purchase":
    case "sale": {
      const psErr = validatePurchaseSalePayload(payload, operation, entity);
      if (psErr) return psErr;
      break;
    }
    case "transfer": {
      const amountRaw: any = (payload as any).amount;
      const dateRaw: any = (payload as any).date;
      const fromRaw: any = (payload as any).fromAccountId;
      const toRaw: any = (payload as any).toAccountId;

      if (isCreateUpsert) {
        if (amountRaw === undefined || amountRaw === null) return "TRANSFER_AMOUNT_REQUIRED";
        if (dateRaw === undefined || dateRaw === null) return "TRANSFER_DATE_REQUIRED";
        if (!isNonEmptyString(fromRaw) || !isNonEmptyString(toRaw)) return "TRANSFER_ACCOUNTS_REQUIRED";
      }
      if (amountRaw !== undefined && amountRaw !== null) {
        const amount = toFiniteNumber(amountRaw);
        if (!Number.isFinite(amount) || amount <= 0) return "TRANSFER_AMOUNT_INVALID";
      }
      if (dateRaw !== undefined && dateRaw !== null) {
        const d = toFiniteNumber(dateRaw);
        if (!Number.isFinite(d)) return "TRANSFER_DATE_INVALID";
      }
      if (fromRaw !== undefined || toRaw !== undefined) {
        if (!isNonEmptyString(fromRaw) || !isNonEmptyString(toRaw)) return "TRANSFER_ACCOUNTS_INVALID";
        if (String(fromRaw).trim() === String(toRaw).trim()) return "TRANSFER_ACCOUNTS_SAME";
      }
      // Business invariants: amount>0 already checked, source != destination already checked
      break;
    }
    case "payment": {
      const amountRaw: any = (payload as any).amount;
      const dateRaw: any = (payload as any).date;
      const entityIdRaw: any = (payload as any).entityId;
      const accountIdRaw: any = (payload as any).accountId;
      const entityTypeRaw: any = (payload as any).entityType;

      if (isCreateUpsert) {
        if (amountRaw === undefined || amountRaw === null) return "PAYMENT_AMOUNT_REQUIRED";
        if (dateRaw === undefined || dateRaw === null) return "PAYMENT_DATE_REQUIRED";
        if (!isNonEmptyString(entityIdRaw)) return "PAYMENT_ENTITY_INVALID";
        if (!isNonEmptyString(accountIdRaw)) return "PAYMENT_ACCOUNT_INVALID";
      }
      if (amountRaw !== undefined && amountRaw !== null) {
        const amount = toFiniteNumber(amountRaw);
        if (!Number.isFinite(amount) || amount <= 0) return "PAYMENT_AMOUNT_INVALID";
      }
      if (dateRaw !== undefined && dateRaw !== null) {
        const d = toFiniteNumber(dateRaw);
        if (!Number.isFinite(d)) return "PAYMENT_DATE_INVALID";
      }
      if (entityIdRaw !== undefined && entityIdRaw !== null && !isNonEmptyString(entityIdRaw)) return "PAYMENT_ENTITY_INVALID";
      if (accountIdRaw !== undefined && accountIdRaw !== null && !isNonEmptyString(accountIdRaw)) return "PAYMENT_ACCOUNT_INVALID";
      if (entityTypeRaw !== undefined && entityTypeRaw !== null) {
        const allowed = ["supplier", "customer", "worker", "expense"];
        if (!isNonEmptyString(entityTypeRaw) || !allowed.includes(String(entityTypeRaw).trim())) return "PAYMENT_TYPE_INVALID";
      }
      break;
    }
    case "task": {
      const deadlineRaw: any = (payload as any).deadline;
      if (deadlineRaw !== undefined && deadlineRaw !== null) {
        const d = toFiniteNumber(deadlineRaw);
        if (!Number.isFinite(d)) return "TASK_DEADLINE_INVALID";
      } else if (isCreateUpsert) {
        return "TASK_DEADLINE_REQUIRED";
      }
      // Also validate name if present? Not required per spec, just numbers
      break;
    }
    case "invoiceTaxProfile": {
      const vatRaw: any = (payload as any).vatRate;
      const otherRaw: any = (payload as any).otherTaxRate;
      if (vatRaw !== undefined && vatRaw !== null) {
        const n = toFiniteNumber(vatRaw);
        if (!Number.isFinite(n) || n < 0 || n > 100) return "TAX_RATE_INVALID";
      } else if (isCreateUpsert) {
        return "TAX_RATE_REQUIRED";
      }
      if (otherRaw !== undefined && otherRaw !== null) {
        const n = toFiniteNumber(otherRaw);
        if (!Number.isFinite(n) || n < 0 || n > 100) return "TAX_RATE_INVALID";
      }
      break;
    }
    case "product": {
      const priceRaw: any = (payload as any).price;
      const qtyRaw: any = (payload as any).quantity;
      const weightRaw: any = (payload as any).weightKg ?? (payload as any).weight;
      const balanceRaw: any = (payload as any).balance; // not used but generic
      if (priceRaw !== undefined && priceRaw !== null) {
        const n = toFiniteNumber(priceRaw);
        if (!Number.isFinite(n) || n < 0) return "PRODUCT_PRICE_INVALID";
      }
      if (qtyRaw !== undefined && qtyRaw !== null) {
        const n = toFiniteNumber(qtyRaw);
        if (!Number.isFinite(n) || n < 0) return "PRODUCT_QUANTITY_INVALID";
      }
      if (weightRaw !== undefined && weightRaw !== null) {
        const n = toFiniteNumber(weightRaw);
        if (!Number.isFinite(n) || n < 0) return "PRODUCT_WEIGHT_INVALID";
      }
      // Also check any numeric field finite already via generic sweep, but explicit above for error codes
      break;
    }
    case "customer":
    case "supplier": {
      const balanceRaw: any = (payload as any).balance;
      if (balanceRaw !== undefined && balanceRaw !== null) {
        const n = toFiniteNumber(balanceRaw);
        if (!Number.isFinite(n)) return entity === "customer" ? "CUSTOMER_BALANCE_INVALID" : "SUPPLIER_BALANCE_INVALID";
      }
      break;
    }
    case "bankAccount": {
      const initRaw: any = (payload as any).initialBalance;
      const balRaw: any = (payload as any).balance;
      if (initRaw !== undefined && initRaw !== null) {
        const n = toFiniteNumber(initRaw);
        if (!Number.isFinite(n)) return "BANK_ACCOUNT_BALANCE_INVALID";
      }
      if (balRaw !== undefined && balRaw !== null) {
        const n = toFiniteNumber(balRaw);
        if (!Number.isFinite(n)) return "BANK_ACCOUNT_BALANCE_INVALID";
      }
      break;
    }
    case "worker": {
      const startRaw: any = (payload as any).startingSalary;
      const monthlyRaw: any = (payload as any).monthlySalary;
      const balRaw: any = (payload as any).balance;
      const birthRaw: any = (payload as any).birthDate;
      const empRaw: any = (payload as any).employmentDate;
      if (startRaw !== undefined && startRaw !== null) {
        const n = toFiniteNumber(startRaw);
        if (!Number.isFinite(n) || n < 0) return "WORKER_SALARY_INVALID";
      }
      if (monthlyRaw !== undefined && monthlyRaw !== null) {
        const n = toFiniteNumber(monthlyRaw);
        if (!Number.isFinite(n) || n < 0) return "WORKER_SALARY_INVALID";
      }
      if (balRaw !== undefined && balRaw !== null) {
        const n = toFiniteNumber(balRaw);
        if (!Number.isFinite(n)) return "WORKER_BALANCE_INVALID";
      }
      if (birthRaw !== undefined && birthRaw !== null) {
        const n = toFiniteNumber(birthRaw);
        if (!Number.isFinite(n)) return "WORKER_DATE_INVALID";
      }
      if (empRaw !== undefined && empRaw !== null) {
        const n = toFiniteNumber(empRaw);
        if (!Number.isFinite(n)) return "WORKER_DATE_INVALID";
      }
      break;
    }
    case "vehicle": {
      // No numeric business invariants beyond generic finite check; payload mainly strings
      break;
    }
    case "incomingInvoice": {
      // Mirror frontend/backend finite checks for amounts/dates, but delegate full DB validation to validateIncomingInvoiceSync (async)
      // Here we do synchronous numeric finite checks before that async hook
      const amountHTRaw: any = (payload as any).amountHT ?? (payload as any).total;
      const amountTTCRaw: any = (payload as any).amountTTC ?? (payload as any).total;
      const taxRaw: any = (payload as any).taxAmount;
      const dateRaw: any = (payload as any).invoiceDate ?? (payload as any).date;
      if (isCreateUpsert) {
        if (amountHTRaw !== undefined && amountHTRaw !== null) {
          const n = toFiniteNumber(amountHTRaw);
          if (!Number.isFinite(n) || n < 0) return "INCOMING_AMOUNT_INVALID";
        }
        if (amountTTCRaw !== undefined && amountTTCRaw !== null) {
          const n = toFiniteNumber(amountTTCRaw);
          if (!Number.isFinite(n) || n < 0) return "INCOMING_AMOUNT_INVALID";
        }
      } else {
        // For update, if amounts provided validate finite
        if (amountHTRaw !== undefined && amountHTRaw !== null) {
          const n = toFiniteNumber(amountHTRaw);
          if (!Number.isFinite(n) || n < 0) return "INCOMING_AMOUNT_INVALID";
        }
        if (amountTTCRaw !== undefined && amountTTCRaw !== null) {
          const n = toFiniteNumber(amountTTCRaw);
          if (!Number.isFinite(n) || n < 0) return "INCOMING_AMOUNT_INVALID";
        }
      }
      if (taxRaw !== undefined && taxRaw !== null) {
        const n = toFiniteNumber(taxRaw);
        if (!Number.isFinite(n) || n < 0) return "INCOMING_AMOUNT_INVALID";
      }
      if (dateRaw !== undefined && dateRaw !== null) {
        const ms = typeof dateRaw === "number" ? dateRaw : new Date(dateRaw as any).getTime();
        if (!Number.isFinite(ms)) return "INVOICE_DATE_INVALID";
      }
      // Also check that if both HT/TTC present, TTC >= HT (business invariant)
      if (amountHTRaw !== undefined && amountTTCRaw !== undefined && amountHTRaw !== null && amountTTCRaw !== null) {
        const ht = toFiniteNumber(amountHTRaw);
        const ttc = toFiniteNumber(amountTTCRaw);
        if (Number.isFinite(ht) && Number.isFinite(ttc) && ttc < ht) return "INCOMING_AMOUNT_INVALID";
      }
      break;
    }
    default:
      break;
  }

  // Generic fallback: reject any remaining NaN/Infinity via !Number.isFinite for numeric fields
  // This ensures Numbers: reject NaN, Infinity, -Infinity via !Number.isFinite even for fields not explicitly validated
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v === "number" && !Number.isFinite(v)) {
      return `${entity.toUpperCase()}_NUMERIC_INVALID`;
    }
    if (typeof v === "string" && (v.trim() === "Infinity" || v.trim() === "-Infinity" || v.trim().toLowerCase() === "nan")) {
      const numericKeys = [
        "amount",
        "total",
        "price",
        "quantity",
        "weightKg",
        "weight",
        "balance",
        "initialBalance",
        "startingSalary",
        "monthlySalary",
        "vatRate",
        "otherTaxRate",
        "deadline",
        "date",
        "birthDate",
        "employmentDate",
        "amountHT",
        "amountTTC",
        "taxAmount",
        "invoiceDate",
      ];
      if (numericKeys.includes(k)) return `${entity.toUpperCase()}_NUMERIC_INVALID`;
    }
  }
  // Also check nested items numbers for purchase/sale if not already handled? purchase/sale already returned above, but keep as defense
  if (entity === "product" || entity === "customer" || entity === "supplier" || entity === "bankAccount" || entity === "worker" || entity === "vehicle" || entity === "task" || entity === "invoiceTaxProfile") {
    // No further nested checks needed; generic above covers top-level
  }

  return null;
}

export async function validateIncomingInvoiceSync(payload: Record<string, unknown>, operation: SyncRequestOperation): Promise<string | null> {
  // Only validate create/upsert/update for incomingInvoice
  if (payload == null || typeof payload !== "object") return "INCOMING_AMOUNT_INVALID";
  const p: any = payload;
  // For update, we may have partial payload; fetch existing to fill missing for validation if needed
  let existing: any = null;
  if (operation.operation === "update") {
    try {
      existing = await IncomingInvoiceModel.findOne({ id: operation.entityId }).lean();
    } catch {}
  }
  const supplierId = p.supplierId ?? existing?.supplierId;
  const supplierInvoiceNumberRaw = p.supplierInvoiceNumber ?? p.number ?? existing?.supplierInvoiceNumber;
  const invoiceDateRaw = p.invoiceDate ?? p.date ?? existing?.invoiceDate;
  const currencyCode = p.currencyCode ?? existing?.currencyCode;
  const amountHTRaw = p.amountHT ?? p.total ?? existing?.amountHT;
  const amountTTCRaw = p.amountTTC ?? p.total ?? existing?.amountTTC ?? p.amountHT ?? existing?.amountHT;
  const taxAmountRaw = p.taxAmount ?? existing?.taxAmount;

  // supplierId must reference existing Supplier (server data)
  if (!supplierId || typeof supplierId !== "string") return "SUPPLIER_NOT_FOUND";
  try {
    const sup = await SupplierModel.findOne({ id: String(supplierId) }).lean();
    if (!sup) return "SUPPLIER_NOT_FOUND";
  } catch {
    return "SUPPLIER_NOT_FOUND";
  }

  // supplierInvoiceNumber trimmed non-empty
  if (supplierInvoiceNumberRaw == null) return "SUPPLIER_INVOICE_NUMBER_REQUIRED";
  const trimmed = String(supplierInvoiceNumberRaw).trim();
  if (!trimmed) return "SUPPLIER_INVOICE_NUMBER_REQUIRED";

  // invoiceDate valid finite
  if (invoiceDateRaw == null) return "INVOICE_DATE_INVALID";
  const ms = typeof invoiceDateRaw === "number" ? invoiceDateRaw : new Date(invoiceDateRaw).getTime();
  if (!Number.isFinite(ms)) return "INVOICE_DATE_INVALID";

  // currencyCode must be exactly one of DA, €, $
  const allowed = ["DA", "€", "$"];
  if (currencyCode != null && String(currencyCode).trim() !== "") {
    if (!allowed.includes(String(currencyCode).trim())) return "INVOICE_CURRENCY_INVALID";
  } else if (operation.operation === "create" || operation.operation === "upsert") {
    // For create, if no currency provided, we will fallback to DA via route, but sync should require explicit valid or fallback? Require valid if missing? Treat missing as not invalid here, will use fallback in direct route, but for sync we check final resolved would be DA so not invalid.
    // However if payload has no currency and existing also none, that's not invalid for our check — allow.
  }
  // If currencyCode provided empty and we are create, fallback would be DA, so not invalid.
  // Only reject if explicit invalid.
  if (currencyCode != null && String(currencyCode).trim() !== "" && !allowed.includes(String(currencyCode).trim())) {
    return "INVOICE_CURRENCY_INVALID";
  }
  // Also if after fallback final would be invalid, but sync payload missing currency should not be rejected here; direct route would fallback to DA.

  // amounts validation
  // For update with partial, use provided or existing
  const htRaw = p.amountHT ?? p.total ?? existing?.amountHT;
  const ttcRaw = p.amountTTC ?? p.total ?? existing?.amountTTC;
  if (htRaw == null || ttcRaw == null) {
    // For create, missing amounts is invalid
    if (operation.operation === "create" || operation.operation === "upsert") return "INCOMING_AMOUNT_INVALID";
    // For update, if not provided, skip amount check
  } else {
    const htNum = Number(htRaw);
    const ttcNum = Number(ttcRaw);
    const taxNum = taxAmountRaw != null ? Number(taxAmountRaw) : (Number.isFinite(htNum) && Number.isFinite(ttcNum) ? ttcNum - htNum : NaN);
    if (!Number.isFinite(htNum) || !Number.isFinite(ttcNum) || (taxAmountRaw != null && !Number.isFinite(taxNum)) || htNum < 0 || ttcNum < 0 || (taxAmountRaw != null && taxNum < 0) || ttcNum < htNum) {
      return "INCOMING_AMOUNT_INVALID";
    }
    if (taxAmountRaw != null && taxNum < 0) return "INCOMING_AMOUNT_INVALID";
  }

  // Duplicate protection: case-insensitive via trim + toLowerCase (normalized companion field)
  try {
    const supplierIdToCheck = String(supplierId);
    const normalizedToCheck = trimmed.toLowerCase();
    // Prefer normalized field (new docs), fallback to case-insensitive regex for legacy docs without normalized
    let dup: any = await IncomingInvoiceModel.findOne({ supplierId: supplierIdToCheck, supplierInvoiceNumberNormalized: normalizedToCheck }).lean();
    if (!dup) {
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      dup = await IncomingInvoiceModel.findOne({ supplierId: supplierIdToCheck, supplierInvoiceNumber: { $regex: `^${escaped}$`, $options: "i" } } as any).lean();
      if (dup && String((dup as any).supplierInvoiceNumber).trim().toLowerCase() !== normalizedToCheck) dup = null;
    }
    if (dup && String((dup as any).id) !== String(operation.entityId)) {
      return "INCOMING_INVOICE_DUPLICATE";
    }
  } catch {}

  return null;
}

export async function processSyncOperation(
  operation: SyncRequestOperation,
): Promise<SyncOperationResult> {
  const opId = operation.operationId;
  if (!opId || typeof opId !== "string") {
    return {
      operationId: opId ?? "unknown",
      entity: operation.entity,
      entityId: operation.entityId,
      operation: operation.operation,
      success: false,
      message: "Missing operationId",
      error: "operationId required",
      retryable: false,
    };
  }

  // Idempotency check
  const existingProcessed = await ProcessedSyncOperationModel.findOne({ operationId: opId });
  if (existingProcessed) {
    const isTerminalFailure = !existingProcessed.success;
    return {
      operationId: opId,
      entity: existingProcessed.entity,
      entityId: existingProcessed.entityId,
      operation: existingProcessed.operation as any,
      success: existingProcessed.success,
      message: existingProcessed.success ? "Already processed" : (existingProcessed.error as string) ?? "Failed before",
      revision: (existingProcessed.revision as number | undefined) ?? undefined,
      canonicalEntity: (existingProcessed.canonicalEntity as unknown) ?? undefined,
      conflict: (existingProcessed.conflict as boolean | undefined) ?? false,
      error: (existingProcessed.error as string | undefined) ?? undefined,
      retryable: isTerminalFailure ? ((existingProcessed as any).retryable ?? false) : undefined,
    };
  }

  let model: SyncModel;
  try {
    model = getSyncModel(operation.entity);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "Unsupported entity";
    const result: SyncOperationResult = {
      operationId: opId,
      entity: operation.entity,
      entityId: operation.entityId,
      operation: operation.operation,
      success: false,
      message: errMsg,
      error: errMsg,
      retryable: false,
    };
    await ProcessedSyncOperationModel.create({
      operationId: opId,
      entity: operation.entity,
      entityId: operation.entityId,
      operation: operation.operation,
      success: false,
      error: errMsg,
      retryable: false,
      processedAt: new Date(),
      clientId: operation.clientId,
    });
    return result;
  }

  const payload =
    operation.payload && typeof operation.payload === "object"
      ? { ...(operation.payload as Record<string, unknown>) }
      : {};

  payload.id = operation.entityId;
  // H.S.H sync path must always set channel="hsh" for notifications
  if (operation.entity === "notification") {
    const p: any = payload;
    if (!p.channel || p.channel !== "hsh") p.channel = "hsh";
  }
  // Incoming invoice: normalize supplierInvoiceNumber via trim + toLowerCase for uniqueness (companion field)
  if (operation.entity === "incomingInvoice") {
    const p: any = payload;
    // Unify `number` alias into canonical supplierInvoiceNumber
    if (p.number != null && (p.supplierInvoiceNumber == null || String(p.supplierInvoiceNumber).trim() === "")) {
      p.supplierInvoiceNumber = p.number;
    }
    if (p.supplierInvoiceNumber != null) {
      const trimmedNum = String(p.supplierInvoiceNumber).trim();
      if (trimmedNum) {
        p.supplierInvoiceNumber = trimmedNum;
        p.supplierInvoiceNumberNormalized = trimmedNum.toLowerCase();
      }
    }
  }

  // Size safety for Office files (several MB per file, documented limit)
  if (operation.entity === "officeFile") {
    try {
      const content = (payload as any).content;
      if (content) {
        const size = JSON.stringify(content).length;
        const MAX = 5 * 1024 * 1024;
        if (size > MAX) {
          const err = `Office file content too large (${size} > ${MAX})`;
          await ProcessedSyncOperationModel.create({
            operationId: opId,
            entity: operation.entity,
            entityId: operation.entityId,
            operation: operation.operation,
            success: false,
            error: err,
            retryable: false,
            processedAt: new Date(),
            clientId: operation.clientId,
          });
          return {
            operationId: opId,
            entity: operation.entity,
            entityId: operation.entityId,
            operation: operation.operation,
            success: false,
            message: err,
            error: err,
            retryable: false,
          };
        }
      }
      const title = (payload as any).title;
      if (title && typeof title === "string" && title.length > 200) {
        const err = "Title too long";
        await ProcessedSyncOperationModel.create({
          operationId: opId,
          entity: operation.entity,
          entityId: operation.entityId,
          operation: operation.operation,
          success: false,
          error: err,
          retryable: false,
          processedAt: new Date(),
          clientId: operation.clientId,
        });
        return {
          operationId: opId,
          entity: operation.entity,
          entityId: operation.entityId,
          operation: operation.operation,
          success: false,
          message: err,
          error: err,
          retryable: false,
        };
      }
      // Validate linkedEntities structure
      const linked = (payload as any).linkedEntities;
      if (linked !== undefined && !Array.isArray(linked)) {
        const err = "Invalid linkedEntities";
        await ProcessedSyncOperationModel.create({
          operationId: opId,
          entity: operation.entity,
          entityId: operation.entityId,
          operation: operation.operation,
          success: false,
          error: err,
          retryable: false,
          processedAt: new Date(),
          clientId: operation.clientId,
        });
        return {
          operationId: opId,
          entity: operation.entity,
          entityId: operation.entityId,
          operation: operation.operation,
          success: false,
          message: err,
          error: err,
          retryable: false,
        };
      }
    } catch (e) {
      // If validation itself fails, treat as terminal
      const err = e instanceof Error ? e.message : "Validation error";
      return {
        operationId: opId,
        entity: operation.entity,
        entityId: operation.entityId,
        operation: operation.operation,
        success: false,
        message: err,
        error: err,
        retryable: false,
      };
    }
  }

  // IncomingInvoice generic sync validation — mirror POST /api/invoices/incoming
  if (operation.entity === "incomingInvoice" && (operation.operation === "create" || operation.operation === "upsert" || operation.operation === "update")) {
    const syncErr = await validateIncomingInvoiceSync(payload as Record<string, unknown>, operation);
    if (syncErr) {
      await ProcessedSyncOperationModel.create({
        operationId: opId,
        entity: operation.entity,
        entityId: operation.entityId,
        operation: operation.operation,
        success: false,
        error: syncErr,
        retryable: false,
        processedAt: new Date(),
        clientId: operation.clientId,
      });
      return {
        operationId: opId,
        entity: operation.entity,
        entityId: operation.entityId,
        operation: operation.operation,
        success: false,
        message: syncErr,
        error: syncErr,
        retryable: false,
      };
    }
  }

  // SERVER-SIDE H.S.H sync validation layer — hook before generic create/upsert/update
  // Do not change R.V.B behavior: scope check via HSH_SYNC_ENTITIES inside validateHshPayload
  if (operation.operation === "create" || operation.operation === "upsert" || operation.operation === "update") {
    const hshErr = validateHshPayload(operation.entity, payload as Record<string, unknown>, operation.operation);
    if (hshErr) {
      await ProcessedSyncOperationModel.create({
        operationId: opId,
        entity: operation.entity,
        entityId: operation.entityId,
        operation: operation.operation,
        success: false,
        error: hshErr,
        retryable: false,
        processedAt: new Date(),
        clientId: operation.clientId,
      });
      return {
        operationId: opId,
        entity: operation.entity,
        entityId: operation.entityId,
        operation: operation.operation,
        success: false,
        message: hshErr,
        error: hshErr,
        retryable: false,
      };
    }
  }

  // Ensure payload does not contain server-controlled fields that client shouldn't set arbitrarily
  // but we will set serverRevision ourselves

  let conflict = false;
  let revision: number | undefined;
  let canonical: any = undefined;

  // Use MongoDB transaction for atomic business + change log + idempotency
  const session = await mongoose.startSession();
  try {
    let result: SyncOperationResult | null = null;
    await session.withTransaction(async () => {
      // Re-check idempotency inside transaction
      const existingProcessedTx = await (ProcessedSyncOperationModel as any).findOne({ operationId: opId }).session(session);
      if (existingProcessedTx) {
        const isTerminalFailureTx = !existingProcessedTx.success;
        result = {
          operationId: opId,
          entity: existingProcessedTx.entity,
          entityId: existingProcessedTx.entityId,
          operation: existingProcessedTx.operation as any,
          success: existingProcessedTx.success,
          message: existingProcessedTx.success ? "Already processed" : (existingProcessedTx.error as string) ?? "Failed before",
          revision: (existingProcessedTx.revision as number | undefined) ?? undefined,
          canonicalEntity: (existingProcessedTx.canonicalEntity as unknown) ?? undefined,
          conflict: (existingProcessedTx.conflict as boolean | undefined) ?? false,
          error: (existingProcessedTx.error as string | undefined) ?? undefined,
          retryable: isTerminalFailureTx ? ((existingProcessedTx as any).retryable ?? false) : undefined,
        };
        return;
      }

      if (operation.operation === "create") {
        // INVOICE_IMMUTABLE: generic sync may create DRAFT only
        if (operation.entity === "invoice") {
          const st = (payload as any).status;
          if (st && st !== "DRAFT") {
            const err = "INVOICE_IMMUTABLE: generic sync may create DRAFT only";
            await ProcessedSyncOperationModel.create(
              [{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }],
              { session }
            );
            result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
            return;
          }
        }
        // Defense-in-depth: for notifications, check sourceEventId deduplication before id check - H.S.H only channel=hsh
        if (operation.entity === "notification" && (payload as any).sourceEventId) {
          const existingBySource = await (model as any).findOne({ channel: "hsh", sourceEventId: (payload as any).sourceEventId }).session(session as any);
          if (existingBySource) {
            canonical = existingBySource;
            revision = (existingBySource as any).serverRevision ?? 0;
            result = {
              operationId: opId,
              entity: operation.entity,
              entityId: (existingBySource as any).id,
              operation: operation.operation,
              success: true,
              message: "Notification already exists for sourceEventId.",
              revision,
              canonicalEntity: canonical,
              conflict: false,
            };
            await ProcessedSyncOperationModel.create(
              [
                {
                  operationId: opId,
                  entity: operation.entity,
                  entityId: operation.entityId,
                  operation: operation.operation,
                  success: true,
                  revision,
                  canonicalEntity: canonical,
                  conflict: false,
                  processedAt: new Date(),
                  clientId: operation.clientId,
                },
              ],
              { session },
            );
            return;
          }
        }
        const existing = await (model as any).findOne({ id: operation.entityId }).session(session as any);
        if (existing) {
          const existingRevision = (existing as any).serverRevision ?? 0;
          canonical = existing;
          revision = existingRevision;
          result = {
            operationId: opId,
            entity: operation.entity,
            entityId: operation.entityId,
            operation: operation.operation,
            success: true,
            message: "Entity already exists.",
            revision,
            canonicalEntity: canonical,
            conflict: false,
          };
          await ProcessedSyncOperationModel.create(
            [
              {
                operationId: opId,
                entity: operation.entity,
                entityId: operation.entityId,
                operation: operation.operation,
                success: true,
                revision,
                canonicalEntity: canonical,
                conflict: false,
                processedAt: new Date(),
                clientId: operation.clientId,
              },
            ],
            { session },
          );
          return;
        }
        // No global conflict check for create (only entity-specific, but create has no existing)
        revision = await getNextRevision(session);
        const toCreate: Record<string, unknown> = {
          ...payload,
          serverRevision: revision,
          syncStatus: "synced",
          lastSyncedAt: Date.now(),
          updatedAt: (payload as any).updatedAt ?? Date.now(),
          createdAt: (payload as any).createdAt ?? Date.now(),
        };
        const created = await (model as any).create([toCreate], { session });
        canonical = created[0] ?? toCreate;
        await SyncChangeModel.create(
          [
            {
              revision,
              entity: operation.entity,
              entityId: operation.entityId,
              operation: "create",
              payload: canonical,
              changedAt: new Date(),
              sourceClientId: operation.clientId,
              operationId: opId,
            },
          ],
          { session },
        );
        await ProcessedSyncOperationModel.create(
          [
            {
              operationId: opId,
              entity: operation.entity,
              entityId: operation.entityId,
              operation: operation.operation,
              success: true,
              revision,
              canonicalEntity: canonical,
              conflict: false,
              processedAt: new Date(),
              clientId: operation.clientId,
            },
          ],
          { session },
        );
        result = {
          operationId: opId,
          entity: operation.entity,
          entityId: operation.entityId,
          operation: operation.operation,
          success: true,
          message: "Entity created.",
          revision,
          canonicalEntity: canonical,
          conflict,
        };
        return;
      }

      if (operation.operation === "upsert") {
        const existingUpsert: any = await (model as any).findOne({ id: operation.entityId }).session(session as any);
        if (existingUpsert) {
          // INVOICE_IMMUTABLE: reject generic mutations on ISSUED/CANCELLED and DRAFT->ISSUED/CANCELLED transitions
          if (operation.entity === "invoice") {
            const srvStatus = (existingUpsert as any).status;
            const reqStatus = (payload as any).status;
            if (srvStatus === "ISSUED" || srvStatus === "CANCELLED") {
              const err = "INVOICE_IMMUTABLE: cannot mutate issued/cancelled invoice via generic sync";
              await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
              result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
              return;
            }
            if ((srvStatus === "DRAFT" || !srvStatus) && reqStatus && reqStatus !== "DRAFT") {
              const err = "INVOICE_IMMUTABLE: generic sync cannot transition DRAFT -> ISSUED/CANCELLED";
              await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
              result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
              return;
            }
          }
          const existingRev = (existingUpsert as any).serverRevision ?? 0;
          if (operation.baseRevision !== undefined && operation.baseRevision < existingRev) {
            conflict = true;
          }
          revision = await getNextRevision(session);
          const toSet: Record<string, unknown> = {
            ...payload,
            serverRevision: revision,
            syncStatus: "synced",
            lastSyncedAt: Date.now(),
            updatedAt: Date.now(),
          };
          delete (toSet as any).id;
          // Explicit validation already done via validateHshPayload; runValidators ensures schema enforcement as defense-in-depth
          await (model as any).updateOne({ id: operation.entityId }, { $set: toSet }, { session, runValidators: true } as any);
          const updated = await (model as any).findOne({ id: operation.entityId }).session(session as any);
          canonical = updated ?? { ...existingUpsert, ...toSet, id: operation.entityId };
          await SyncChangeModel.create(
            [
              {
                revision,
                entity: operation.entity,
                entityId: operation.entityId,
                operation: "update",
                payload: canonical,
                changedAt: new Date(),
                sourceClientId: operation.clientId,
                operationId: opId,
              },
            ],
            { session },
          );
          await ProcessedSyncOperationModel.create(
            [
              {
                operationId: opId,
                entity: operation.entity,
                entityId: operation.entityId,
                operation: operation.operation,
                success: true,
                revision,
                canonicalEntity: canonical,
                conflict,
                processedAt: new Date(),
                clientId: operation.clientId,
              },
            ],
            { session },
          );
          result = {
            operationId: opId,
            entity: operation.entity,
            entityId: operation.entityId,
            operation: operation.operation,
            success: true,
            message: "Entity upserted (updated).",
            revision,
            canonicalEntity: canonical,
            conflict,
          };
          return;
        } else {
          if (operation.entity === "invoice") {
            const st2 = (payload as any).status;
            if (st2 && st2 !== "DRAFT") {
              const err = "INVOICE_IMMUTABLE: generic sync may create DRAFT only";
              await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
              result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
              return;
            }
          }
          revision = await getNextRevision(session);
          const toCreate: Record<string, unknown> = {
            ...payload,
            serverRevision: revision,
            syncStatus: "synced",
            lastSyncedAt: Date.now(),
            updatedAt: (payload as any).updatedAt ?? Date.now(),
            createdAt: (payload as any).createdAt ?? Date.now(),
          };
          const created = await (model as any).create([toCreate], { session });
          canonical = created[0] ?? toCreate;
          await SyncChangeModel.create(
            [
              {
                revision,
                entity: operation.entity,
                entityId: operation.entityId,
                operation: "create",
                payload: canonical,
                changedAt: new Date(),
                sourceClientId: operation.clientId,
                operationId: opId,
              },
            ],
            { session },
          );
          await ProcessedSyncOperationModel.create(
            [
              {
                operationId: opId,
                entity: operation.entity,
                entityId: operation.entityId,
                operation: operation.operation,
                success: true,
                revision,
                canonicalEntity: canonical,
                conflict: false,
                processedAt: new Date(),
                clientId: operation.clientId,
              },
            ],
            { session },
          );
          result = {
            operationId: opId,
            entity: operation.entity,
            entityId: operation.entityId,
            operation: operation.operation,
            success: true,
            message: "Entity upserted (created).",
            revision,
            canonicalEntity: canonical,
            conflict: false,
          };
          return;
        }
      }

      if (operation.operation === "update") {
        const existing: any = await (model as any).findOne({ id: operation.entityId }).session(session as any);
        if (!existing) {
          const err = "Entity not found.";
          result = {
            operationId: opId,
            entity: operation.entity,
            entityId: operation.entityId,
            operation: operation.operation,
            success: false,
            message: err,
            error: err,
            retryable: false,
          };
          // Only record terminal failure for update-not-found (terminal)
          await ProcessedSyncOperationModel.create(
            [
              {
                operationId: opId,
                entity: operation.entity,
                entityId: operation.entityId,
                operation: operation.operation,
                success: false,
                error: err,
                retryable: false,
                processedAt: new Date(),
                clientId: operation.clientId,
              },
            ],
            { session },
          );
          return;
        }
        // INVOICE_IMMUTABLE checks
        if (operation.entity === "invoice") {
          const srvStatus = (existing as any).status;
          const reqStatus = (payload as any).status;
          if (srvStatus === "ISSUED" || srvStatus === "CANCELLED") {
            const err = "INVOICE_IMMUTABLE: cannot mutate issued/cancelled invoice via generic sync";
            await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
            result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
            return;
          }
          if ((srvStatus === "DRAFT" || !srvStatus) && reqStatus && reqStatus !== "DRAFT") {
            const err = "INVOICE_IMMUTABLE: generic sync cannot transition DRAFT -> ISSUED/CANCELLED";
            await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
            result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
            return;
          }
        }
        const existingRev = (existing as any).serverRevision ?? 0;
        if (operation.baseRevision !== undefined && operation.baseRevision < existingRev) {
          conflict = true;
        }
        revision = await getNextRevision(session);
        const toSet: Record<string, unknown> = {
          ...payload,
          serverRevision: revision,
          syncStatus: "synced",
          lastSyncedAt: Date.now(),
          updatedAt: Date.now(),
        };
        delete (toSet as any).id;
        // Explicit H.S.H validation already ensures finite numbers and business invariants; runValidators as defense-in-depth
        await (model as any).updateOne({ id: operation.entityId }, { $set: toSet }, { session, runValidators: true } as any);
        const updated = await (model as any).findOne({ id: operation.entityId }).session(session as any);
        canonical = updated ?? { ...existing, ...toSet, id: operation.entityId };
        await SyncChangeModel.create(
          [
            {
              revision,
              entity: operation.entity,
              entityId: operation.entityId,
              operation: "update",
              payload: canonical,
              changedAt: new Date(),
              sourceClientId: operation.clientId,
              operationId: opId,
            },
          ],
          { session },
        );
        await ProcessedSyncOperationModel.create(
          [
            {
              operationId: opId,
              entity: operation.entity,
              entityId: operation.entityId,
              operation: operation.operation,
              success: true,
              revision,
              canonicalEntity: canonical,
              conflict,
              processedAt: new Date(),
              clientId: operation.clientId,
            },
          ],
          { session },
        );
        result = {
          operationId: opId,
          entity: operation.entity,
          entityId: operation.entityId,
          operation: operation.operation,
          success: true,
          message: "Entity updated.",
          revision,
          canonicalEntity: canonical,
          conflict,
        };
        return;
      }

      if (operation.operation === "delete") {
        const existing: any = await (model as any).findOne({ id: operation.entityId }).session(session as any);
        if (existing) {
          const existingRev = (existing as any).serverRevision ?? 0;
          if (operation.baseRevision !== undefined && operation.baseRevision < existingRev) {
            conflict = true;
          }
          // INVOICE_IMMUTABLE: only DRAFT may be deleted via generic sync
          if (operation.entity === "invoice") {
            const srvStatus = (existing as any).status;
            if (srvStatus === "ISSUED" || srvStatus === "CANCELLED") {
              const err = "INVOICE_IMMUTABLE: cannot delete issued/cancelled invoice via generic sync";
              await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
              result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
              return;
            }
          }
        }
        revision = await getNextRevision(session);
        await (model as any).deleteOne({ id: operation.entityId }, { session });
        await SyncChangeModel.create(
          [
            {
              revision,
              entity: operation.entity,
              entityId: operation.entityId,
              operation: "delete",
              payload: undefined,
              changedAt: new Date(),
              sourceClientId: operation.clientId,
              operationId: opId,
            },
          ],
          { session },
        );
        await ProcessedSyncOperationModel.create(
          [
            {
              operationId: opId,
              entity: operation.entity,
              entityId: operation.entityId,
              operation: operation.operation,
              success: true,
              revision,
              canonicalEntity: undefined,
              conflict,
              processedAt: new Date(),
              clientId: operation.clientId,
            },
          ],
          { session },
        );
        result = {
          operationId: opId,
          entity: operation.entity,
          entityId: operation.entityId,
          operation: operation.operation,
          success: true,
          message: "Entity deleted.",
          revision,
          conflict,
        };
        return;
      }

      throw new Error("Unsupported sync operation.");
    });
    if (result) return result;
    throw new Error("Transaction did not produce result");
  } catch (error) {
    let errMsg = error instanceof Error ? error.message : "Unknown sync error";
    // Map Mongo duplicate key to stable code for incomingInvoice
    if (operation.entity === "incomingInvoice" && (errMsg.includes("E11000") || errMsg.toLowerCase().includes("duplicate"))) {
      errMsg = "INCOMING_INVOICE_DUPLICATE";
    }
    const transient = errMsg === "INCOMING_INVOICE_DUPLICATE" ? false : isTransientError(error);
    if (!transient) {
      try {
        await ProcessedSyncOperationModel.create({
          operationId: opId,
          entity: operation.entity,
          entityId: operation.entityId,
          operation: operation.operation,
          success: false,
          error: errMsg,
          retryable: false,
          processedAt: new Date(),
          clientId: operation.clientId,
        });
      } catch {}
    }
    return {
      operationId: opId,
      entity: operation.entity,
      entityId: operation.entityId,
      operation: operation.operation,
      success: false,
      message: errMsg,
      error: errMsg,
      retryable: transient,
    };
  } finally {
    try {
      await session.endSession();
    } catch {}
  }
  }

export async function processSyncOperations(
  operations: SyncRequestOperation[],
): Promise<SyncOperationResult[]> {
  const results: SyncOperationResult[] = [];
  for (const operation of operations) {
    results.push(await processSyncOperation(operation));
  }
  return results;
}

export async function getCurrentRevision(): Promise<number> {
  const doc = await SyncCounterModel.findOne({ name: "global" });
  return doc?.revision ?? 0;
}

export async function getChangesAfter(
  after: number,
  limit = 200,
): Promise<{ changes: SyncChange[]; nextRevision: number; hasMore: boolean; currentRevision: number }> {
  const currentRevision = await getCurrentRevision();
  const changes = await SyncChangeModel.find({ revision: { $gt: after } })
    .sort({ revision: 1 })
    .limit(limit)
    .lean();
  const nextRevision = changes.length > 0 ? changes[changes.length - 1].revision : after;
  const hasMore = changes.length === limit && nextRevision < currentRevision;
  // H.S.H sync must exclude R.V.B notifications: filter notification changes to channel=hsh only
  const filtered = changes.filter((c: any) => {
    if (c.entity === "notification") {
      const payload: any = c.payload;
      // Delete ops have no payload – keep them? Only keep if previous payload was hsh? For safety exclude deletes without payload channel check? But deletes for RVB should not leak – they have no payload, we cannot know channel. We conservatively exclude deletes where entity notification and operation delete? However HSH deletes are expected to be hsh. For now keep deletes that are not obviously rvb (payload missing => keep). But if payload has channel and it's not hsh, exclude.
      if (payload && typeof payload === "object" && payload.channel && payload.channel !== "hsh") return false;
      // If payload missing channel but has rvb route/sourceEventId patterns, treat as rvb and exclude?
      if (payload && typeof payload === "object") {
        const route = payload.route as string | undefined;
        const src = payload.sourceEventId as string | undefined;
        if (route && route.startsWith("/rvb")) return false;
        if (src && /^(worker-request:|supplier-request:|customer-request:|customer-order:|chat:)/.test(src)) return false;
      }
      // otherwise keep (hsh)
    }
    return true;
  });
  // Map to SyncChange type
  const mapped: SyncChange[] = filtered.map((c: any) => ({
    revision: c.revision,
    entity: c.entity,
    entityId: c.entityId,
    operation: c.operation,
    payload: c.payload,
    changedAt: c.changedAt,
    sourceClientId: c.sourceClientId,
    operationId: c.operationId,
  }));
  return { changes: mapped, nextRevision, hasMore, currentRevision };
}

export async function getBootstrapData(): Promise<{ changes: SyncChange[]; currentRevision: number }> {
  const currentRevision = await getCurrentRevision();
  // If no SyncChange history, we need to snapshot existing Mongo collections
  const count = await SyncChangeModel.countDocuments();
  if (count === 0) {
    // Seed from existing data: iterate all models and create synthetic changes at revision 0
    // For bootstrap, we will collect all entities and return as creates with revision 0
    // But to avoid huge snapshot, return empty and let client know revision 0
    // Client will then do snapshot via separate bootstrap endpoint that dumps all entities
    return { changes: [], currentRevision };
  }
  const all = await SyncChangeModel.find().sort({ revision: 1 }).lean();
  const mapped: SyncChange[] = all.map((c: any) => ({
    revision: c.revision,
    entity: c.entity,
    entityId: c.entityId,
    operation: c.operation,
    payload: c.payload,
    changedAt: c.changedAt,
    sourceClientId: c.sourceClientId,
    operationId: c.operationId,
  }));
  return { changes: mapped, currentRevision };
}



