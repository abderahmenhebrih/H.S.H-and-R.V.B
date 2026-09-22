import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { SupplierModel } from "../models/supplier.model";
import { SupplierRequestModel } from "../models/supplier-request.model";
import { RvbAccountModel } from "../models/rvb-account.model";
import { PurchaseModel } from "../models/purchase.model";
import { ProductModel } from "../models/product.model";
import { createRvbNotification } from "./rvb-notification.service";
import { allocateRevision, recordSyncChange } from "../sync/rvb-sync-helper";
import { validateItems, computeTotal, validatePurchaseCalculation, MAX_DESCRIPTION_LENGTH } from "../lib/validate-items";

function codeError(code: string, status: number, message?: string) {
  const err = new Error(message || code) as any;
  err.code = code;
  err.status = status;
  return err;
}

export async function createSupplierRequest(input: {
  supplierId: string;
  accountId?: string | null;
  type: "new_supply" | "discrepancy";
  items?: any[];
  total?: number;
  calculation?: any;
  date?: number;
  description?: string | null;
}) {
  let { supplierId, accountId, type, items, total, calculation, date, description } = input as any;
  if (!supplierId) throw codeError("RVB_SUPPLIER_REQUIRED", 400);
  if (!["new_supply", "discrepancy"].includes(type)) throw codeError("RVB_REQUEST_TYPE_INVALID", 400);
  const supplier: any = await SupplierModel.findOne({ id: supplierId }).lean();
  if (!supplier) throw codeError("RVB_SUPPLIER_NOT_FOUND", 404);
  if (accountId) {
    const acc: any = await RvbAccountModel.findOne({ id: accountId }).lean();
    if (!acc) throw codeError("RVB_ACCOUNT_NOT_FOUND", 404);
    if (acc.linkedEntityType === "supplier" && acc.linkedEntityId !== supplierId) throw codeError("RVB_FORBIDDEN", 403);
  }
  if (type === "new_supply") {
    if (!items || !Array.isArray(items) || items.length === 0) throw codeError("RVB_ITEMS_REQUIRED", 400);
    // Structured validation per spec 59-61: items array, max 50, product exists, quantity>0, weight>=0, price>=0, etc.
    const normalized = validateItems(items);
    // Product existence validation
    for (const it of normalized) {
      const product: any = await ProductModel.findOne({ id: it.productId }).lean();
      if (!product) throw codeError("RVB_PRODUCT_NOT_FOUND", 404, `Product not found: ${it.productId}`);
    }
    // Calculation validation (purchase-calculation semantics)
    if (calculation !== undefined && calculation !== null) {
      validatePurchaseCalculation(calculation);
    }
    if (description !== undefined && description !== null && typeof description === "string" && description.length > MAX_DESCRIPTION_LENGTH) {
      throw codeError("RVB_DESCRIPTION_TOO_LONG", 400, `description too long (${description.length} > ${MAX_DESCRIPTION_LENGTH})`);
    }
    // Server-side total recomputation (do NOT trust client total)
    const serverTotal = computeTotal(normalized);
    // Overwrite client-provided values with server-computed ones
    (input as any).items = normalized;
    (input as any).total = serverTotal;
    // Update local variables for doc creation
    items = normalized as any;
    total = serverTotal;
    // Also ensure each item's total is the server recomputed weight*price
  }
  if (type === "discrepancy" && !description?.trim()) throw codeError("RVB_DESCRIPTION_REQUIRED", 400);
  if (type === "discrepancy" && description && description.length > MAX_DESCRIPTION_LENGTH) {
    throw codeError("RVB_DESCRIPTION_TOO_LONG", 400, `description too long (${description.length} > ${MAX_DESCRIPTION_LENGTH})`);
  }
  if (description !== undefined && description !== null && typeof description !== "string") {
    throw codeError("RVB_DESCRIPTION_INVALID", 400, "description must be a string");
  }
  if (date !== undefined && date !== null) {
    const d = Number(date);
    if (!Number.isFinite(d) || d < 0) throw codeError("RVB_DATE_INVALID", 400, "Invalid date");
    date = d;
  }
  const now = Date.now();
  const doc: any = {
    id: `suprq-${uuidv4()}`,
    createdAt: now,
    updatedAt: now,
    supplierId,
    accountId: accountId || null,
    type,
    status: "under_review",
    items: items || null,
    total: total ?? null,
    calculation: calculation || null,
    date: date || now,
    description: description?.trim() || null,
    submittedAt: now,
    reviewedAt: null,
    reviewedBy: null,
    notes: null,
    purchaseId: null,
    originalItems: null,
    originalTotal: null,
    originalCalculation: null,
  };
  const created = await SupplierRequestModel.create(doc);
  try {
    const sourceEventId = `supplier-request:${doc.id}:submitted`;
    await createRvbNotification({
      type: "purchase",
      severity: "info",
      title: type === "new_supply" ? "New supply request" : "New supplier discrepancy",
      message: `${supplier.name} submitted ${type === "new_supply" ? "new supply" : "discrepancy"} request`,
      entityType: "supplier",
      entityId: doc.id,
      route: "/rvb/requests",
      sourceEventId,
      audienceType: "role",
      audienceIds: ["manager", "admin"],
      priority: "high",
      category: "requests",
    } as any);
  } catch {}
  try {
    const { RvbActivityModel } = await import("../models/rvb-activity.model");
    const submitterAcc: any = accountId ? await RvbAccountModel.findOne({ id: accountId }).lean() : null;
    await RvbActivityModel.create({ id: `rvba-${uuidv4()}`, createdAt: now, actorAccountId: accountId || null, actorTag: submitterAcc?.tag || null, actorRole: submitterAcc?.role || null, entityType: "supplier", entityId: supplierId, action: `request_submitted:${type}`, sourceType: "requests", sourceId: doc.id, title: `${supplier.name} submitted ${type} request`, details: `Supplier ${supplier.name} ${type}` } as any);
  } catch {}
  return created.toObject ? created.toObject() : created;
}

export async function listSupplierRequests(supplierId?: string) {
  const filter: any = {};
  if (supplierId) filter.supplierId = supplierId;
  const docs = await SupplierRequestModel.find(filter).sort({ submittedAt: -1 }).lean();
  return docs;
}

export async function reviewSupplierRequest(
  id: string,
  status: "accepted" | "rejected",
  reviewerId: string,
  notes?: string,
  edited?: { items?: any[]; total?: number; calculation?: any; date?: number },
) {
  if (!["accepted", "rejected"].includes(status)) throw codeError("RVB_STATUS_INVALID", 400);
  if (notes !== undefined && notes !== null && typeof notes !== "string") throw codeError("RVB_NOTE_INVALID", 400, "notes must be a string");
  if (notes !== undefined && notes !== null && notes.length > MAX_DESCRIPTION_LENGTH) throw codeError("RVB_NOTE_TOO_LONG", 400, `notes too long (${notes.length} > ${MAX_DESCRIPTION_LENGTH})`);
  const session = await mongoose.startSession();
  let savedReq: any = null;
  try {
    await session.withTransaction(async () => {
      const req: any = await SupplierRequestModel.findOne({ id }).session(session);
      if (!req) throw codeError("RVB_REQUEST_NOT_FOUND", 404);
      if (req.status !== "under_review") throw codeError("RVB_REQUEST_ALREADY_REVIEWED", 400);

      if (edited && req.type === "new_supply" && (edited.items || edited.total !== undefined || edited.calculation !== undefined || edited.date !== undefined)) {
        if (!req.originalItems) {
          req.originalItems = req.items;
          req.originalTotal = req.total;
          req.originalCalculation = req.calculation;
        }
        if (edited.items) {
          const normalized = validateItems(edited.items);
          // Validate product existence within transaction
          for (const it of normalized) {
            const prod: any = await ProductModel.findOne({ id: it.productId }).session(session);
            if (!prod) throw codeError("RVB_PRODUCT_NOT_FOUND", 404, `Product not found: ${it.productId}`);
          }
          if (edited.calculation !== undefined && edited.calculation !== null) {
            validatePurchaseCalculation(edited.calculation);
          }
          req.items = normalized as any;
          // Server recomputes grand total (ignore client total)
          req.total = computeTotal(normalized);
        } else if (edited.total !== undefined) {
          // Client attempted to override total without items - ignore and recompute from existing items
          const existingNormalized = validateItems(req.items);
          req.total = computeTotal(existingNormalized);
          // Also normalize existing items to ensure H.S.H semantics
          req.items = existingNormalized as any;
        }
        if (edited.calculation !== undefined) {
          if (edited.calculation !== null) validatePurchaseCalculation(edited.calculation);
          req.calculation = edited.calculation;
        }
        if (edited.date !== undefined) {
          const d = Number(edited.date);
          if (!Number.isFinite(d) || d < 0) throw codeError("RVB_DATE_INVALID", 400, "Invalid date");
          req.date = d;
        }
        // If items were edited, ensure total is recomputed regardless of client total
        if (edited.items && edited.total !== undefined) {
          // Already recomputed above, ensure we ignore client total
          // no-op, recomputed value already set
        }
      }

      if (status === "accepted" && req.type === "new_supply") {
        if (req.purchaseId) {
          // Already processed idempotently, just update status
        } else {
          const supplier: any = await SupplierModel.findOne({ id: req.supplierId }).session(session);
          if (!supplier) throw codeError("RVB_SUPPLIER_NOT_FOUND", 404);
          // Re-validate and recompute server total at acceptance time (covers Edit-then-Accept and legacy records)
          let items: any[] = req.items || [];
          if (!Array.isArray(items) || items.length === 0) throw codeError("RVB_ITEMS_REQUIRED", 400);
          // Normalize and server-compute to ensure H.S.H semantics
          const normalizedAccept = validateItems(items);
          const total = computeTotal(normalizedAccept);
          // Validate product existence and stock-relevant fields (quantity>0 already via validateItems)
          for (const item of normalizedAccept) {
            const product: any = await ProductModel.findOne({ id: item.productId }).session(session);
            if (!product) throw codeError("RVB_PRODUCT_NOT_FOUND", 404, `Product not found: ${item.productId}`);
            if (Number(item.quantity) <= 0) throw codeError("RVB_QUANTITY_INVALID", 400);
          }
          if (total < 0) throw codeError("RVB_TOTAL_REQUIRED", 400);
          // Ensure stored request reflects server recomputed values (for Edit-then-Accept idempotency)
          req.items = normalizedAccept as any;
          req.total = total;
          // Re-assign items for purchase creation below
          items = normalizedAccept as any;
          // Update inventory with revisions
          for (const item of items) {
            const product: any = await ProductModel.findOne({ id: item.productId }).session(session);
            if (!product) throw codeError("RVB_PRODUCT_NOT_FOUND", 404);
            product.quantity = (Number(product.quantity) || 0) + Number(item.quantity || 0);
            product.weightKg = (Number(product.weightKg) || 0) + Number(item.weightKg || 0);
            product.updatedAt = Date.now();
            const rev = await allocateRevision(session);
            product.serverRevision = rev;
            await product.save({ session } as any);
            await recordSyncChange(session, { entity: "product", entityId: product.id, operation: "update", payload: product.toObject ? product.toObject() : product });
          }
          const now = Date.now();
          const purchaseId = `pur-${uuidv4()}`;
          const revPurchase = await allocateRevision(session);
          const purchaseDoc: any = {
            id: purchaseId,
            createdAt: now,
            updatedAt: now,
            syncStatus: "synced",
            serverRevision: revPurchase,
            supplierId: req.supplierId,
            date: req.date || now,
            items: items.map((it: any) => ({
              productId: it.productId,
              quantity: Number(it.quantity),
              weightKg: Number(it.weightKg),
              price: Number(it.price),
              total: Number(it.total),
            })),
            total,
            calculation: req.calculation || undefined,
          };
          await PurchaseModel.create([purchaseDoc], { session } as any);
          await recordSyncChange(session, { entity: "purchase", entityId: purchaseId, operation: "create", payload: { ...purchaseDoc } });
          supplier.balance = (Number(supplier.balance) || 0) + total;
          supplier.updatedAt = now;
          const revSup = await allocateRevision(session);
          supplier.serverRevision = revSup;
          await supplier.save({ session } as any);
          await recordSyncChange(session, { entity: "supplier", entityId: supplier.id, operation: "update", payload: supplier.toObject ? supplier.toObject() : supplier });
          req.purchaseId = purchaseId;
        }
      }

      req.status = status;
      req.reviewedAt = Date.now();
      req.reviewedBy = reviewerId;
      req.notes = notes?.trim() || null;
      req.updatedAt = Date.now();
      await req.save({ session } as any);
      savedReq = req.toObject ? req.toObject() : { ...req };
    });
  } finally {
    await session.endSession();
  }
  const req = savedReq;
  if (!req) throw codeError("RVB_REQUEST_NOT_FOUND", 404);
  // Post-commit side effects
  try {
    const sourceEventId = `supplier-request:${req.id}:${status}`;
    const targetAcc: any = await RvbAccountModel.findOne({ id: req.accountId }).lean() || await RvbAccountModel.findOne({ linkedEntityType: "supplier", linkedEntityId: req.supplierId }).lean();
    await createRvbNotification({
      type: "purchase",
      severity: status === "accepted" ? "success" : "warning",
      title: status === "accepted" ? "Supply request accepted" : "Supply request rejected",
      message: `Your supply request was ${status}`,
      entityType: "supplier",
      entityId: req.id,
      route: "/rvb/requests",
      sourceEventId,
      audienceType: targetAcc ? "user" : "role",
      audienceIds: targetAcc ? [targetAcc.id] : ["supplier"],
      priority: "high",
      category: "statusUpdates",
    } as any);
  } catch {}
  try {
    const { RvbActivityModel } = await import("../models/rvb-activity.model");
    const reviewerAcc: any = await RvbAccountModel.findOne({ id: reviewerId }).lean();
    await RvbActivityModel.create({ id: `rvba-${uuidv4()}`, createdAt: Date.now(), actorAccountId: reviewerId, actorTag: reviewerAcc?.tag || null, actorRole: reviewerAcc?.role || null, entityType: "supplier", entityId: req.supplierId, action: status === "accepted" ? `supply_accepted:${req.type}` : `supply_rejected:${req.type}`, sourceType: "requests", sourceId: req.id, title: `Supply request ${status}`, details: `${req.type} ${status} by @${reviewerAcc?.tag || reviewerId}` } as any);
  } catch {}
  return req;
}
