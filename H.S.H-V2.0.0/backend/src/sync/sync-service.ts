import mongoose from "mongoose";
import { getModel } from "./model-registry";
import type { SyncRequestOperation, SyncOperationResult, SyncChange } from "./types";
import { SyncCounterModel } from "../models/sync-counter.model";
import { SyncChangeModel } from "../models/sync-change.model";
import { ProcessedSyncOperationModel } from "../models/processed-sync-operation.model";
import { SupplierModel } from "../models/supplier.model";
import { IncomingInvoiceModel } from "../models/incoming-invoice.model";
import { ProductModel } from "../models/product.model";
import { CustomerModel } from "../models/customer.model";
import { BankAccountModel } from "../models/bank-account.model";
import { WorkerModel } from "../models/worker.model";
import { SaleModel } from "../models/sale.model";
import { PurchaseModel } from "../models/purchase.model";
import { PaymentModel } from "../models/payment.model";
import { TransferModel } from "../models/transfer.model";
import { ExpenseModel } from "../models/expense.model";
import { TaskModel } from "../models/task.model";
import { applyLinkedEntityLifecycleToRvbAccount } from "../services/rvb-account.service";

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

async function isTaskNameDuplicateUnfinished(
  session: any,
  trimmedName: string,
  excludeId?: string,
): Promise<boolean> {
  // Only unfinished tasks (status !== "completed") participate. Trim + case-sensitive.
  // Use JS filtering to ensure trimmed comparison and case-sensitive, and to handle missing status (defaults to pending).
  const pending = await TaskModel.find({ status: { $ne: "completed" } })
    .session(session)
    .lean();
  // Also need to consider tasks where status is undefined (not yet set) — they are unfinished and $ne: "completed" includes them, but to be safe also check all if needed
  // For trimmed comparison, stored names are already trimmed via frontend, but we trim again for safety
  return pending.some((t: any) => {
    if (excludeId && String(t.id) === String(excludeId)) return false;
    const storedTrimmed = String(t.name || "").trim();
    return storedTrimmed === trimmedName;
  });
}

export function isTransientError(error: unknown): boolean {
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
  "vehicle",
  "worker",
  "expense",
  "task",
  "purchase",
  "sale",
  "payment",
  "transfer",
  "injuryEquation",
  "settings",
  "notification",
  "invoice",
  "invoiceSellerProfile",
  "invoiceTaxProfile",
  "incomingInvoice",
  "officeFile",
]);

function linkedPortalLifecycleAction(entity: string, before: unknown, after: unknown): "archive" | "restore" | null {
  if (!HSH_SYNC_ENTITIES.has(entity) || !["worker", "supplier", "customer"].includes(entity)) return null;
  if (before === "active" && after === "archived") return "archive";
  if (before === "archived" && after === "active") return "restore";
  return null;
}

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

async function checkStaleCrossClient(
  session: any,
  operation: SyncRequestOperation,
  existingRev: number,
): Promise<boolean> {
  // P0 Fix: reject ALL stale revisions regardless of clientId.
  // Sequential local intent must be handled by client coalescing + successor rebasing, not server bypass.
  if (operation.baseRevision === undefined) return false;
  if (operation.baseRevision >= existingRev) return false;
  return true;
}

async function handleSaleCreate(session: any, payload: Record<string, unknown>, clientId: string): Promise<string | null> {
  const items: any[] = (payload as any).items;
  const customerId = String((payload as any).customerId);
  const cust = await CustomerModel.findOne({ id: customerId }).session(session);
  if (!cust) return "CUSTOMER_NOT_FOUND";
  const agg = new Map<string, { qty: number; weight: number }>();
  for (const it of items) {
    const pid = String(it.productId);
    const cur = agg.get(pid) || { qty: 0, weight: 0 };
    cur.qty += Number(it.quantity);
    cur.weight += Number(it.weightKg);
    agg.set(pid, cur);
  }
  for (const [pid, need] of agg) {
    const prod: any = await ProductModel.findOne({ id: pid }).session(session);
    if (!prod) return `PRODUCT_NOT_FOUND:${pid}`;
    if (prod.quantity < need.qty) return "INSUFFICIENT_STOCK";
    if (prod.weightKg < need.weight) return "INSUFFICIENT_STOCK";
  }
  const total = roundMoney(Number((payload as any).total));
  for (const [pid, need] of agg) {
    await ProductModel.updateOne({ id: pid }, { $inc: { quantity: -need.qty, weightKg: -need.weight } }, { session });
    const prodAfter: any = await ProductModel.findOne({ id: pid }).session(session);
    const rev = await getNextRevision(session);
    await ProductModel.updateOne({ id: pid }, { $set: { serverRevision: rev, syncStatus: "synced", lastSyncedAt: Date.now() } }, { session });
    await SyncChangeModel.create([{ revision: rev, entity: "product", entityId: pid, operation: "update", payload: prodAfter, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  }
  await CustomerModel.updateOne({ id: customerId }, { $inc: { balance: total } }, { session });
  const custAfter: any = await CustomerModel.findOne({ id: customerId }).session(session);
  const revC = await getNextRevision(session);
  await CustomerModel.updateOne({ id: customerId }, { $set: { serverRevision: revC, syncStatus: "synced", lastSyncedAt: Date.now() } }, { session });
  await SyncChangeModel.create([{ revision: revC, entity: "customer", entityId: customerId, operation: "update", payload: custAfter, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  return null;
}

async function handlePurchaseCreate(session: any, payload: Record<string, unknown>, clientId: string): Promise<string | null> {
  const items: any[] = (payload as any).items;
  const supplierId = String((payload as any).supplierId);
  const sup = await SupplierModel.findOne({ id: supplierId }).session(session);
  if (!sup) return "SUPPLIER_NOT_FOUND";
  const total = roundMoney(Number((payload as any).total));
  const agg = new Map<string, { qty: number; weight: number }>();
  for (const it of items) {
    const pid = String(it.productId);
    const cur = agg.get(pid) || { qty: 0, weight: 0 };
    cur.qty += Number(it.quantity);
    cur.weight += Number(it.weightKg);
    agg.set(pid, cur);
  }
  for (const [pid, need] of agg) {
    const prod: any = await ProductModel.findOne({ id: pid }).session(session);
    if (!prod) return `PRODUCT_NOT_FOUND:${pid}`;
    await ProductModel.updateOne({ id: pid }, { $inc: { quantity: need.qty, weightKg: need.weight } }, { session });
    const prodAfter: any = await ProductModel.findOne({ id: pid }).session(session);
    const rev = await getNextRevision(session);
    await ProductModel.updateOne({ id: pid }, { $set: { serverRevision: rev } }, { session });
    await SyncChangeModel.create([{ revision: rev, entity: "product", entityId: pid, operation: "update", payload: prodAfter, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  }
  await SupplierModel.updateOne({ id: supplierId }, { $inc: { balance: total } }, { session });
  const supAfter: any = await SupplierModel.findOne({ id: supplierId }).session(session);
  const revS = await getNextRevision(session);
  await SupplierModel.updateOne({ id: supplierId }, { $set: { serverRevision: revS } }, { session });
  await SyncChangeModel.create([{ revision: revS, entity: "supplier", entityId: supplierId, operation: "update", payload: supAfter, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  return null;
}

async function handlePaymentCreate(session: any, payload: Record<string, unknown>, clientId: string): Promise<string | null> {
  const amount = roundMoney(Number((payload as any).amount));
  const accountId = String((payload as any).accountId);
  const entityId = String((payload as any).entityId);
  const entityType = String((payload as any).entityType);
  const acc: any = await BankAccountModel.findOne({ id: accountId }).session(session);
  if (!acc) return "ACCOUNT_NOT_FOUND";
  // Bank funds check is directional: only outgoing requires bank funds. Customer incoming receives funds.
  if (entityType === "supplier") {
    if (acc.balance < amount) return "INSUFFICIENT_BANK_BALANCE";
    const sup: any = await SupplierModel.findOne({ id: entityId }).session(session);
    if (!sup) return "SUPPLIER_NOT_FOUND";
    if (sup.balance < amount) return "INSUFFICIENT_SUPPLIER_BALANCE";
    await SupplierModel.updateOne({ id: entityId }, { $inc: { balance: -amount } }, { session });
    await BankAccountModel.updateOne({ id: accountId }, { $inc: { balance: -amount } }, { session });
    const supAfter: any = await SupplierModel.findOne({ id: entityId }).session(session);
    const accAfter: any = await BankAccountModel.findOne({ id: accountId }).session(session);
    const rev1 = await getNextRevision(session);
    await SupplierModel.updateOne({ id: entityId }, { $set: { serverRevision: rev1 } }, { session });
    await SyncChangeModel.create([{ revision: rev1, entity: "supplier", entityId, operation: "update", payload: supAfter, changedAt: new Date(), sourceClientId: clientId } as any], { session });
    const rev2 = await getNextRevision(session);
    await BankAccountModel.updateOne({ id: accountId }, { $set: { serverRevision: rev2 } }, { session });
    await SyncChangeModel.create([{ revision: rev2, entity: "bankAccount", entityId: accountId, operation: "update", payload: accAfter, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  } else if (entityType === "customer") {
    const cust: any = await CustomerModel.findOne({ id: entityId }).session(session);
    if (!cust) return "CUSTOMER_NOT_FOUND";
    if (cust.balance < amount) return "INSUFFICIENT_CUSTOMER_BALANCE";
    // Incoming: Bank receives funds, no bank balance check required
    await CustomerModel.updateOne({ id: entityId }, { $inc: { balance: -amount } }, { session });
    await BankAccountModel.updateOne({ id: accountId }, { $inc: { balance: amount } }, { session });
    const custAfter: any = await CustomerModel.findOne({ id: entityId }).session(session);
    const accAfter: any = await BankAccountModel.findOne({ id: accountId }).session(session);
    const rev1 = await getNextRevision(session);
    await CustomerModel.updateOne({ id: entityId }, { $set: { serverRevision: rev1 } }, { session });
    await SyncChangeModel.create([{ revision: rev1, entity: "customer", entityId, operation: "update", payload: custAfter, changedAt: new Date(), sourceClientId: clientId } as any], { session });
    const rev2 = await getNextRevision(session);
    await BankAccountModel.updateOne({ id: accountId }, { $set: { serverRevision: rev2 } }, { session });
    await SyncChangeModel.create([{ revision: rev2, entity: "bankAccount", entityId: accountId, operation: "update", payload: accAfter, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  } else if (entityType === "worker") {
    if (acc.balance < amount) return "INSUFFICIENT_BANK_BALANCE";
    const { WorkerModel } = await import("../models/worker.model");
    const w: any = await WorkerModel.findOne({ id: entityId }).session(session);
    if (!w) return "WORKER_NOT_FOUND";
    if (w.status !== "active") return "WORKER_ARCHIVED";
    if (w.balance < amount) return "INSUFFICIENT_WORKER_BALANCE";
    await WorkerModel.updateOne({ id: entityId }, { $inc: { balance: -amount } }, { session });
    await BankAccountModel.updateOne({ id: accountId }, { $inc: { balance: -amount } }, { session });
    const wAfter: any = await WorkerModel.findOne({ id: entityId }).session(session);
    const accAfter: any = await BankAccountModel.findOne({ id: accountId }).session(session);
    const rev1 = await getNextRevision(session);
    await WorkerModel.updateOne({ id: entityId }, { $set: { serverRevision: rev1 } }, { session });
    await SyncChangeModel.create([{ revision: rev1, entity: "worker", entityId, operation: "update", payload: wAfter, changedAt: new Date(), sourceClientId: clientId } as any], { session });
    const rev2 = await getNextRevision(session);
    await BankAccountModel.updateOne({ id: accountId }, { $set: { serverRevision: rev2 } }, { session });
    await SyncChangeModel.create([{ revision: rev2, entity: "bankAccount", entityId: accountId, operation: "update", payload: accAfter, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  } else if (entityType === "expense") {
    if (acc.balance < amount) return "INSUFFICIENT_BANK_BALANCE";
    await BankAccountModel.updateOne({ id: accountId }, { $inc: { balance: -amount } }, { session });
    const accAfter: any = await BankAccountModel.findOne({ id: accountId }).session(session);
    const rev = await getNextRevision(session);
    await BankAccountModel.updateOne({ id: accountId }, { $set: { serverRevision: rev } }, { session });
    await SyncChangeModel.create([{ revision: rev, entity: "bankAccount", entityId: accountId, operation: "update", payload: accAfter, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  } else return "PAYMENT_TYPE_INVALID";
  return null;
}

async function handleTransferCreate(session: any, payload: Record<string, unknown>, clientId: string): Promise<string | null> {
  const amount = roundMoney(Number((payload as any).amount));
  const fromId = String((payload as any).fromAccountId);
  const toId = String((payload as any).toAccountId);
  if (fromId === toId) return "TRANSFER_ACCOUNTS_SAME";
  const from: any = await BankAccountModel.findOne({ id: fromId }).session(session);
  const to: any = await BankAccountModel.findOne({ id: toId }).session(session);
  if (!from) return "ACCOUNT_NOT_FOUND";
  if (!to) return "ACCOUNT_NOT_FOUND";
  if (from.balance < amount) return "INSUFFICIENT_BANK_BALANCE";
  await BankAccountModel.updateOne({ id: fromId }, { $inc: { balance: -amount } }, { session });
  await BankAccountModel.updateOne({ id: toId }, { $inc: { balance: amount } }, { session });
  const fromAfter: any = await BankAccountModel.findOne({ id: fromId }).session(session);
  const toAfter: any = await BankAccountModel.findOne({ id: toId }).session(session);
  const rev1 = await getNextRevision(session);
  await BankAccountModel.updateOne({ id: fromId }, { $set: { serverRevision: rev1 } }, { session });
  await SyncChangeModel.create([{ revision: rev1, entity: "bankAccount", entityId: fromId, operation: "update", payload: fromAfter, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  const rev2 = await getNextRevision(session);
  await BankAccountModel.updateOne({ id: toId }, { $set: { serverRevision: rev2 } }, { session });
  await SyncChangeModel.create([{ revision: rev2, entity: "bankAccount", entityId: toId, operation: "update", payload: toAfter, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  return null;
}

// ---------------------------------------------------------------------------
// Server-authoritative handlers for Sale/Purchase/Payment update/delete
// Pass 6 spec P0 — must use session, getNextRevision, SyncChangeModel, validate via validatePurchaseSalePayload
// ---------------------------------------------------------------------------

function aggregateItems(items: any[]): Map<string, { qty: number; weight: number }> {
  const agg = new Map<string, { qty: number; weight: number }>();
  for (const it of items) {
    const pid = String((it as any).productId);
    const cur = agg.get(pid) || { qty: 0, weight: 0 };
    cur.qty += Number((it as any).quantity);
    cur.weight += Number((it as any).weightKg ?? (it as any).weight ?? 0);
    agg.set(pid, cur);
  }
  return agg;
}

async function handleSaleUpdate(session: any, existingSale: any, payload: Record<string, unknown>, clientId: string): Promise<string | null> {
  const old: any = (existingSale as any).toObject ? (existingSale as any).toObject() : { ...(existingSale as any) };
  const candidate: any = { ...old, ...payload };
  candidate.id = old.id;
  const vErr = validatePurchaseSalePayload(candidate, "create", "sale");
  if (vErr) return vErr;
  const oldAgg = aggregateItems((old.items as any[]) || []);
  const newAgg = aggregateItems((candidate.items as any[]) || []);
  const oldTotal = roundMoney(Number(old.total));
  const newTotal = roundMoney(Number(candidate.total));
  const oldCustomerId = String(old.customerId);
  const newCustomerId = String(candidate.customerId);
  const oldCust: any = await CustomerModel.findOne({ id: oldCustomerId }).session(session);
  if (!oldCust) return "CUSTOMER_NOT_FOUND";
  if (!Number.isFinite(oldCust.balance) || oldCust.balance < oldTotal) return "INSUFFICIENT_CUSTOMER_BALANCE";
  let newCust: any = null;
  if (newCustomerId === oldCustomerId) newCust = oldCust;
  else {
    newCust = await CustomerModel.findOne({ id: newCustomerId }).session(session);
    if (!newCust) return "CUSTOMER_NOT_FOUND";
    if (!Number.isFinite(newCust.balance)) return "CUSTOMER_BALANCE_INVALID";
  }
  const allPids = new Set<string>([...oldAgg.keys(), ...newAgg.keys()]);
  const productCache = new Map<string, any>();
  for (const pid of allPids) {
    const prod: any = await ProductModel.findOne({ id: pid }).session(session);
    if (!prod) return `PRODUCT_NOT_FOUND:${pid}`;
    if (!Number.isFinite(prod.quantity) || !Number.isFinite(prod.weightKg)) return `PRODUCT_NOT_FOUND:${pid}`;
    productCache.set(pid, prod);
  }
  for (const [pid, need] of newAgg.entries()) {
    const prod: any = productCache.get(pid);
    const oldNeed = oldAgg.get(pid);
    const restoredQty = prod.quantity + (oldNeed?.qty ?? 0);
    const restoredWeight = prod.weightKg + (oldNeed?.weight ?? 0);
    if (restoredQty < need.qty) return "INSUFFICIENT_STOCK";
    if (restoredWeight < need.weight) return "INSUFFICIENT_STOCK";
  }
  for (const [pid, need] of oldAgg.entries()) {
    await ProductModel.updateOne({ id: pid }, { $inc: { quantity: need.qty, weightKg: need.weight } }, { session });
  }
  await CustomerModel.updateOne({ id: oldCustomerId }, { $inc: { balance: -oldTotal } }, { session });
  for (const [pid, need] of newAgg.entries()) {
    await ProductModel.updateOne({ id: pid }, { $inc: { quantity: -need.qty, weightKg: -need.weight } }, { session });
  }
  await CustomerModel.updateOne({ id: newCustomerId }, { $inc: { balance: newTotal } }, { session });
  for (const pid of allPids) {
    const prodAfter: any = await ProductModel.findOne({ id: pid }).session(session);
    const rev = await getNextRevision(session);
    await ProductModel.updateOne({ id: pid }, { $set: { serverRevision: rev, syncStatus: "synced", lastSyncedAt: Date.now() } }, { session });
    const prodAfterWithRev: any = await ProductModel.findOne({ id: pid }).session(session);
    await SyncChangeModel.create([{ revision: rev, entity: "product", entityId: pid, operation: "update", payload: prodAfterWithRev, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  }
  const custIds = new Set<string>([oldCustomerId, newCustomerId]);
  for (const cid of custIds) {
    const custAfter: any = await CustomerModel.findOne({ id: cid }).session(session);
    const rev = await getNextRevision(session);
    await CustomerModel.updateOne({ id: cid }, { $set: { serverRevision: rev, syncStatus: "synced", lastSyncedAt: Date.now() } }, { session });
    const custAfterWithRev: any = await CustomerModel.findOne({ id: cid }).session(session);
    await SyncChangeModel.create([{ revision: rev, entity: "customer", entityId: cid, operation: "update", payload: custAfterWithRev, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  }
  const now = Date.now();
  const saleRev = await getNextRevision(session);
  const toSet: Record<string, unknown> = { ...candidate, serverRevision: saleRev, syncStatus: "synced", lastSyncedAt: now, updatedAt: now };
  delete (toSet as any).id;
  delete (toSet as any)._id;
  delete (toSet as any).__v;
  await SaleModel.updateOne({ id: old.id }, { $set: toSet }, { session });
  const saleAfter: any = await SaleModel.findOne({ id: old.id }).session(session);
  await SyncChangeModel.create([{ revision: saleRev, entity: "sale", entityId: old.id, operation: "update", payload: saleAfter, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  return null;
}

async function handleSaleDelete(session: any, existingSale: any, clientId: string): Promise<string | null> {
  const old: any = (existingSale as any).toObject ? (existingSale as any).toObject() : { ...(existingSale as any) };
  const oldAgg = aggregateItems((old.items as any[]) || []);
  const oldTotal = roundMoney(Number(old.total));
  const oldCustomerId = String(old.customerId);
  const cust: any = await CustomerModel.findOne({ id: oldCustomerId }).session(session);
  if (!cust) return "CUSTOMER_NOT_FOUND";
  if (cust.balance < oldTotal) return "INSUFFICIENT_CUSTOMER_BALANCE";
  for (const pid of oldAgg.keys()) {
    const prod: any = await ProductModel.findOne({ id: pid }).session(session);
    if (!prod) return `PRODUCT_NOT_FOUND:${pid}`;
  }
  for (const [pid, need] of oldAgg.entries()) {
    await ProductModel.updateOne({ id: pid }, { $inc: { quantity: need.qty, weightKg: need.weight } }, { session });
  }
  await CustomerModel.updateOne({ id: oldCustomerId }, { $inc: { balance: -oldTotal } }, { session });
  await SaleModel.deleteOne({ id: old.id }, { session });
  for (const pid of oldAgg.keys()) {
    const prodAfter: any = await ProductModel.findOne({ id: pid }).session(session);
    const rev = await getNextRevision(session);
    await ProductModel.updateOne({ id: pid }, { $set: { serverRevision: rev, syncStatus: "synced", lastSyncedAt: Date.now() } }, { session });
    const prodAfterWithRev: any = await ProductModel.findOne({ id: pid }).session(session);
    await SyncChangeModel.create([{ revision: rev, entity: "product", entityId: pid, operation: "update", payload: prodAfterWithRev, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  }
  {
    const custAfter: any = await CustomerModel.findOne({ id: oldCustomerId }).session(session);
    const rev = await getNextRevision(session);
    await CustomerModel.updateOne({ id: oldCustomerId }, { $set: { serverRevision: rev, syncStatus: "synced", lastSyncedAt: Date.now() } }, { session });
    const custAfterWithRev: any = await CustomerModel.findOne({ id: oldCustomerId }).session(session);
    await SyncChangeModel.create([{ revision: rev, entity: "customer", entityId: oldCustomerId, operation: "update", payload: custAfterWithRev, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  }
  const revDel = await getNextRevision(session);
  await SyncChangeModel.create([{ revision: revDel, entity: "sale", entityId: old.id, operation: "delete", payload: undefined, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  return null;
}

async function handlePurchaseUpdate(session: any, existingPurchase: any, payload: Record<string, unknown>, clientId: string): Promise<string | null> {
  const old: any = (existingPurchase as any).toObject ? (existingPurchase as any).toObject() : { ...(existingPurchase as any) };
  const candidate: any = { ...old, ...payload };
  candidate.id = old.id;
  const vErr = validatePurchaseSalePayload(candidate, "create", "purchase");
  if (vErr) return vErr;
  const oldAgg = aggregateItems((old.items as any[]) || []);
  const newAgg = aggregateItems((candidate.items as any[]) || []);
  const oldTotal = roundMoney(Number(old.total));
  const newTotal = roundMoney(Number(candidate.total));
  const oldSupplierId = String(old.supplierId);
  const newSupplierId = String(candidate.supplierId);
  const oldSup: any = await SupplierModel.findOne({ id: oldSupplierId }).session(session);
  if (!oldSup) return "SUPPLIER_NOT_FOUND";
  if (!Number.isFinite(oldSup.balance) || oldSup.balance < oldTotal) return "INSUFFICIENT_SUPPLIER_BALANCE";
  for (const [pid, need] of oldAgg.entries()) {
    const prod: any = await ProductModel.findOne({ id: pid }).session(session);
    if (!prod) return `PRODUCT_NOT_FOUND:${pid}`;
    if (prod.quantity < need.qty) return "INSUFFICIENT_STOCK";
    if (prod.weightKg < need.weight) return "INSUFFICIENT_STOCK";
  }
  let newSup: any = null;
  if (newSupplierId === oldSupplierId) newSup = oldSup;
  else {
    newSup = await SupplierModel.findOne({ id: newSupplierId }).session(session);
    if (!newSup) return "SUPPLIER_NOT_FOUND";
  }
  for (const pid of newAgg.keys()) {
    if (!oldAgg.has(pid)) {
      const prod: any = await ProductModel.findOne({ id: pid }).session(session);
      if (!prod) return `PRODUCT_NOT_FOUND:${pid}`;
    }
  }
  await SupplierModel.updateOne({ id: oldSupplierId }, { $inc: { balance: -oldTotal } }, { session });
  for (const [pid, need] of oldAgg.entries()) {
    await ProductModel.updateOne({ id: pid }, { $inc: { quantity: -need.qty, weightKg: -need.weight } }, { session });
  }
  for (const [pid, need] of newAgg.entries()) {
    await ProductModel.updateOne({ id: pid }, { $inc: { quantity: need.qty, weightKg: need.weight } }, { session });
  }
  await SupplierModel.updateOne({ id: newSupplierId }, { $inc: { balance: newTotal } }, { session });
  const allPids = new Set<string>([...oldAgg.keys(), ...newAgg.keys()]);
  for (const pid of allPids) {
    const prodAfter: any = await ProductModel.findOne({ id: pid }).session(session);
    const rev = await getNextRevision(session);
    await ProductModel.updateOne({ id: pid }, { $set: { serverRevision: rev, syncStatus: "synced", lastSyncedAt: Date.now() } }, { session });
    const prodAfterWithRev: any = await ProductModel.findOne({ id: pid }).session(session);
    await SyncChangeModel.create([{ revision: rev, entity: "product", entityId: pid, operation: "update", payload: prodAfterWithRev, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  }
  const supIds = new Set<string>([oldSupplierId, newSupplierId]);
  for (const sid of supIds) {
    const supAfter: any = await SupplierModel.findOne({ id: sid }).session(session);
    const rev = await getNextRevision(session);
    await SupplierModel.updateOne({ id: sid }, { $set: { serverRevision: rev, syncStatus: "synced", lastSyncedAt: Date.now() } }, { session });
    const supAfterWithRev: any = await SupplierModel.findOne({ id: sid }).session(session);
    await SyncChangeModel.create([{ revision: rev, entity: "supplier", entityId: sid, operation: "update", payload: supAfterWithRev, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  }
  const now = Date.now();
  const purRev = await getNextRevision(session);
  const toSet: Record<string, unknown> = { ...candidate, serverRevision: purRev, syncStatus: "synced", lastSyncedAt: now, updatedAt: now };
  delete (toSet as any).id;
  delete (toSet as any)._id;
  delete (toSet as any).__v;
  await PurchaseModel.updateOne({ id: old.id }, { $set: toSet }, { session });
  const purAfter: any = await PurchaseModel.findOne({ id: old.id }).session(session);
  await SyncChangeModel.create([{ revision: purRev, entity: "purchase", entityId: old.id, operation: "update", payload: purAfter, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  return null;
}

async function handlePurchaseDelete(session: any, existingPurchase: any, clientId: string): Promise<string | null> {
  const old: any = (existingPurchase as any).toObject ? (existingPurchase as any).toObject() : { ...(existingPurchase as any) };
  const oldAgg = aggregateItems((old.items as any[]) || []);
  const oldTotal = roundMoney(Number(old.total));
  const oldSupplierId = String(old.supplierId);
  const sup: any = await SupplierModel.findOne({ id: oldSupplierId }).session(session);
  if (!sup) return "SUPPLIER_NOT_FOUND";
  if (sup.balance < oldTotal) return "INSUFFICIENT_SUPPLIER_BALANCE";
  for (const [pid, need] of oldAgg.entries()) {
    const prod: any = await ProductModel.findOne({ id: pid }).session(session);
    if (!prod) return `PRODUCT_NOT_FOUND:${pid}`;
    if (prod.quantity < need.qty) return "INSUFFICIENT_STOCK";
    if (prod.weightKg < need.weight) return "INSUFFICIENT_STOCK";
  }
  for (const [pid, need] of oldAgg.entries()) {
    await ProductModel.updateOne({ id: pid }, { $inc: { quantity: -need.qty, weightKg: -need.weight } }, { session });
  }
  await SupplierModel.updateOne({ id: oldSupplierId }, { $inc: { balance: -oldTotal } }, { session });
  await PurchaseModel.deleteOne({ id: old.id }, { session });
  for (const pid of oldAgg.keys()) {
    const prodAfter: any = await ProductModel.findOne({ id: pid }).session(session);
    const rev = await getNextRevision(session);
    await ProductModel.updateOne({ id: pid }, { $set: { serverRevision: rev, syncStatus: "synced", lastSyncedAt: Date.now() } }, { session });
    const prodAfterWithRev: any = await ProductModel.findOne({ id: pid }).session(session);
    await SyncChangeModel.create([{ revision: rev, entity: "product", entityId: pid, operation: "update", payload: prodAfterWithRev, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  }
  {
    const supAfter: any = await SupplierModel.findOne({ id: oldSupplierId }).session(session);
    const rev = await getNextRevision(session);
    await SupplierModel.updateOne({ id: oldSupplierId }, { $set: { serverRevision: rev, syncStatus: "synced", lastSyncedAt: Date.now() } }, { session });
    const supAfterWithRev: any = await SupplierModel.findOne({ id: oldSupplierId }).session(session);
    await SyncChangeModel.create([{ revision: rev, entity: "supplier", entityId: oldSupplierId, operation: "update", payload: supAfterWithRev, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  }
  const revDel = await getNextRevision(session);
  await SyncChangeModel.create([{ revision: revDel, entity: "purchase", entityId: old.id, operation: "delete", payload: undefined, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  return null;
}

async function handlePaymentUpdate(session: any, existingPayment: any, payload: Record<string, unknown>, clientId: string): Promise<string | null> {
  const old: any = (existingPayment as any).toObject ? (existingPayment as any).toObject() : { ...(existingPayment as any) };
  const candidate: any = { ...old, ...payload };
  candidate.id = old.id;
  const newAmount = roundMoney(Number(candidate.amount));
  if (!Number.isFinite(newAmount) || newAmount <= 0) return "PAYMENT_AMOUNT_INVALID";
  const newEntityType = String(candidate.entityType);
  const newEntityId = String(candidate.entityId);
  const newAccountId = String(candidate.accountId);
  const oldAmount = roundMoney(Number(old.amount));
  const oldEntityType = String(old.entityType);
  const oldEntityId = String(old.entityId);
  const oldAccountId = String(old.accountId);
  const allowed = ["supplier", "customer", "worker", "expense"];
  if (!allowed.includes(newEntityType)) return "PAYMENT_TYPE_INVALID";
  if (!isNonEmptyString(newEntityId)) return "PAYMENT_ENTITY_INVALID";
  if (!isNonEmptyString(newAccountId)) return "PAYMENT_ACCOUNT_INVALID";
  const oldAccount: any = await BankAccountModel.findOne({ id: oldAccountId }).session(session);
  if (!oldAccount) return "ACCOUNT_NOT_FOUND";
  if (oldEntityType === "supplier") {
    const s: any = await SupplierModel.findOne({ id: oldEntityId }).session(session);
    if (!s) return "SUPPLIER_NOT_FOUND";
  } else if (oldEntityType === "customer") {
    const c: any = await CustomerModel.findOne({ id: oldEntityId }).session(session);
    if (!c) return "CUSTOMER_NOT_FOUND";
  } else if (oldEntityType === "worker") {
    const w: any = await WorkerModel.findOne({ id: oldEntityId }).session(session);
    if (!w) return "WORKER_NOT_FOUND";
  } else if (oldEntityType === "expense") {
    const e: any = await ExpenseModel.findOne({ id: oldEntityId }).session(session);
    if (!e) return "EXPENSE_NOT_FOUND";
  } else return "PAYMENT_TYPE_INVALID";
  const newAccount: any = await BankAccountModel.findOne({ id: newAccountId }).session(session);
  if (!newAccount) return "ACCOUNT_NOT_FOUND";
  // Directional validation before applying update.
  // Reversal may affect bank negatively when old is customer (bank loses funds).
  // Apply checks atomically using projected balances.
  // Build projected Bank balances map
  const bankBalances = new Map<string, number>();
  bankBalances.set(oldAccountId, oldAccount.balance);
  if (newAccountId !== oldAccountId) bankBalances.set(newAccountId, newAccount.balance);
  // Simulate reversal effect on banks
  if (oldEntityType === "customer") {
    const bal = bankBalances.get(oldAccountId)! - oldAmount;
    if (bal < 0) return "INSUFFICIENT_BANK_BALANCE";
    bankBalances.set(oldAccountId, bal);
  } else if (oldEntityType === "supplier" || oldEntityType === "worker" || oldEntityType === "expense") {
    bankBalances.set(oldAccountId, bankBalances.get(oldAccountId)! + oldAmount);
  }
  // Validate new entity balances and new bank requirement
  if (newEntityType === "supplier") {
    const nd: any = await SupplierModel.findOne({ id: newEntityId }).session(session);
    if (!nd) return "SUPPLIER_NOT_FOUND";
    let projected = nd.balance;
    if (oldEntityType === "supplier" && oldEntityId === newEntityId) projected += oldAmount;
    if (projected < newAmount) return "INSUFFICIENT_SUPPLIER_BALANCE";
    const bankBal = bankBalances.get(newAccountId)!;
    if (bankBal < newAmount) return "INSUFFICIENT_BANK_BALANCE";
  } else if (newEntityType === "customer") {
    const nd: any = await CustomerModel.findOne({ id: newEntityId }).session(session);
    if (!nd) return "CUSTOMER_NOT_FOUND";
    let projected = nd.balance;
    if (oldEntityType === "customer" && oldEntityId === newEntityId) projected += oldAmount;
    if (projected < newAmount) return "INSUFFICIENT_CUSTOMER_BALANCE";
    // Incoming: Bank receives, no bank balance check (even after reversal)
  } else if (newEntityType === "worker") {
    const nd: any = await WorkerModel.findOne({ id: newEntityId }).session(session);
    if (!nd) return "WORKER_NOT_FOUND";
    if (nd.status !== "active") return "WORKER_ARCHIVED";
    let projected = nd.balance;
    if (oldEntityType === "worker" && oldEntityId === newEntityId) projected += oldAmount;
    if (projected < newAmount) return "INSUFFICIENT_WORKER_BALANCE";
    const bankBal = bankBalances.get(newAccountId)!;
    if (bankBal < newAmount) return "INSUFFICIENT_BANK_BALANCE";
  } else if (newEntityType === "expense") {
    const e: any = await ExpenseModel.findOne({ id: newEntityId }).session(session);
    if (!e) return "EXPENSE_NOT_FOUND";
    const bankBal = bankBalances.get(newAccountId)!;
    if (bankBal < newAmount) return "INSUFFICIENT_BANK_BALANCE";
  }
  if (oldEntityType === "supplier") {
    await SupplierModel.updateOne({ id: oldEntityId }, { $inc: { balance: oldAmount } }, { session });
    await BankAccountModel.updateOne({ id: oldAccountId }, { $inc: { balance: oldAmount } }, { session });
  } else if (oldEntityType === "customer") {
    await CustomerModel.updateOne({ id: oldEntityId }, { $inc: { balance: oldAmount } }, { session });
    await BankAccountModel.updateOne({ id: oldAccountId }, { $inc: { balance: -oldAmount } }, { session });
  } else if (oldEntityType === "worker") {
    await WorkerModel.updateOne({ id: oldEntityId }, { $inc: { balance: oldAmount } }, { session });
    await BankAccountModel.updateOne({ id: oldAccountId }, { $inc: { balance: oldAmount } }, { session });
  } else if (oldEntityType === "expense") {
    await BankAccountModel.updateOne({ id: oldAccountId }, { $inc: { balance: oldAmount } }, { session });
  }
  if (newEntityType === "supplier") {
    await SupplierModel.updateOne({ id: newEntityId }, { $inc: { balance: -newAmount } }, { session });
    await BankAccountModel.updateOne({ id: newAccountId }, { $inc: { balance: -newAmount } }, { session });
  } else if (newEntityType === "customer") {
    await CustomerModel.updateOne({ id: newEntityId }, { $inc: { balance: -newAmount } }, { session });
    await BankAccountModel.updateOne({ id: newAccountId }, { $inc: { balance: newAmount } }, { session });
  } else if (newEntityType === "worker") {
    await WorkerModel.updateOne({ id: newEntityId }, { $inc: { balance: -newAmount } }, { session });
    await BankAccountModel.updateOne({ id: newAccountId }, { $inc: { balance: -newAmount } }, { session });
  } else if (newEntityType === "expense") {
    await BankAccountModel.updateOne({ id: newAccountId }, { $inc: { balance: -newAmount } }, { session });
  }
  const bankIds = new Set<string>([oldAccountId, newAccountId]);
  for (const bid of bankIds) {
    const bankAfter: any = await BankAccountModel.findOne({ id: bid }).session(session);
    const rev = await getNextRevision(session);
    await BankAccountModel.updateOne({ id: bid }, { $set: { serverRevision: rev, syncStatus: "synced", lastSyncedAt: Date.now() } }, { session });
    const bankAfterWithRev: any = await BankAccountModel.findOne({ id: bid }).session(session);
    await SyncChangeModel.create([{ revision: rev, entity: "bankAccount", entityId: bid, operation: "update", payload: bankAfterWithRev, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  }
  const entityKeys: Array<{ type: string; id: string }> = [];
  if (["supplier", "customer", "worker"].includes(oldEntityType)) entityKeys.push({ type: oldEntityType, id: oldEntityId });
  if (["supplier", "customer", "worker"].includes(newEntityType)) {
    if (!(newEntityType === oldEntityType && newEntityId === oldEntityId)) entityKeys.push({ type: newEntityType, id: newEntityId });
  }
  const seen = new Set<string>();
  for (const ek of entityKeys) {
    const key = `${ek.type}:${ek.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let after: any = null;
    if (ek.type === "supplier") after = await SupplierModel.findOne({ id: ek.id }).session(session);
    else if (ek.type === "customer") after = await CustomerModel.findOne({ id: ek.id }).session(session);
    else if (ek.type === "worker") after = await WorkerModel.findOne({ id: ek.id }).session(session);
    if (!after) continue;
    const rev = await getNextRevision(session);
    if (ek.type === "supplier") await SupplierModel.updateOne({ id: ek.id }, { $set: { serverRevision: rev, syncStatus: "synced", lastSyncedAt: Date.now() } }, { session });
    else if (ek.type === "customer") await CustomerModel.updateOne({ id: ek.id }, { $set: { serverRevision: rev, syncStatus: "synced", lastSyncedAt: Date.now() } }, { session });
    else if (ek.type === "worker") await WorkerModel.updateOne({ id: ek.id }, { $set: { serverRevision: rev, syncStatus: "synced", lastSyncedAt: Date.now() } }, { session });
    const afterWithRev: any = ek.type === "supplier" ? await SupplierModel.findOne({ id: ek.id }).session(session) : ek.type === "customer" ? await CustomerModel.findOne({ id: ek.id }).session(session) : await WorkerModel.findOne({ id: ek.id }).session(session);
    await SyncChangeModel.create([{ revision: rev, entity: ek.type, entityId: ek.id, operation: "update", payload: afterWithRev, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  }
  const nowPayment = Date.now();
  const payRev = await getNextRevision(session);
  const toSet: Record<string, unknown> = { ...candidate, serverRevision: payRev, syncStatus: "synced", lastSyncedAt: nowPayment, updatedAt: nowPayment };
  delete (toSet as any).id;
  delete (toSet as any)._id;
  delete (toSet as any).__v;
  await PaymentModel.updateOne({ id: old.id }, { $set: toSet }, { session });
  const payAfter: any = await PaymentModel.findOne({ id: old.id }).session(session);
  await SyncChangeModel.create([{ revision: payRev, entity: "payment", entityId: old.id, operation: "update", payload: payAfter, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  return null;
}

async function handlePaymentDelete(session: any, existingPayment: any, clientId: string): Promise<string | null> {
  const old: any = (existingPayment as any).toObject ? (existingPayment as any).toObject() : { ...(existingPayment as any) };
  const oldAmount = roundMoney(Number(old.amount));
  const oldEntityType = String(old.entityType);
  const oldEntityId = String(old.entityId);
  const oldAccountId = String(old.accountId);
  const oldAccount: any = await BankAccountModel.findOne({ id: oldAccountId }).session(session);
  if (!oldAccount) return "ACCOUNT_NOT_FOUND";
  if (oldEntityType === "supplier") {
    const s: any = await SupplierModel.findOne({ id: oldEntityId }).session(session);
    if (!s) return "SUPPLIER_NOT_FOUND";
  } else if (oldEntityType === "customer") {
    const c: any = await CustomerModel.findOne({ id: oldEntityId }).session(session);
    if (!c) return "CUSTOMER_NOT_FOUND";
    // Reversing customer payment deducts from Bank — ensure sufficient
    if (oldAccount.balance < oldAmount) return "INSUFFICIENT_BANK_BALANCE";
  } else if (oldEntityType === "worker") {
    const w: any = await WorkerModel.findOne({ id: oldEntityId }).session(session);
    if (!w) return "WORKER_NOT_FOUND";
  } else if (oldEntityType === "expense") {
    const e: any = await ExpenseModel.findOne({ id: oldEntityId }).session(session);
    if (!e) return "EXPENSE_NOT_FOUND";
  } else return "PAYMENT_TYPE_INVALID";
  if (oldEntityType === "supplier") {
    await SupplierModel.updateOne({ id: oldEntityId }, { $inc: { balance: oldAmount } }, { session });
    await BankAccountModel.updateOne({ id: oldAccountId }, { $inc: { balance: oldAmount } }, { session });
  } else if (oldEntityType === "customer") {
    await CustomerModel.updateOne({ id: oldEntityId }, { $inc: { balance: oldAmount } }, { session });
    await BankAccountModel.updateOne({ id: oldAccountId }, { $inc: { balance: -oldAmount } }, { session });
  } else if (oldEntityType === "worker") {
    await WorkerModel.updateOne({ id: oldEntityId }, { $inc: { balance: oldAmount } }, { session });
    await BankAccountModel.updateOne({ id: oldAccountId }, { $inc: { balance: oldAmount } }, { session });
  } else if (oldEntityType === "expense") {
    await BankAccountModel.updateOne({ id: oldAccountId }, { $inc: { balance: oldAmount } }, { session });
  }
  await PaymentModel.deleteOne({ id: old.id }, { session });
  {
    const bankAfter: any = await BankAccountModel.findOne({ id: oldAccountId }).session(session);
    const rev = await getNextRevision(session);
    await BankAccountModel.updateOne({ id: oldAccountId }, { $set: { serverRevision: rev, syncStatus: "synced", lastSyncedAt: Date.now() } }, { session });
    const bankAfterWithRev: any = await BankAccountModel.findOne({ id: oldAccountId }).session(session);
    await SyncChangeModel.create([{ revision: rev, entity: "bankAccount", entityId: oldAccountId, operation: "update", payload: bankAfterWithRev, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  }
  if (["supplier", "customer", "worker"].includes(oldEntityType)) {
    let after: any = null;
    if (oldEntityType === "supplier") after = await SupplierModel.findOne({ id: oldEntityId }).session(session);
    else if (oldEntityType === "customer") after = await CustomerModel.findOne({ id: oldEntityId }).session(session);
    else if (oldEntityType === "worker") after = await WorkerModel.findOne({ id: oldEntityId }).session(session);
    const rev = await getNextRevision(session);
    if (oldEntityType === "supplier") await SupplierModel.updateOne({ id: oldEntityId }, { $set: { serverRevision: rev, syncStatus: "synced", lastSyncedAt: Date.now() } }, { session });
    else if (oldEntityType === "customer") await CustomerModel.updateOne({ id: oldEntityId }, { $set: { serverRevision: rev, syncStatus: "synced", lastSyncedAt: Date.now() } }, { session });
    else if (oldEntityType === "worker") await WorkerModel.updateOne({ id: oldEntityId }, { $set: { serverRevision: rev, syncStatus: "synced", lastSyncedAt: Date.now() } }, { session });
    const afterWithRev: any = oldEntityType === "supplier" ? await SupplierModel.findOne({ id: oldEntityId }).session(session) : oldEntityType === "customer" ? await CustomerModel.findOne({ id: oldEntityId }).session(session) : await WorkerModel.findOne({ id: oldEntityId }).session(session);
    await SyncChangeModel.create([{ revision: rev, entity: oldEntityType, entityId: oldEntityId, operation: "update", payload: afterWithRev, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  }
  const revDel = await getNextRevision(session);
  await SyncChangeModel.create([{ revision: revDel, entity: "payment", entityId: old.id, operation: "delete", payload: undefined, changedAt: new Date(), sourceClientId: clientId } as any], { session });
  return null;
}

async function handleTransferUpdate(_session: any, _existing: any, _payload: Record<string, unknown>, _clientId: string): Promise<string | null> {
  return "TRANSFER_UPDATE_UNSUPPORTED";
}

async function handleTransferDelete(_session: any, _existing: any, _clientId: string): Promise<string | null> {
  return "TRANSFER_DELETE_UNSUPPORTED";
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
    case "expense": {
      const amountRaw: any = (payload as any).amount;
      const dateRaw: any = (payload as any).date;
      const accountIdRaw: any = (payload as any).accountId;
      const nameRaw: any = (payload as any).name;
      if (isCreateUpsert) {
        if (amountRaw === undefined || amountRaw === null) return "EXPENSE_AMOUNT_REQUIRED";
        if (dateRaw === undefined || dateRaw === null) return "EXPENSE_DATE_REQUIRED";
        if (!isNonEmptyString(accountIdRaw)) return "EXPENSE_ACCOUNT_REQUIRED";
        if (!isNonEmptyString(nameRaw)) return "EXPENSE_NAME_REQUIRED";
      }
      if (amountRaw !== undefined && amountRaw !== null) {
        const n = toFiniteNumber(amountRaw);
        if (!Number.isFinite(n) || n < 0) return "EXPENSE_AMOUNT_INVALID";
      }
      if (dateRaw !== undefined && dateRaw !== null) {
        const ms = typeof dateRaw === "number" ? dateRaw : new Date(dateRaw as any).getTime();
        if (!Number.isFinite(ms)) return "EXPENSE_DATE_INVALID";
      }
      break;
    }
    case "invoice": {
      // DRAFT generic sync only, but validate monetary fields finite
      const monetaryKeys = ["subtotalHT","taxTotal","otherTaxTotal","totalTTC","discountTotal","taxableBase","additionalChargesTotal"];
      for (const k of monetaryKeys) {
        const v: any = (payload as any)[k];
        if (v !== undefined && v !== null) {
          const n = toFiniteNumber(v);
          if (!Number.isFinite(n) || n < 0) return "INVOICE_AMOUNT_INVALID";
        }
      }
      const invDateRaw: any = (payload as any).invoiceDate;
      if (invDateRaw !== undefined && invDateRaw !== null) {
        const ms = typeof invDateRaw === "number" ? invDateRaw : new Date(invDateRaw as any).getTime();
        if (!Number.isFinite(ms)) return "INVOICE_DATE_INVALID";
      }
      const currRaw: any = (payload as any).currencyCode;
      if (currRaw !== undefined && currRaw !== null && currRaw !== "") {
        const allowed = ["DA","€","$"];
        if (!allowed.includes(String(currRaw).trim())) return "INVOICE_CURRENCY_INVALID";
      }
      break;
    }
    case "invoiceSellerProfile": {
      const nextNumRaw: any = (payload as any).nextNumber;
      const padRaw: any = (payload as any).paddingLength;
      const yearRaw: any = (payload as any).lastSequenceYear;
      const commRaw: any = (payload as any).commercialName;
      const prefRaw: any = (payload as any).invoicePrefix;
      if (nextNumRaw !== undefined && nextNumRaw !== null) {
        const n = toFiniteNumber(nextNumRaw);
        if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return "SELLER_NEXTNUMBER_INVALID";
      }
      if (padRaw !== undefined && padRaw !== null) {
        const n = toFiniteNumber(padRaw);
        if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 12) return "SELLER_PADDING_INVALID";
      }
      if (yearRaw !== undefined && yearRaw !== null) {
        const n = toFiniteNumber(yearRaw);
        if (!Number.isFinite(n) || !Number.isInteger(n) || n < 2000 || n > 2100) return "SELLER_YEAR_INVALID";
      }
      if (isCreateUpsert) {
        if (!isNonEmptyString(commRaw)) return "SELLER_COMMERCIAL_REQUIRED";
        if (!isNonEmptyString(prefRaw)) return "SELLER_PREFIX_REQUIRED";
      }
      const curr2: any = (payload as any).defaultCurrency;
      if (curr2 !== undefined && curr2 !== null && curr2 !== "") {
        const allowed = ["DA","€","$"];
        if (!allowed.includes(String(curr2).trim())) return "SELLER_CURRENCY_INVALID";
      }
      break;
    }
    case "officeFile": {
      // Size/title already validated in sync-service special block before this; keep generic finite for numeric version fields
      const verRaw: any = (payload as any).contentVersion;
      if (verRaw !== undefined && verRaw !== null) {
        const n = toFiniteNumber(verRaw);
        if (!Number.isFinite(n) || n < 0) return "OFFICE_VERSION_INVALID";
      }
      break;
    }
    case "injuryEquation":
    case "settings":
    case "notification": {
      // Minimal — generic numeric sweep covers finite checks; no extra business rules materially required per spec
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

  // PBS-BUG-022: unify the legacy `weight` item alias into canonical `weightKg`
  // for sale/purchase BEFORE validation, business handlers, and persistence
  // consume the payload. Validation already accepts the alias (with `weightKg`
  // winning when both are present), but the create handlers aggregate only
  // `weightKg`, so an un-normalized alias passed validation and then computed
  // NaN stock math while defeating the insufficient-stock check. Normalizing
  // here covers create/upsert/update candidates and persisted documents
  // uniformly. The caller's object is untouched: `payload` above is already a
  // shallow clone, and items are re-created (never mutated in place); the
  // legacy `weight` key itself is left for Mongoose strict-schema stripping.
  if (operation.entity === "sale" || operation.entity === "purchase") {
    const p: any = payload;
    if (Array.isArray(p.items)) {
      p.items = p.items.map((it: any) => {
        if (
          it != null &&
          typeof it === "object" &&
          !Array.isArray(it) &&
          (it as any).weightKg === undefined &&
          (it as any).weight !== undefined
        ) {
          return { ...(it as any), weightKg: (it as any).weight };
        }
        return it;
      });
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
  const rvbAccountsToDisconnect = new Set<string>();

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
        // Task name uniqueness: only unfinished (pending) tasks reserve name, trimmed + case-sensitive
        if (operation.entity === "task") {
          const rawName = (payload as any).name;
          if (typeof rawName === "string") {
            const trimmed = rawName.trim();
            if (trimmed) {
              const dup = await isTaskNameDuplicateUnfinished(session, trimmed);
              if (dup) {
                const err = "TASK_NAME_DUPLICATE";
                await ProcessedSyncOperationModel.create(
                  [{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }],
                  { session },
                );
                result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
                return;
              }
            }
          } else if (isNonEmptyString((payload as any).name) === false) {
            // name is required for create, but validateHshPayload already handles, but for task we ensure trimmed not empty
            // If payload has no name, the generic creation will still create, but Task requires name — let it fail via validation or model
          }
        }

        // No global conflict check for create (only entity-specific, but create has no existing)
        // Server-authoritative business transaction — apply derived effects atomically before creating transaction record
        if (["sale","purchase","payment","transfer"].includes(operation.entity)) {
          let bizErr: string | null = null;
          if (operation.entity === "sale") bizErr = await handleSaleCreate(session, payload, operation.clientId as string);
          else if (operation.entity === "purchase") bizErr = await handlePurchaseCreate(session, payload, operation.clientId as string);
          else if (operation.entity === "payment") bizErr = await handlePaymentCreate(session, payload, operation.clientId as string);
          else if (operation.entity === "transfer") bizErr = await handleTransferCreate(session, payload, operation.clientId as string);
          if (bizErr) {
            await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: bizErr, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
            result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: bizErr, error: bizErr, retryable: false };
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
            const shouldReject = await checkStaleCrossClient(session, operation, existingRev);
            if (shouldReject) {
              const err = "CONFLICT_STALE_REVISION";
              await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, conflict: true, processedAt: new Date(), clientId: operation.clientId }], { session });
              result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false, conflict: true };
              return;
            }
            conflict = true;
          }
          // For purchase/sale upsert-existing, validate merged candidate to prevent partial bypass
          if (["purchase","sale"].includes(operation.entity)) {
            const candidate: any = { ...(existingUpsert as any), ...payload };
            const err = validatePurchaseSalePayload(candidate, "create", operation.entity);
            if (err) {
              await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
              result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
              return;
            }
          }
          // Task name uniqueness for upsert (existing) — only if resulting task will be unfinished
          if (operation.entity === "task") {
            const nameRaw = (payload as any).name;
            const statusRaw = (payload as any).status;
            const nextName = nameRaw !== undefined ? String(nameRaw).trim() : String((existingUpsert as any).name || "").trim();
            const nextStatus = statusRaw !== undefined ? String(statusRaw) : String((existingUpsert as any).status || "pending");
            const willBeUnfinished = nextStatus !== "completed";
            if (willBeUnfinished && nextName) {
              const dup = await isTaskNameDuplicateUnfinished(session, nextName, operation.entityId);
              if (dup) {
                const err = "TASK_NAME_DUPLICATE";
                await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
                result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
                return;
              }
            }
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
          const lifecycleAction = linkedPortalLifecycleAction(operation.entity, (existingUpsert as any).status, (canonical as any).status);
          if (lifecycleAction) {
            const accountId = await applyLinkedEntityLifecycleToRvbAccount(operation.entity, operation.entityId, lifecycleAction, session);
            if (accountId) rvbAccountsToDisconnect.add(accountId);
          }
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
          if (operation.entity === "task") {
            const rawName = (payload as any).name;
            if (typeof rawName === "string") {
              const trimmed = rawName.trim();
              if (trimmed) {
                const dup = await isTaskNameDuplicateUnfinished(session, trimmed);
                if (dup) {
                  const err = "TASK_NAME_DUPLICATE";
                  await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
                  result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
                  return;
                }
              }
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
          if (operation.entity === "transfer") {
            const err = "TRANSFER_UPDATE_UNSUPPORTED";
            await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
            result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
            return;
          }
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
        // Task name uniqueness: only unfinished (pending) tasks reserve name, trimmed + case-sensitive, exclude self
        if (operation.entity === "task") {
          const nameRaw = (payload as any).name;
          const statusRaw = (payload as any).status;
          const nextName = nameRaw !== undefined ? String(nameRaw).trim() : String((existing as any).name || "").trim();
          const nextStatus = statusRaw !== undefined ? String(statusRaw) : String((existing as any).status || "pending");
          const willBeUnfinished = nextStatus !== "completed";
          if (willBeUnfinished && nextName) {
            const existingNameTrimmed = String((existing as any).name || "").trim();
            const isNameChange = nameRaw !== undefined && nextName !== existingNameTrimmed;
            const isBecomingUnfinished = String((existing as any).status || "pending") === "completed" && willBeUnfinished;
            const shouldCheck = isNameChange || isBecomingUnfinished || nameRaw !== undefined;
            if (shouldCheck) {
              const dup = await isTaskNameDuplicateUnfinished(session, nextName, operation.entityId);
              if (dup) {
                const err = "TASK_NAME_DUPLICATE";
                await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
                result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
                return;
              }
            }
          }
        }
        const existingRev = (existing as any).serverRevision ?? 0;
        if (operation.baseRevision !== undefined && operation.baseRevision < existingRev) {
          const shouldReject = await checkStaleCrossClient(session, operation, existingRev);
          if (shouldReject) {
            const err = "CONFLICT_STALE_REVISION";
            await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, conflict: true, processedAt: new Date(), clientId: operation.clientId }], { session });
            result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false, conflict: true };
            return;
          }
          conflict = true;
        }
        // For purchase/sale update, validate merged candidate to prevent partial bypass
        if (["purchase","sale"].includes(operation.entity)) {
          const candidate: any = { ...(existing as any), ...payload };
          const err = validatePurchaseSalePayload(candidate, "create", operation.entity);
          if (err) {
            await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
            result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
            return;
          }
        }
        // SERVER-AUTHORITATIVE handlers for Sale/Purchase/Payment/Transfer update — must precede generic updateOne
        if (["sale", "purchase", "payment", "transfer"].includes(operation.entity)) {
          if (operation.entity === "transfer") {
            const err = "TRANSFER_UPDATE_UNSUPPORTED";
            await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
            result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
            return;
          }
          let handlerErr: string | null = null;
          if (operation.entity === "sale") handlerErr = await handleSaleUpdate(session, existing, payload as Record<string, unknown>, operation.clientId as string);
          else if (operation.entity === "purchase") handlerErr = await handlePurchaseUpdate(session, existing, payload as Record<string, unknown>, operation.clientId as string);
          else if (operation.entity === "payment") handlerErr = await handlePaymentUpdate(session, existing, payload as Record<string, unknown>, operation.clientId as string);
          if (handlerErr) {
            await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: handlerErr, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
            result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: handlerErr, error: handlerErr, retryable: false };
            return;
          }
          const updated = await (model as any).findOne({ id: operation.entityId }).session(session as any);
          const rev = (updated as any)?.serverRevision;
          canonical = updated;
          revision = rev;
          await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: true, revision, canonicalEntity: canonical, conflict, processedAt: new Date(), clientId: operation.clientId }], { session });
          result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: true, message: "Entity updated.", revision, canonicalEntity: canonical, conflict };
          return;
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
        const lifecycleAction = linkedPortalLifecycleAction(operation.entity, (existing as any).status, (canonical as any).status);
        if (lifecycleAction) {
          const accountId = await applyLinkedEntityLifecycleToRvbAccount(operation.entity, operation.entityId, lifecycleAction, session);
          if (accountId) rvbAccountsToDisconnect.add(accountId);
        }
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
            const shouldReject = await checkStaleCrossClient(session, operation, existingRev);
            if (shouldReject) {
              const err = "CONFLICT_STALE_REVISION";
              await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, conflict: true, processedAt: new Date(), clientId: operation.clientId }], { session });
              result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false, conflict: true };
              return;
            }
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
        // SERVER-AUTHORITATIVE handlers for Sale/Purchase/Payment/Transfer delete — must precede generic deleteOne
        if (["sale", "purchase", "payment", "transfer"].includes(operation.entity)) {
          if (operation.entity === "transfer") {
            const err = "TRANSFER_DELETE_UNSUPPORTED";
            await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
            result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
            return;
          }
          if (!existing) {
            // Idempotent delete for missing entity — fall through to generic handling below
          } else {
            let handlerErr: string | null = null;
            if (operation.entity === "sale") handlerErr = await handleSaleDelete(session, existing, operation.clientId as string);
            else if (operation.entity === "purchase") handlerErr = await handlePurchaseDelete(session, existing, operation.clientId as string);
            else if (operation.entity === "payment") handlerErr = await handlePaymentDelete(session, existing, operation.clientId as string);
            if (handlerErr) {
              await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: handlerErr, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
              result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: handlerErr, error: handlerErr, retryable: false };
              return;
            }
            const lastChange: any = await SyncChangeModel.findOne({ entity: operation.entity, entityId: operation.entityId, operation: "delete" }).sort({ revision: -1 }).session(session);
            revision = lastChange?.revision;
            await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: true, revision, canonicalEntity: undefined, conflict, processedAt: new Date(), clientId: operation.clientId }], { session });
            result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: true, message: "Entity deleted.", revision, conflict };
            return;
          }
        }
        revision = await getNextRevision(session);
        if (HSH_SYNC_ENTITIES.has(operation.entity) && ["worker", "supplier", "customer"].includes(operation.entity)) {
          const accountId = await applyLinkedEntityLifecycleToRvbAccount(operation.entity, operation.entityId, "delete", session);
          if (accountId) rvbAccountsToDisconnect.add(accountId);
        }
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
    const completedResult = result as SyncOperationResult | null;
    if (completedResult) {
      if (completedResult.success && rvbAccountsToDisconnect.size > 0) {
        try {
          const { disconnectRvbAccount } = await import("../lib/chat-socket");
          for (const accountId of rvbAccountsToDisconnect) disconnectRvbAccount(accountId);
        } catch {}
      }
      return completedResult;
    }
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



