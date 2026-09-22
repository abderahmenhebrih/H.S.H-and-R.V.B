import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { CustomerOrderModel } from "../models/customer-order.model";
import { CustomerModel } from "../models/customer.model";
import { RvbAccountModel } from "../models/rvb-account.model";
import { ProductModel } from "../models/product.model";
import { createRvbNotification } from "./rvb-notification.service";
import { validateItems, computeTotal, MAX_DESCRIPTION_LENGTH } from "../lib/validate-items";

function codeError(code: string, status: number, message?: string) {
  const err = new Error(message || code) as any;
  err.code = code;
  err.status = status;
  return err;
}

export async function createCustomerOrder(input: { customerId: string; accountId?: string | null; items: any[]; total: number; notes?: string }) {
  let { customerId, accountId, items, total, notes } = input as any;
  if (!customerId) throw codeError("RVB_CUSTOMER_REQUIRED", 400);
  if (!items || !Array.isArray(items) || items.length === 0) throw codeError("RVB_ITEMS_REQUIRED", 400);
  // Validate structure per spec 59-61
  const normalized = validateItems(items);
  for (const it of normalized) {
    const product: any = await ProductModel.findOne({ id: it.productId }).lean();
    if (!product) throw codeError("RVB_PRODUCT_NOT_FOUND", 404, `Product not found: ${it.productId}`);
  }
  if (notes !== undefined && notes !== null) {
    if (typeof notes !== "string") throw codeError("RVB_NOTE_INVALID", 400, "notes must be a string");
    if (notes.length > MAX_DESCRIPTION_LENGTH) throw codeError("RVB_NOTE_TOO_LONG", 400, `notes too long (${notes.length} > ${MAX_DESCRIPTION_LENGTH})`);
  }
  // Server computes totals (H.S.H semantics: weightKg * price)
  const serverTotal = computeTotal(normalized);
  items = normalized as any;
  total = serverTotal;
  const customer: any = await CustomerModel.findOne({ id: customerId }).lean();
  if (!customer) throw codeError("RVB_CUSTOMER_NOT_FOUND", 404);
  if (accountId) {
    const acc: any = await RvbAccountModel.findOne({ id: accountId }).lean();
    if (acc && acc.linkedEntityType === "customer" && acc.linkedEntityId !== customerId) throw codeError("RVB_FORBIDDEN", 403);
  }
  const now = Date.now();
  const doc: any = {
    id: `corder-${uuidv4()}`,
    createdAt: now,
    updatedAt: now,
    customerId,
    accountId: accountId || null,
    status: "under_review",
    items,
    total,
    submittedAt: now,
    reviewedAt: null,
    reviewedBy: null,
    cancelledAt: null,
    notes: notes || null,
    originalItems: null,
  };
  const created = await CustomerOrderModel.create(doc);
  try {
    const sourceEventId = `customer-order:${doc.id}:submitted`;
    await createRvbNotification({
      type: "customer_order",
      severity: "info",
      title: "New customer order",
      message: `${customer.name} placed order ${doc.id.slice(0, 8)}`,
      entityType: "customer_order",
      entityId: doc.id,
      route: "/rvb/orders",
      sourceEventId,
      audienceType: "role",
      audienceIds: ["manager", "admin", "supervisor"],
      priority: "high",
      category: "orders",
    } as any);
  } catch {}
  try {
    const { RvbActivityModel } = await import("../models/rvb-activity.model");
    const submitterAcc: any = accountId ? await RvbAccountModel.findOne({ id: accountId }).lean() : null;
    await RvbActivityModel.create({ id: `rvba-${uuidv4()}`, createdAt: now, actorAccountId: accountId || null, actorTag: submitterAcc?.tag || null, actorRole: submitterAcc?.role || null, entityType: "customer_order", entityId: doc.id, action: "order_submitted", sourceType: "orders", sourceId: doc.id, title: `${customer.name} placed an order`, details: `Order ${doc.id.slice(0, 8)} total ${total}` } as any);
  } catch {}
  const plain: any = created.toObject ? created.toObject() : created;
  return { ...plain, customerName: customer.name };
}

async function enrichOrdersWithCustomerName(orders: any[]): Promise<any[]> {
  if (!orders || orders.length === 0) return orders;
  const ids = [...new Set(orders.map((o: any) => o.customerId).filter(Boolean))];
  if (ids.length === 0) return orders.map((o: any) => ({ ...o, customerName: null }));
  const customers: any[] = await CustomerModel.find({ id: { $in: ids } }).lean();
  const map = new Map(customers.map((c: any) => [c.id, c.name] as any));
  return orders.map((o: any) => ({ ...o, customerName: map.get(o.customerId) || null }));
}

export async function listCustomerOrders(filter: { customerId?: string; status?: string } = {}) {
  const q: any = {};
  if (filter.customerId) q.customerId = filter.customerId;
  if (filter.status) q.status = filter.status;
  const docs = await CustomerOrderModel.find(q).sort({ submittedAt: -1 }).lean();
  return enrichOrdersWithCustomerName(docs);
}

export async function getCustomerOrder(id: string) {
  const doc: any = await CustomerOrderModel.findOne({ id }).lean();
  if (!doc) throw codeError("RVB_ORDER_NOT_FOUND", 404);
  const enriched = await enrichOrdersWithCustomerName([doc]);
  return enriched[0] || doc;
}

export async function reviewCustomerOrder(id: string, status: "accepted" | "rejected", reviewerId: string, editedItems?: any[], notes?: string) {
  if (!["accepted", "rejected"].includes(status)) throw codeError("RVB_STATUS_INVALID", 400);
  if (notes !== undefined && notes !== null) {
    if (typeof notes !== "string") throw codeError("RVB_NOTE_INVALID", 400, "notes must be a string");
    if (notes.length > MAX_DESCRIPTION_LENGTH) throw codeError("RVB_NOTE_TOO_LONG", 400, `notes too long (${notes.length} > ${MAX_DESCRIPTION_LENGTH})`);
  }
  const session = await mongoose.startSession();
  let savedOrder: any = null;
  try {
    await session.withTransaction(async () => {
      const order: any = await CustomerOrderModel.findOne({ id }).session(session);
      if (!order) throw codeError("RVB_ORDER_NOT_FOUND", 404);
      if (order.status !== "under_review") throw codeError("RVB_ORDER_ALREADY_REVIEWED", 400);
      if (editedItems && editedItems.length > 0) {
        const normalized = validateItems(editedItems);
        for (const it of normalized) {
          const prod: any = await ProductModel.findOne({ id: it.productId }).session(session);
          if (!prod) throw codeError("RVB_PRODUCT_NOT_FOUND", 404, `Product not found: ${it.productId}`);
          if (status === "accepted") {
            if ((Number(prod.quantity) || 0) < Number(it.quantity) || (Number(prod.weightKg) || 0) < Number(it.weightKg)) {
              throw codeError("RVB_INSUFFICIENT_STOCK", 400, `Insufficient stock for ${prod.name}`);
            }
          }
        }
        order.originalItems = order.items;
        order.items = normalized as any;
        order.total = computeTotal(normalized);
      } else if (status === "accepted") {
        // Re-validate and recompute even without edits (covers Edit-then-Accept legacy and ensures server total)
        const existingNormalized = validateItems(order.items);
        for (const it of existingNormalized) {
          const prod: any = await ProductModel.findOne({ id: it.productId }).session(session);
          if (!prod) throw codeError("RVB_PRODUCT_NOT_FOUND", 404, `Product not found: ${it.productId}`);
          // Stock revalidation where applicable (order acceptance)
          const qty = Number(it.quantity) || 0;
          const weight = Number(it.weightKg) || 0;
          if ((Number(prod.quantity) || 0) < qty) throw codeError("RVB_INSUFFICIENT_STOCK", 400, `Insufficient stock for ${prod.name}`);
          if ((Number(prod.weightKg) || 0) < weight) throw codeError("RVB_INSUFFICIENT_STOCK", 400, `Insufficient weight for ${prod.name}`);
        }
        order.items = existingNormalized as any;
        order.total = computeTotal(existingNormalized);
      }
      order.status = status;
      order.reviewedAt = Date.now();
      order.reviewedBy = reviewerId;
      if (notes) order.notes = notes;
      order.updatedAt = Date.now();
      await order.save({ session } as any);
      savedOrder = order.toObject ? order.toObject() : { ...order };
    });
  } finally {
    await session.endSession();
  }
  const order: any = savedOrder;
  // For accepted order, do NOT automatically create Sale (business rule: accepted remains controlled, not fulfillment)
  try {
    const sourceEventId = `customer-order:${order.id}:${status}`;
    const targetAcc: any = await RvbAccountModel.findOne({ id: order.accountId }).lean() || await RvbAccountModel.findOne({ linkedEntityType: "customer", linkedEntityId: order.customerId }).lean();
    await createRvbNotification({
      type: "customer_order",
      severity: status === "accepted" ? "success" : "warning",
      title: status === "accepted" ? "Order accepted" : "Order rejected",
      message: `Order ${order.id.slice(0, 8)} was ${status}`,
      entityType: "customer_order",
      entityId: order.id,
      route: "/rvb/orders",
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
    const cust: any = await CustomerModel.findOne({ id: order.customerId }).lean();
    await RvbActivityModel.create({ id: `rvba-${uuidv4()}`, createdAt: Date.now(), actorAccountId: reviewerId, actorTag: reviewerAcc?.tag || null, actorRole: reviewerAcc?.role || null, entityType: "customer_order", entityId: order.id, action: status === "accepted" ? "order_accepted" : "order_rejected", sourceType: "orders", sourceId: order.id, title: `Order ${status} by @${reviewerAcc?.tag || reviewerId}`, details: `Customer ${cust?.name || order.customerId} order ${order.id.slice(0, 8)} ${status}` } as any);
  } catch {}
  return order.toObject ? order.toObject() : order;
}

export async function cancelCustomerOrder(id: string, accountId: string) {
  const order: any = await CustomerOrderModel.findOne({ id });
  if (!order) throw codeError("RVB_ORDER_NOT_FOUND", 404);
  if (order.accountId !== accountId) throw codeError("RVB_FORBIDDEN", 403);
  if (order.status !== "under_review") throw codeError("RVB_ORDER_ALREADY_REVIEWED", 400);
  order.status = "cancelled";
  order.cancelledAt = Date.now();
  order.updatedAt = Date.now();
  await order.save();
  return order.toObject ? order.toObject() : order;
}

export async function editCustomerOrder(id: string, accountId: string, items: any[], notes?: string) {
  const order: any = await CustomerOrderModel.findOne({ id });
  if (!order) throw codeError("RVB_ORDER_NOT_FOUND", 404);
  if (order.accountId !== accountId) throw codeError("RVB_FORBIDDEN", 403);
  if (order.status !== "under_review") throw codeError("RVB_ORDER_ALREADY_REVIEWED", 400);
  const normalized = validateItems(items);
  for (const it of normalized) {
    const product: any = await ProductModel.findOne({ id: it.productId }).lean();
    if (!product) throw codeError("RVB_PRODUCT_NOT_FOUND", 404, `Product not found: ${it.productId}`);
  }
  if (notes !== undefined && notes !== null) {
    if (typeof notes !== "string") throw codeError("RVB_NOTE_INVALID", 400, "notes must be a string");
    if (notes.length > MAX_DESCRIPTION_LENGTH) throw codeError("RVB_NOTE_TOO_LONG", 400, `notes too long (${notes.length} > ${MAX_DESCRIPTION_LENGTH})`);
  }
  order.items = normalized as any;
  order.total = computeTotal(normalized);
  if (notes !== undefined) order.notes = notes;
  order.updatedAt = Date.now();
  await order.save();
  return order.toObject ? order.toObject() : order;
}
