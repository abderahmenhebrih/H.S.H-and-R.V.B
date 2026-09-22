import { v4 as uuidv4 } from "uuid";
import { CustomerOrderModel } from "../models/customer-order.model";
import { CustomerModel } from "../models/customer.model";
import { RvbAccountModel } from "../models/rvb-account.model";

function codeError(code: string, status: number, message?: string) {
  const err = new Error(message || code) as any;
  err.code = code;
  err.status = status;
  return err;
}

export async function createCustomerOrder(input: { customerId: string; accountId?: string | null; items: any[]; total: number; notes?: string }) {
  const { customerId, accountId, items, total, notes } = input;
  if (!customerId) throw codeError("RVB_CUSTOMER_REQUIRED", 400);
  if (!items || !Array.isArray(items) || items.length === 0) throw codeError("RVB_ITEMS_REQUIRED", 400);
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
    const { NotificationModel } = await import("../models/notification.model");
    const sourceEventId = `customer-order:${doc.id}:submitted`;
    const exists = await NotificationModel.findOne({ sourceEventId }).lean();
    if (!exists) {
      await NotificationModel.create({ id: `notif-${uuidv4()}`, createdAt: now, updatedAt: now, syncStatus: "synced", type: "customer_order", severity: "info", title: "New customer order", message: `${customer.name} placed order ${doc.id.slice(0, 8)}`, entityType: "customer_order", entityId: doc.id, route: "/rvb/orders", sourceEventId, audienceType: "role", audienceIds: ["manager", "admin", "supervisor"], priority: "high", archivedAt: null } as any);
    }
  } catch {}
  try {
    const { RvbActivityModel } = await import("../models/rvb-activity.model");
    const submitterAcc: any = accountId ? await RvbAccountModel.findOne({ id: accountId }).lean() : null;
    await RvbActivityModel.create({ id: `rvba-${uuidv4()}`, createdAt: now, actorAccountId: accountId || null, actorTag: submitterAcc?.tag || null, actorRole: submitterAcc?.role || null, entityType: "customer_order", entityId: doc.id, action: "order_submitted", sourceType: "orders", sourceId: doc.id, title: `${customer.name} placed an order`, details: `Order ${doc.id.slice(0, 8)} total ${total}` } as any);
  } catch {}
  return created.toObject ? created.toObject() : created;
}

export async function listCustomerOrders(filter: { customerId?: string; status?: string } = {}) {
  const q: any = {};
  if (filter.customerId) q.customerId = filter.customerId;
  if (filter.status) q.status = filter.status;
  return CustomerOrderModel.find(q).sort({ submittedAt: -1 }).lean();
}

export async function getCustomerOrder(id: string) {
  const doc: any = await CustomerOrderModel.findOne({ id }).lean();
  if (!doc) throw codeError("RVB_ORDER_NOT_FOUND", 404);
  return doc;
}

export async function reviewCustomerOrder(id: string, status: "accepted" | "rejected", reviewerId: string, editedItems?: any[], notes?: string) {
  if (!["accepted", "rejected"].includes(status)) throw codeError("RVB_STATUS_INVALID", 400);
  const order: any = await CustomerOrderModel.findOne({ id });
  if (!order) throw codeError("RVB_ORDER_NOT_FOUND", 404);
  if (order.status !== "under_review") throw codeError("RVB_ORDER_ALREADY_REVIEWED", 400);
  if (editedItems && editedItems.length > 0) {
    order.originalItems = order.items;
    order.items = editedItems;
    // recalculate total if needed
    order.total = editedItems.reduce((s: number, it: any) => s + (Number(it.total) || 0), 0);
  }
  order.status = status;
  order.reviewedAt = Date.now();
  order.reviewedBy = reviewerId;
  if (notes) order.notes = notes;
  order.updatedAt = Date.now();
  await order.save();
  // For accepted order, do NOT automatically create Sale (business rule: accepted remains controlled, not fulfillment)
  try {
    const { NotificationModel } = await import("../models/notification.model");
    const sourceEventId = `customer-order:${order.id}:${status}`;
    const exists = await NotificationModel.findOne({ sourceEventId }).lean();
    if (!exists) {
      const targetAcc: any = await RvbAccountModel.findOne({ id: order.accountId }).lean() || await RvbAccountModel.findOne({ linkedEntityType: "customer", linkedEntityId: order.customerId }).lean();
      const cust: any = await CustomerModel.findOne({ id: order.customerId }).lean();
      await NotificationModel.create({ id: `notif-${uuidv4()}`, createdAt: Date.now(), updatedAt: Date.now(), syncStatus: "synced", type: "customer_order", severity: status === "accepted" ? "success" : "warning", title: status === "accepted" ? "Order accepted" : "Order rejected", message: `Order ${order.id.slice(0, 8)} was ${status}`, entityType: "customer_order", entityId: order.id, route: "/rvb/orders", sourceEventId, audienceType: targetAcc ? "user" : "role", audienceIds: targetAcc ? [targetAcc.id] : ["customer"], priority: "high", archivedAt: null } as any);
    }
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
  order.items = items;
  order.total = items.reduce((s: number, it: any) => s + (Number(it.total) || 0), 0);
  if (notes !== undefined) order.notes = notes;
  order.updatedAt = Date.now();
  await order.save();
  return order.toObject ? order.toObject() : order;
}
