import { Router } from "express";
import { parsePaging, pagingMeta } from "../lib/pagination";
import { requireRvbAuth } from "../middleware/rvb-auth";
import type { RvbAuthRequest } from "../middleware/rvb-auth";
import { RvbAccountModel } from "../models/rvb-account.model";
import { WorkerModel } from "../models/worker.model";
import { SupplierModel } from "../models/supplier.model";
import { CustomerModel } from "../models/customer.model";
import { WorkerFinancialEventModel } from "../models/worker-financial-event.model";
import { WorkerActivityModel } from "../models/worker-activity.model";
import { PurchaseModel } from "../models/purchase.model";
import { SaleModel } from "../models/sale.model";
import { PaymentModel } from "../models/payment.model";
import { CustomerOrderModel } from "../models/customer-order.model";
import { toSafeRvbAccount } from "../lib/rvb-auth";

const router = Router();
router.use(requireRvbAuth as any);

function sanitize(doc: any) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : doc;
  const { _id, __v, syncStatus, serverRevision, lastSyncedAt, ...rest } = obj;
  return rest;
}

// Helper to get linked entity summary
async function getLinkedEntity(account: any) {
  if (!account?.linkedEntityType || !account?.linkedEntityId) return null;
  const type = account.linkedEntityType;
  const id = account.linkedEntityId;
  try {
    if (type === "worker") {
      const doc: any = await WorkerModel.findOne({ id }).lean();
      if (!doc) return null;
      const { _id, __v, syncStatus, serverRevision, lastSyncedAt, ...rest } = doc;
      return { type, ...rest };
    }
    if (type === "supplier") {
      const doc: any = await SupplierModel.findOne({ id }).lean();
      if (!doc) return null;
      const { _id, __v, syncStatus, serverRevision, lastSyncedAt, ...rest } = doc;
      return { type, ...rest };
    }
    if (type === "customer") {
      const doc: any = await CustomerModel.findOne({ id }).lean();
      if (!doc) return null;
      const { _id, __v, syncStatus, serverRevision, lastSyncedAt, ...rest } = doc;
      return { type, ...rest };
    }
  } catch {}
  return null;
}

// GET /api/rvb/portal/me -> returns account + linked entity summary
router.get("/me", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const account: any = await RvbAccountModel.findOne({ id: user.accountId }).lean();
    if (!account) {
      res.status(404).json({ success: false, code: "RVB_ACCOUNT_NOT_FOUND" });
      return;
    }
    const linkedEntity = await getLinkedEntity(account);
    const safe = toSafeRvbAccount(account);
    // enrich with display name
    let linkedEntityDisplayName: string | null = null;
    if (linkedEntity) linkedEntityDisplayName = (linkedEntity as any).name || null;
    res.json({
      success: true,
      account: { ...safe, linkedEntityDisplayName },
      linkedEntity,
      role: account.role,
      linkedEntityType: account.linkedEntityType,
      linkedEntityId: account.linkedEntityId,
    });
  } catch (e: any) {
    console.error("portal me failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// GET /api/rvb/portal/worker (worker own) - derive entity from req.rvbUser
router.get("/worker", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const account: any = (user as any).account;
    // Re-fetch fresh account to guarantee linkedEntity Id
    const fresh: any = await RvbAccountModel.findOne({ id: user.accountId }).lean();
    const linkedType = fresh?.linkedEntityType;
    const linkedId = fresh?.linkedEntityId;
    const role = user.role;
    if (role !== "worker" && role !== "supervisor") {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN", message: "Only worker/supervisor can access worker portal" });
      return;
    }
    if (linkedType !== "worker" || !linkedId) {
      res.status(404).json({ success: false, code: "RVB_LINKED_ENTITY_NOT_FOUND" });
      return;
    }
    const worker: any = await WorkerModel.findOne({ id: linkedId }).lean();
    if (!worker) {
      res.status(404).json({ success: false, code: "RVB_WORKER_NOT_FOUND" });
      return;
    }
    const { _id, __v, syncStatus, serverRevision, lastSyncedAt, ...rest } = worker;
    res.json({ success: true, worker: rest });
  } catch (e: any) {
    console.error("portal worker failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// GET /api/rvb/portal/worker/financial-events
router.get("/worker/financial-events", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const fresh: any = await RvbAccountModel.findOne({ id: user.accountId }).lean();
    const linkedType = fresh?.linkedEntityType;
    const linkedId = fresh?.linkedEntityId;
    if (fresh?.role !== "worker" && fresh?.role !== "supervisor") {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
      return;
    }
    if (linkedType !== "worker" || !linkedId) {
      res.status(404).json({ success: false, code: "RVB_LINKED_ENTITY_NOT_FOUND" });
      return;
    }
    // Filtered server-side: always by linked workerId, ignore query
    // Optional pagination (?page=&limit=); absent params preserve the legacy full list.
    const paging = parsePaging(req.query, { defaultLimit: 50 });
    let eventsQuery = WorkerFinancialEventModel.find({ workerId: linkedId }).sort({ createdAt: -1 });
    if (paging) eventsQuery = eventsQuery.skip(paging.skip).limit(paging.limit);
    const events = await eventsQuery.lean();
    const cleaned = events.map((d: any) => {
      const { _id, __v, syncStatus, serverRevision, lastSyncedAt, ...rest } = d;
      return rest;
    });
    const extra = paging
      ? pagingMeta(await WorkerFinancialEventModel.countDocuments({ workerId: linkedId }), paging)
      : {};
    res.json({ success: true, workerId: linkedId, events: cleaned, ...extra });
  } catch (e: any) {
    console.error("portal worker financial-events failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// GET /api/rvb/portal/worker/activities
router.get("/worker/activities", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const fresh: any = await RvbAccountModel.findOne({ id: user.accountId }).lean();
    const linkedType = fresh?.linkedEntityType;
    const linkedId = fresh?.linkedEntityId;
    if (fresh?.role !== "worker" && fresh?.role !== "supervisor") {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
      return;
    }
    if (linkedType !== "worker" || !linkedId) {
      res.status(404).json({ success: false, code: "RVB_LINKED_ENTITY_NOT_FOUND" });
      return;
    }
    const activities = await WorkerActivityModel.find({ workerId: linkedId }).sort({ createdAt: -1 }).limit(200).lean();
    const cleaned = activities.map((d: any) => {
      const { _id, __v, syncStatus, serverRevision, lastSyncedAt, ...rest } = d;
      return rest;
    });
    res.json({ success: true, workerId: linkedId, activities: cleaned });
  } catch (e: any) {
    console.error("portal worker activities failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// GET /api/rvb/portal/supplier
router.get("/supplier", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const fresh: any = await RvbAccountModel.findOne({ id: user.accountId }).lean();
    if (fresh?.role !== "supplier") {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
      return;
    }
    const linkedType = fresh?.linkedEntityType;
    const linkedId = fresh?.linkedEntityId;
    if (linkedType !== "supplier" || !linkedId) {
      res.status(404).json({ success: false, code: "RVB_LINKED_ENTITY_NOT_FOUND" });
      return;
    }
    const supplier: any = await SupplierModel.findOne({ id: linkedId }).lean();
    if (!supplier) {
      res.status(404).json({ success: false, code: "RVB_SUPPLIER_NOT_FOUND" });
      return;
    }
    const { _id, __v, syncStatus, serverRevision, lastSyncedAt, ...rest } = supplier;
    res.json({ success: true, supplier: rest });
  } catch (e: any) {
    console.error("portal supplier failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// GET /api/rvb/portal/supplier/purchases
router.get("/supplier/purchases", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const fresh: any = await RvbAccountModel.findOne({ id: user.accountId }).lean();
    if (fresh?.role !== "supplier") {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
      return;
    }
    const linkedType = fresh?.linkedEntityType;
    const linkedId = fresh?.linkedEntityId;
    if (linkedType !== "supplier" || !linkedId) {
      res.status(404).json({ success: false, code: "RVB_LINKED_ENTITY_NOT_FOUND" });
      return;
    }
    const purchaseFilter = { supplierId: linkedId };
    const paging = parsePaging(req.query, { defaultLimit: 50 });
    let purchasesQuery = PurchaseModel.find(purchaseFilter).sort({ date: -1, createdAt: -1 });
    if (paging) purchasesQuery = purchasesQuery.skip(paging.skip).limit(paging.limit);
    const purchases = await purchasesQuery.lean();
    const cleaned = purchases.map((d: any) => {
      const { _id, __v, syncStatus, serverRevision, lastSyncedAt, ...rest } = d;
      return rest;
    });
    const extra = paging ? pagingMeta(await PurchaseModel.countDocuments(purchaseFilter), paging) : {};
    res.json({ success: true, supplierId: linkedId, purchases: cleaned, ...extra });
  } catch (e: any) {
    console.error("portal supplier purchases failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// GET /api/rvb/portal/supplier/payments
router.get("/supplier/payments", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const fresh: any = await RvbAccountModel.findOne({ id: user.accountId }).lean();
    if (fresh?.role !== "supplier") {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
      return;
    }
    const linkedType = fresh?.linkedEntityType;
    const linkedId = fresh?.linkedEntityId;
    if (linkedType !== "supplier" || !linkedId) {
      res.status(404).json({ success: false, code: "RVB_LINKED_ENTITY_NOT_FOUND" });
      return;
    }
    const paymentFilter: any = { entityType: "supplier", entityId: linkedId };
    const paging = parsePaging(req.query, { defaultLimit: 50 });
    let paymentsQuery = PaymentModel.find(paymentFilter).sort({ date: -1, createdAt: -1 });
    if (paging) paymentsQuery = paymentsQuery.skip(paging.skip).limit(paging.limit);
    const payments = await paymentsQuery.lean();
    const cleaned = payments.map((d: any) => {
      const { _id, __v, syncStatus, serverRevision, lastSyncedAt, ...rest } = d;
      return rest;
    });
    const extra = paging ? pagingMeta(await PaymentModel.countDocuments(paymentFilter), paging) : {};
    res.json({ success: true, supplierId: linkedId, payments: cleaned, ...extra });
  } catch (e: any) {
    console.error("portal supplier payments failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// GET /api/rvb/portal/customer
router.get("/customer", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const fresh: any = await RvbAccountModel.findOne({ id: user.accountId }).lean();
    if (fresh?.role !== "customer") {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
      return;
    }
    const linkedType = fresh?.linkedEntityType;
    const linkedId = fresh?.linkedEntityId;
    if (linkedType !== "customer" || !linkedId) {
      res.status(404).json({ success: false, code: "RVB_LINKED_ENTITY_NOT_FOUND" });
      return;
    }
    const customer: any = await CustomerModel.findOne({ id: linkedId }).lean();
    if (!customer) {
      res.status(404).json({ success: false, code: "RVB_CUSTOMER_NOT_FOUND" });
      return;
    }
    const { _id, __v, syncStatus, serverRevision, lastSyncedAt, ...rest } = customer;
    res.json({ success: true, customer: rest });
  } catch (e: any) {
    console.error("portal customer failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// GET /api/rvb/portal/customer/sales
router.get("/customer/sales", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const fresh: any = await RvbAccountModel.findOne({ id: user.accountId }).lean();
    if (fresh?.role !== "customer") {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
      return;
    }
    const linkedType = fresh?.linkedEntityType;
    const linkedId = fresh?.linkedEntityId;
    if (linkedType !== "customer" || !linkedId) {
      res.status(404).json({ success: false, code: "RVB_LINKED_ENTITY_NOT_FOUND" });
      return;
    }
    const saleFilter = { customerId: linkedId };
    const salePaging = parsePaging(req.query, { defaultLimit: 50 });
    let salesQuery = SaleModel.find(saleFilter).sort({ date: -1, createdAt: -1 });
    if (salePaging) salesQuery = salesQuery.skip(salePaging.skip).limit(salePaging.limit);
    const sales = await salesQuery.lean();
    const cleaned = sales.map((d: any) => {
      const { _id, __v, syncStatus, serverRevision, lastSyncedAt, ...rest } = d;
      return rest;
    });
    const saleExtra = salePaging ? pagingMeta(await SaleModel.countDocuments(saleFilter), salePaging) : {};
    res.json({ success: true, customerId: linkedId, sales: cleaned, ...saleExtra });
  } catch (e: any) {
    console.error("portal customer sales failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// GET /api/rvb/portal/customer/payments
router.get("/customer/payments", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const fresh: any = await RvbAccountModel.findOne({ id: user.accountId }).lean();
    if (fresh?.role !== "customer") {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
      return;
    }
    const linkedType = fresh?.linkedEntityType;
    const linkedId = fresh?.linkedEntityId;
    if (linkedType !== "customer" || !linkedId) {
      res.status(404).json({ success: false, code: "RVB_LINKED_ENTITY_NOT_FOUND" });
      return;
    }
    const custPayFilter: any = { entityType: "customer", entityId: linkedId };
    const custPayPaging = parsePaging(req.query, { defaultLimit: 50 });
    let custPayQuery = PaymentModel.find(custPayFilter).sort({ date: -1, createdAt: -1 });
    if (custPayPaging) custPayQuery = custPayQuery.skip(custPayPaging.skip).limit(custPayPaging.limit);
    const payments = await custPayQuery.lean();
    const cleaned = payments.map((d: any) => {
      const { _id, __v, syncStatus, serverRevision, lastSyncedAt, ...rest } = d;
      return rest;
    });
    const custPayExtra = custPayPaging ? pagingMeta(await PaymentModel.countDocuments(custPayFilter), custPayPaging) : {};
    res.json({ success: true, customerId: linkedId, payments: cleaned, ...custPayExtra });
  } catch (e: any) {
    console.error("portal customer payments failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// GET /api/rvb/portal/customer/orders
router.get("/customer/orders", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const fresh: any = await RvbAccountModel.findOne({ id: user.accountId }).lean();
    if (fresh?.role !== "customer") {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
      return;
    }
    const linkedType = fresh?.linkedEntityType;
    const linkedId = fresh?.linkedEntityId;
    if (linkedType !== "customer" || !linkedId) {
      res.status(404).json({ success: false, code: "RVB_LINKED_ENTITY_NOT_FOUND" });
      return;
    }
    const orderFilter = { customerId: linkedId };
    const orderPaging = parsePaging(req.query, { defaultLimit: 50 });
    let ordersQuery = CustomerOrderModel.find(orderFilter).sort({ submittedAt: -1 });
    if (orderPaging) ordersQuery = ordersQuery.skip(orderPaging.skip).limit(orderPaging.limit);
    const orders = await ordersQuery.lean();
    const cleaned = orders.map((d: any) => {
      const { _id, __v, syncStatus, serverRevision, lastSyncedAt, ...rest } = d;
      return rest;
    });
    // Enrich with customerName
    let customerName: string | null = null;
    try {
      const cust: any = await CustomerModel.findOne({ id: linkedId }).lean();
      customerName = cust?.name || null;
    } catch {}
    const enriched = cleaned.map((o: any) => ({ ...o, customerName }));
    const orderExtra = orderPaging ? pagingMeta(await CustomerOrderModel.countDocuments(orderFilter), orderPaging) : {};
    res.json({ success: true, customerId: linkedId, orders: enriched, ...orderExtra });
  } catch (e: any) {
    console.error("portal customer orders failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

export default router;


