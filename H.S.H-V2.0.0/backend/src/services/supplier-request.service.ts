import { v4 as uuidv4 } from "uuid";
import { SupplierModel } from "../models/supplier.model";
import { SupplierRequestModel } from "../models/supplier-request.model";
import { RvbAccountModel } from "../models/rvb-account.model";
import { PurchaseModel } from "../models/purchase.model";
import { ProductModel } from "../models/product.model";
import { NotificationModel } from "../models/notification.model";

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
  const { supplierId, accountId, type, items, total, calculation, date, description } = input;
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
    if (total === undefined || total === null || total < 0) throw codeError("RVB_TOTAL_REQUIRED", 400);
  }
  if (type === "discrepancy" && !description?.trim()) throw codeError("RVB_DESCRIPTION_REQUIRED", 400);
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
    const exists = await NotificationModel.findOne({ sourceEventId }).lean();
    if (!exists) {
      await NotificationModel.create({
        id: `notif-${uuidv4()}`,
        createdAt: now,
        updatedAt: now,
        syncStatus: "synced",
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
        archivedAt: null,
      } as any);
    }
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
  const req: any = await SupplierRequestModel.findOne({ id });
  if (!req) throw codeError("RVB_REQUEST_NOT_FOUND", 404);
  if (req.status !== "under_review") throw codeError("RVB_REQUEST_ALREADY_REVIEWED", 400);

  // Handle edit-then-accept: preserve original if edited provided
  if (edited && req.type === "new_supply" && (edited.items || edited.total !== undefined || edited.calculation !== undefined || edited.date !== undefined)) {
    if (!req.originalItems) {
      req.originalItems = req.items;
      req.originalTotal = req.total;
      req.originalCalculation = req.calculation;
    }
    if (edited.items) {
      if (!Array.isArray(edited.items) || edited.items.length === 0) throw codeError("RVB_ITEMS_REQUIRED", 400);
      req.items = edited.items;
    }
    if (edited.total !== undefined) req.total = Number(edited.total);
    else if (edited.items) {
      req.total = (edited.items as any[]).reduce((s: number, it: any) => s + (Number(it.total) || 0), 0);
    }
    if (edited.calculation !== undefined) req.calculation = edited.calculation;
    if (edited.date !== undefined) req.date = Number(edited.date);
  }

  if (status === "accepted" && req.type === "new_supply") {
    if (req.purchaseId) {
      req.status = status;
      req.reviewedAt = Date.now();
      req.reviewedBy = reviewerId;
      req.notes = notes?.trim() || null;
      req.updatedAt = Date.now();
      await req.save();
      return req.toObject ? req.toObject() : req;
    }
    const supplier: any = await SupplierModel.findOne({ id: req.supplierId });
    if (!supplier) throw codeError("RVB_SUPPLIER_NOT_FOUND", 404);
    const items = req.items || [];
    const total = Number(req.total) || 0;
    // Revalidate products exist
    for (const item of items) {
      const product: any = await ProductModel.findOne({ id: item.productId });
      if (!product) throw codeError("RVB_PRODUCT_NOT_FOUND", 404);
      if (Number(item.quantity) <= 0) throw codeError("RVB_QUANTITY_INVALID", 400);
    }
    // Validate total
    if (total < 0) throw codeError("RVB_TOTAL_REQUIRED", 400);

    // Update inventory
    for (const item of items) {
      const product: any = await ProductModel.findOne({ id: item.productId });
      if (!product) throw codeError("RVB_PRODUCT_NOT_FOUND", 404);
      product.quantity = (Number(product.quantity) || 0) + Number(item.quantity || 0);
      product.weightKg = (Number(product.weightKg) || 0) + Number(item.weightKg || 0);
      product.updatedAt = Date.now();
      await product.save();
    }
    const now = Date.now();
    const purchase: any = await PurchaseModel.create({
      id: `pur-${uuidv4()}`,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced",
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
    });
    supplier.balance = (Number(supplier.balance) || 0) + total;
    supplier.updatedAt = now;
    await supplier.save();

    try {
      const { WorkerFinancialEventModel } = await import("../models/worker-financial-event.model");
      await WorkerFinancialEventModel.create({
        id: `wkfe-${uuidv4()}`,
        createdAt: now,
        updatedAt: now,
        workerId: req.supplierId,
        type: "purchase",
        amount: total,
        balanceBefore: Number(supplier.balance) - total,
        balanceAfter: Number(supplier.balance),
        note: `Supply request ${req.id} accepted`,
        actorId: reviewerId,
        referenceId: purchase.id,
      } as any);
    } catch {}

    req.purchaseId = purchase.id;
  }

  req.status = status;
  req.reviewedAt = Date.now();
  req.reviewedBy = reviewerId;
  req.notes = notes?.trim() || null;
  req.updatedAt = Date.now();
  await req.save();

  try {
    const { WorkerActivityModel } = await import("../models/worker-activity.model");
    const reviewerAcc: any = await RvbAccountModel.findOne({ id: reviewerId }).lean();
    await WorkerActivityModel.create({
      id: `wka-${uuidv4()}`,
      createdAt: Date.now(),
      workerId: req.supplierId,
      accountId: reviewerId,
      action: status === "accepted" ? `supply_accepted:${req.type}` : `supply_rejected:${req.type}`,
      details: `${req.type} ${status} total=${req.total ?? ""} purchase=${req.purchaseId || ""} ${notes || ""}`.trim(),
      actorId: reviewerId,
      actorTag: reviewerAcc?.tag || null,
    } as any);
  } catch {}

  try {
    const sourceEventId = `supplier-request:${req.id}:${status}`;
    const exists = await NotificationModel.findOne({ sourceEventId }).lean();
    if (!exists) {
      const targetAcc: any = await RvbAccountModel.findOne({ id: req.accountId }).lean() || await RvbAccountModel.findOne({ linkedEntityType: "supplier", linkedEntityId: req.supplierId }).lean();
      await NotificationModel.create({
        id: `notif-${uuidv4()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        syncStatus: "synced",
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
        archivedAt: null,
      } as any);
    }
  } catch {}
  try {
    const { RvbActivityModel } = await import("../models/rvb-activity.model");
    const reviewerAcc: any = await RvbAccountModel.findOne({ id: reviewerId }).lean();
    await RvbActivityModel.create({ id: `rvba-${uuidv4()}`, createdAt: Date.now(), actorAccountId: reviewerId, actorTag: reviewerAcc?.tag || null, actorRole: reviewerAcc?.role || null, entityType: "supplier", entityId: req.supplierId, action: status === "accepted" ? `supply_accepted:${req.type}` : `supply_rejected:${req.type}`, sourceType: "requests", sourceId: req.id, title: `Supply request ${status}`, details: `${req.type} ${status} by @${reviewerAcc?.tag || reviewerId}` } as any);
  } catch {}

  return req.toObject ? req.toObject() : req;
}
