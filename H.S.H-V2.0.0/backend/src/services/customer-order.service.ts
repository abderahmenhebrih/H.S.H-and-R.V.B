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

async function enforceCustomerPrice(items: any[]): Promise<ReturnType<typeof validateItems>> {
  const normalized = validateItems(items);
  const authoritative: any[] = [];
  for (const it of normalized) {
    const product: any = await ProductModel.findOne({ id: it.productId }).lean();
    if (!product) throw codeError("RVB_PRODUCT_NOT_FOUND", 404, `Product not found: ${it.productId}`);
    const authPrice = Number(product.price);
    if (!Number.isFinite(authPrice) || authPrice < 0) throw codeError("RVB_PRODUCT_NOT_FOUND", 404, `Product price invalid: ${it.productId}`);
    const weightKg = Number(it.weightKg);
    const total = Math.round(weightKg * authPrice * 100) / 100;
    authoritative.push({ productId: it.productId, quantity: it.quantity, weightKg, price: authPrice, total });
  }
  return authoritative as any;
}

export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;

function normalizeIdempotencyKey(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw codeError("RVB_IDEMPOTENCY_KEY_INVALID", 400, "idempotency key must be a 1-128 char string");
  }
  return value;
}

// Normalized submission fingerprint (server-authoritative items + notes).
// Identifies key REUSE WITH A DIFFERENT payload (409), while a new key with
// identical business contents is always allowed (new intentional order).
function orderSubmissionFingerprint(items: any[], notes: unknown): string {
  const norm = (Array.isArray(items) ? items : []).map((it: any) => ({
    productId: String(it?.productId ?? ""),
    quantity: Number(it?.quantity),
    weightKg: Number(it?.weightKg),
    price: Number(it?.price),
  }));
  return JSON.stringify({ items: norm, notes: typeof notes === "string" ? notes : null });
}

function toPublicOrder(doc: any, customerName: string | null) {
  const plain: any = doc.toObject ? doc.toObject() : doc;
  return { ...plain, customerName };
}

export async function createCustomerOrder(input: { customerId: string; accountId?: string | null; items: any[]; total: number; notes?: string; clientRequestId?: unknown }) {
  let { customerId, accountId, items, total, notes } = input as any;
  const clientRequestId = normalizeIdempotencyKey((input as any).clientRequestId);
  if (!customerId) throw codeError("RVB_CUSTOMER_REQUIRED", 400);
  if (!items || !Array.isArray(items) || items.length === 0) throw codeError("RVB_ITEMS_REQUIRED", 400);
  // For CUSTOMER-originated orders, server is authoritative for price: ignore client price, use Product.price
  const normalized = await enforceCustomerPrice(items);
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
  // Idempotency scope is the authenticated actor: the backend derives
  // accountId from the session, never from a client-supplied scope field.
  if (clientRequestId !== undefined && !accountId) {
    throw codeError("RVB_IDEMPOTENCY_KEY_INVALID", 400, "idempotency key requires an authenticated account");
  }
  const fingerprint = orderSubmissionFingerprint(items, notes);
  if (clientRequestId !== undefined) {
    const existing: any = await CustomerOrderModel.findOne({ accountId, clientRequestId }).lean();
    if (existing) {
      if (orderSubmissionFingerprint(existing.items, existing.notes) === fingerprint) {
        return { order: { ...existing, customerName: customer.name }, idempotentReplay: true };
      }
      throw codeError("RVB_IDEMPOTENCY_CONFLICT", 409, "idempotency key was already used with a different order payload");
    }
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
  if (clientRequestId !== undefined) doc.clientRequestId = clientRequestId;
  let created: any;
  try {
    created = await CustomerOrderModel.create(doc);
  } catch (err: any) {
    // Concurrent race: two instances inserted the same actor+key at once and
    // the unique index rejected the loser. Recover the winner instead of 500.
    if (clientRequestId !== undefined && (err?.code === 11000 || /duplicate key/i.test(String(err?.message || "")))) {
      const winner: any = await CustomerOrderModel.findOne({ accountId, clientRequestId }).lean();
      if (winner) {
        if (orderSubmissionFingerprint(winner.items, winner.notes) === fingerprint) {
          return { order: { ...winner, customerName: customer.name }, idempotentReplay: true };
        }
        throw codeError("RVB_IDEMPOTENCY_CONFLICT", 409, "idempotency key was already used with a different order payload");
      }
    }
    throw err;
  }
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
  return { order: { ...plain, customerName: customer.name }, idempotentReplay: false };
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
      const now = Date.now();
      const claimed: any = await CustomerOrderModel.findOneAndUpdate(
        { id, status: "under_review" },
        { $set: { status, reviewedAt: now, reviewedBy: reviewerId, notes: notes || null, updatedAt: now } },
        { session, new: true },
      );
      if (!claimed) {
        const existing: any = await CustomerOrderModel.findOne({ id }).session(session);
        if (!existing) throw codeError("RVB_ORDER_NOT_FOUND", 404);
        throw codeError("RVB_ORDER_ALREADY_REVIEWED", 409);
      }
      const order: any = claimed;
      if (editedItems && editedItems.length > 0) {
        const normalized = validateItems(editedItems);
        const authoritative: any[] = [];
        for (const it of normalized) {
          const prod: any = await ProductModel.findOne({ id: it.productId }).session(session);
          if (!prod) throw codeError("RVB_PRODUCT_NOT_FOUND", 404, `Product not found: ${it.productId}`);
          const authPrice = Number((prod as any).price);
          if (!Number.isFinite(authPrice) || authPrice < 0) throw codeError("RVB_PRODUCT_NOT_FOUND", 404, `Product price invalid: ${it.productId}`);
          const weightKg = Number(it.weightKg);
          const totalLine = Math.round(weightKg * authPrice * 100) / 100;
          authoritative.push({ productId: it.productId, quantity: it.quantity, weightKg, price: authPrice, total: totalLine });
          if (status === "accepted") {
            if ((Number(prod.quantity) || 0) < Number(it.quantity) || (Number(prod.weightKg) || 0) < Number(it.weightKg)) {
              throw codeError("RVB_INSUFFICIENT_STOCK", 400, `Insufficient stock for ${prod.name}`);
            }
          }
        }
        order.originalItems = order.items;
        order.items = authoritative as any;
        order.total = computeTotal(authoritative);
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
  // Customer edit must also be price-authoritative
  const normalized = await enforceCustomerPrice(items);
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
