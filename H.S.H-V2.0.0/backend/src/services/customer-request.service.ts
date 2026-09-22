import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { CustomerModel } from "../models/customer.model";
import { CustomerRequestModel } from "../models/customer-request.model";
import { RvbAccountModel } from "../models/rvb-account.model";
import { SaleModel } from "../models/sale.model";
import { ProductModel } from "../models/product.model";
import { createRvbNotification } from "./rvb-notification.service";
import { allocateRevision, recordSyncChange } from "../sync/rvb-sync-helper";
import { validateItems, computeTotal, MAX_DESCRIPTION_LENGTH } from "../lib/validate-items";

function codeError(code: string, status: number, message?: string) {
  const err = new Error(message || code) as any;
  err.code = code;
  err.status = status;
  return err;
}

export async function createCustomerRequest(input: {
  customerId: string;
  accountId?: string | null;
  type: "insert_shipment" | "discrepancy";
  items?: any[];
  total?: number;
  date?: number;
  description?: string | null;
}) {
  let { customerId, accountId, type, items, total, date, description } = input as any;
  if (!customerId) throw codeError("RVB_CUSTOMER_REQUIRED", 400);
  if (!["insert_shipment", "discrepancy"].includes(type)) throw codeError("RVB_REQUEST_TYPE_INVALID", 400);
  const customer: any = await CustomerModel.findOne({ id: customerId }).lean();
  if (!customer) throw codeError("RVB_CUSTOMER_NOT_FOUND", 404);
  if (accountId) {
    const acc: any = await RvbAccountModel.findOne({ id: accountId }).lean();
    if (!acc) throw codeError("RVB_ACCOUNT_NOT_FOUND", 404);
    if (acc.linkedEntityType === "customer" && acc.linkedEntityId !== customerId) throw codeError("RVB_FORBIDDEN", 403);
  }
  if (type === "insert_shipment") {
    if (!items || !Array.isArray(items) || items.length === 0) throw codeError("RVB_ITEMS_REQUIRED", 400);
    // Price-authoritative: ignore client price, use Product.price
    const validated = validateItems(items);
    const authoritative: any[] = [];
    for (const it of validated) {
      const product: any = await ProductModel.findOne({ id: it.productId }).lean();
      if (!product) throw codeError("RVB_PRODUCT_NOT_FOUND", 404, `Product not found: ${it.productId}`);
      const authPrice = Number(product.price);
      if (!Number.isFinite(authPrice) || authPrice < 0) throw codeError("RVB_PRODUCT_NOT_FOUND", 404, `Product price invalid: ${it.productId}`);
      const weightKg = Number(it.weightKg);
      const totalLine = Math.round(weightKg * authPrice * 100) / 100;
      authoritative.push({ productId: it.productId, quantity: it.quantity, weightKg, price: authPrice, total: totalLine });
    }
    const serverTotal = computeTotal(authoritative);
    (input as any).items = authoritative;
    (input as any).total = serverTotal;
    items = authoritative as any;
    total = serverTotal;
    if (description !== undefined && description !== null && typeof description === "string" && description.length > MAX_DESCRIPTION_LENGTH) {
      throw codeError("RVB_DESCRIPTION_TOO_LONG", 400, `description too long (${description.length} > ${MAX_DESCRIPTION_LENGTH})`);
    }
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
    id: `custrq-${uuidv4()}`,
    createdAt: now,
    updatedAt: now,
    customerId,
    accountId: accountId || null,
    type,
    status: "under_review",
    items: items || null,
    total: total ?? null,
    date: date || now,
    description: description?.trim() || null,
    submittedAt: now,
    reviewedAt: null,
    reviewedBy: null,
    notes: null,
    saleId: null,
    originalItems: null,
    originalTotal: null,
  };
  const created = await CustomerRequestModel.create(doc);
  try {
    const sourceEventId = `customer-request:${doc.id}:submitted`;
    await createRvbNotification({
      type: "customer_order",
      severity: "info",
      title: "New customer shipment request",
      message: `${customer.name} submitted ${type === "insert_shipment" ? "shipment" : "discrepancy"} request`,
      entityType: "customer",
      entityId: doc.id,
      route: "/rvb/requests",
      sourceEventId,
      audienceType: "role",
      audienceIds: ["manager", "admin", "supervisor"],
      priority: "high",
      category: "requests",
    } as any);
  } catch {}
  try {
    const { RvbActivityModel } = await import("../models/rvb-activity.model");
    const submitterAcc: any = accountId ? await RvbAccountModel.findOne({ id: accountId }).lean() : null;
    await RvbActivityModel.create({ id: `rvba-${uuidv4()}`, createdAt: now, actorAccountId: accountId || null, actorTag: submitterAcc?.tag || null, actorRole: submitterAcc?.role || null, entityType: "customer", entityId: customerId, action: `request_submitted:${type}`, sourceType: "requests", sourceId: doc.id, title: `${customer.name} submitted ${type} request`, details: `Customer ${customer.name} ${type}` } as any);
  } catch {}
  return created.toObject ? created.toObject() : created;
}

export async function listCustomerRequests(customerId?: string) {
  const filter: any = {};
  if (customerId) filter.customerId = customerId;
  const docs = await CustomerRequestModel.find(filter).sort({ submittedAt: -1 }).lean();
  return docs;
}

export async function reviewCustomerRequest(
  id: string,
  status: "accepted" | "rejected",
  reviewerId: string,
  notes?: string,
  edited?: { items?: any[]; total?: number; date?: number },
) {
  if (!["accepted", "rejected"].includes(status)) throw codeError("RVB_STATUS_INVALID", 400);
  if (notes !== undefined && notes !== null && typeof notes !== "string") throw codeError("RVB_NOTE_INVALID", 400, "notes must be a string");
  if (notes !== undefined && notes !== null && notes.length > MAX_DESCRIPTION_LENGTH) throw codeError("RVB_NOTE_TOO_LONG", 400, `notes too long (${notes.length} > ${MAX_DESCRIPTION_LENGTH})`);
  const session = await mongoose.startSession();
  let savedReq: any = null;
  try {
    await session.withTransaction(async () => {
      const req: any = await CustomerRequestModel.findOne({ id }).session(session);
      if (!req) throw codeError("RVB_REQUEST_NOT_FOUND", 404);
      if (req.status !== "under_review") throw codeError("RVB_REQUEST_ALREADY_REVIEWED", 400);

      if (edited && req.type === "insert_shipment" && (edited.items || edited.total !== undefined || edited.date !== undefined)) {
        if (!req.originalItems) {
          req.originalItems = req.items;
          req.originalTotal = req.total;
        }
        if (edited.items) {
          const normalized = validateItems(edited.items);
          for (const it of normalized) {
            const prod: any = await ProductModel.findOne({ id: it.productId }).session(session);
            if (!prod) throw codeError("RVB_PRODUCT_NOT_FOUND", 404, `Product not found: ${it.productId}`);
          }
          req.items = normalized as any;
          req.total = computeTotal(normalized);
        } else if (edited.total !== undefined) {
          const existingNormalized = validateItems(req.items);
          req.total = computeTotal(existingNormalized);
          req.items = existingNormalized as any;
        }
        if (edited.date !== undefined) {
          const d = Number(edited.date);
          if (!Number.isFinite(d) || d < 0) throw codeError("RVB_DATE_INVALID", 400, "Invalid date");
          req.date = d;
        }
        // Ignore client total when items were edited; total already recomputed
      }

      if (status === "accepted" && req.type === "insert_shipment") {
        if (req.saleId) {
          // idempotent
        } else {
          const customer: any = await CustomerModel.findOne({ id: req.customerId }).session(session);
          if (!customer) throw codeError("RVB_CUSTOMER_NOT_FOUND", 404);
          // Re-validate and recompute server total at acceptance (Edit-then-Accept)
          let itemsRaw: any[] = req.items || [];
          if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) throw codeError("RVB_ITEMS_REQUIRED", 400);
          const normalizedAccept = validateItems(itemsRaw);
          const total = computeTotal(normalizedAccept);
          // Stock revalidation (quantity and weight)
          for (const item of normalizedAccept) {
            const product: any = await ProductModel.findOne({ id: item.productId }).session(session);
            if (!product) throw codeError("RVB_PRODUCT_NOT_FOUND", 404, `Product not found: ${item.productId}`);
            const qty = Number(item.quantity) || 0;
            const weight = Number(item.weightKg) || 0;
            if ((Number(product.quantity) || 0) < qty) throw codeError("RVB_INSUFFICIENT_STOCK", 400, `Insufficient stock for ${product.name}`);
            if ((Number(product.weightKg) || 0) < weight) throw codeError("RVB_INSUFFICIENT_STOCK", 400, `Insufficient weight for ${product.name}`);
          }
          // Ensure stored request reflects server recomputed values
          req.items = normalizedAccept as any;
          req.total = total;
          // Use normalized for subsequent inventory/sale creation
          itemsRaw = normalizedAccept as any;
          const items = itemsRaw as any[];
          for (const item of items) {
            const product: any = await ProductModel.findOne({ id: item.productId }).session(session);
            if (!product) throw codeError("RVB_PRODUCT_NOT_FOUND", 404);
            product.quantity = (Number(product.quantity) || 0) - Number(item.quantity || 0);
            product.weightKg = (Number(product.weightKg) || 0) - Number(item.weightKg || 0);
            if (product.quantity < 0) product.quantity = 0;
            if (product.weightKg < 0) product.weightKg = 0;
            product.updatedAt = Date.now();
            const rev = await allocateRevision(session);
            product.serverRevision = rev;
            await product.save({ session } as any);
            await recordSyncChange(session, { entity: "product", entityId: product.id, operation: "update", payload: product.toObject ? product.toObject() : product });
          }
          const now = Date.now();
          const saleId = `sale-${uuidv4()}`;
          const revSale = await allocateRevision(session);
          const saleDoc: any = {
            id: saleId,
            createdAt: now,
            updatedAt: now,
            syncStatus: "synced",
            serverRevision: revSale,
            customerId: req.customerId,
            date: req.date || now,
            items: items.map((it: any) => ({
              productId: it.productId,
              quantity: Number(it.quantity),
              weightKg: Number(it.weightKg),
              price: Number(it.price),
              total: Number(it.total),
            })),
            total,
          };
          await SaleModel.create([saleDoc], { session } as any);
          await recordSyncChange(session, { entity: "sale", entityId: saleId, operation: "create", payload: { ...saleDoc } });
          customer.balance = (Number(customer.balance) || 0) + total;
          customer.updatedAt = now;
          const revCust = await allocateRevision(session);
          customer.serverRevision = revCust;
          await customer.save({ session } as any);
          await recordSyncChange(session, { entity: "customer", entityId: customer.id, operation: "update", payload: customer.toObject ? customer.toObject() : customer });
          req.saleId = saleId;
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
    const sourceEventId = `customer-request:${req.id}:${status}`;
    const targetAcc: any = await RvbAccountModel.findOne({ id: req.accountId }).lean() || await RvbAccountModel.findOne({ linkedEntityType: "customer", linkedEntityId: req.customerId }).lean();
    await createRvbNotification({
      type: "customer_order",
      severity: status === "accepted" ? "success" : "warning",
      title: status === "accepted" ? "Shipment request accepted" : "Shipment request rejected",
      message: `Your shipment request ${req.id.slice(0, 8)} was ${status}`,
      entityType: "customer",
      entityId: req.id,
      route: "/rvb/requests",
      sourceEventId,
      audienceType: targetAcc ? "user" : "role",
      audienceIds: targetAcc ? [targetAcc.id] : ["customer"],
      priority: "high",
      category: "statusUpdates",
    } as any);
  } catch {}
  try {
    const { RvbActivityModel } = await import("../models/rvb-activity.model");
    const reviewerAcc: any = await RvbAccountModel.findOne({ id: reviewerId }).lean();
    await RvbActivityModel.create({ id: `rvba-${uuidv4()}`, createdAt: Date.now(), actorAccountId: reviewerId, actorTag: reviewerAcc?.tag || null, actorRole: reviewerAcc?.role || null, entityType: "customer", entityId: req.customerId, action: status === "accepted" ? `shipment_accepted:${req.type}` : `shipment_rejected:${req.type}`, sourceType: "requests", sourceId: req.id, title: `Shipment request ${status}`, details: `${req.type} ${status} by @${reviewerAcc?.tag || reviewerId}` } as any);
  } catch {}
  return req;
}
