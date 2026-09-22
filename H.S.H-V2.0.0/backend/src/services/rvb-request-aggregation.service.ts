import { WorkerModel } from "../models/worker.model";
import { SupplierModel } from "../models/supplier.model";
import { CustomerModel } from "../models/customer.model";
import { RvbAccountModel } from "../models/rvb-account.model";
import { WorkerRequestModel } from "../models/worker-request.model";
import { SupplierRequestModel } from "../models/supplier-request.model";
import { CustomerRequestModel } from "../models/customer-request.model";
import { ProductModel } from "../models/product.model";

export type NormalizedRequest = {
  id: string;
  source: "worker" | "supplier" | "customer";
  type: string; // raw type e.g., payment, new_supply, insert_shipment, loan, discrepancy
  status: "under_review" | "accepted" | "rejected";
  entityId: string;
  accountId?: string | null;
  requesterName: string;
  tag?: string | null;
  amount?: number | null;
  total?: number | null;
  submittedAt: number;
  reviewedAt?: number | null;
  reviewedBy?: string | null;
  notes?: string | null;
  description?: string | null;
  // Details for summary
  items?: any[] | null;
  summary: string;
  purchaseId?: string | null;
  paymentId?: string | null;
  saleId?: string | null;
  raw: any;
};

function codeError(code: string, status: number, message?: string) {
  const err = new Error(message || code) as any;
  err.code = code;
  err.status = status;
  return err;
}

function buildSummary(source: string, type: string, doc: any): string {
  if (source === "worker") {
    if (type === "payment" || type === "loan") return doc.amount != null ? `${Number(doc.amount).toLocaleString()} DA` : type;
    if (type === "discrepancy") return (doc.description || "").slice(0, 80) || "Discrepancy";
  }
  if (source === "supplier") {
    if (type === "new_supply") {
      const cnt = Array.isArray(doc.items) ? doc.items.length : 0;
      const tot = doc.total != null ? `${Number(doc.total).toLocaleString()} DA` : "";
      return `${cnt} products${tot ? ` · ${tot}` : ""}`;
    }
    if (type === "discrepancy") return (doc.description || "").slice(0, 80) || "Discrepancy";
  }
  if (source === "customer") {
    if (type === "insert_shipment") {
      const cnt = Array.isArray(doc.items) ? doc.items.length : 0;
      const weight = Array.isArray(doc.items) ? doc.items.reduce((s: number, it: any) => s + (Number(it.weightKg) || 0), 0) : 0;
      const tot = doc.total != null ? `${Number(doc.total).toLocaleString()} DA` : "";
      return `${cnt} items${weight ? ` · ${weight} kg` : ""}${tot ? ` · ${tot}` : ""}`;
    }
    if (type === "discrepancy") return (doc.description || "").slice(0, 80) || "Discrepancy";
  }
  return type;
}

export async function listAggregatedRequests(params: {
  user: { accountId: string; role: string; tag: string; account?: any };
  status?: string;
  source?: string;
  type?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { user, status, source, type, search, page = 1, limit = 25 } = params;
  const role = user.role;

  // Enforce management access: worker/supplier/customer cannot access aggregation
  if (["worker", "supplier", "customer"].includes(role)) {
    throw codeError("RVB_FORBIDDEN", 403, "Insufficient role");
  }

  const isSupervisor = role === "supervisor";
  const allowedSources = isSupervisor ? ["customer"] : ["worker", "supplier", "customer"];

  // Build filters per source
  const statusFilter: any = {};
  if (status && status !== "all") statusFilter.status = status;

  const typeFilterWorker = type && type !== "all" ? type : null;
  const typeFilterSupplier = type && type !== "all" ? type : null;
  const typeFilterCustomer = type && type !== "all" ? type : null;

  // Fetch raw docs
  let workerDocs: any[] = [];
  let supplierDocs: any[] = [];
  let customerDocs: any[] = [];

  const needWorker = !source || source === "all" ? allowedSources.includes("worker") : source === "worker" && allowedSources.includes("worker");
  const needSupplier = !source || source === "all" ? allowedSources.includes("supplier") : source === "supplier" && allowedSources.includes("supplier");
  const needCustomer = !source || source === "all" ? allowedSources.includes("customer") : source === "customer" && allowedSources.includes("customer");

  // If source specified but supervisor tries worker/supplier => forbidden already handled via allowedSources, but also need to ensure filtering
  if (source && source !== "all" && isSupervisor && source !== "customer") {
    throw codeError("RVB_FORBIDDEN", 403);
  }

  if (needWorker) {
    const q: any = { ...statusFilter };
    if (typeFilterWorker) {
      // Map human type to raw? Frontend sends raw ids: payment, loan, discrepancy . We'll use raw.
      // For supply filter, we need to handle generic discrepancy shared. If type === "discrepancy", should match worker discrepancy.
      const raw = typeFilterWorker;
      if (["payment", "loan", "discrepancy"].includes(raw)) q.type = raw;
      else q.type = "__none__"; // will yield empty
    }
    workerDocs = await WorkerRequestModel.find(q).lean();
  }
  if (needSupplier) {
    const q: any = { ...statusFilter };
    if (typeFilterSupplier) {
      const raw = typeFilterSupplier;
      // supplier types: new_supply, discrepancy
      // For uniform filter like "new_supply" / "insert_shipment" etc., map correctly
      if (raw === "new_supply" || raw === "supply") q.type = "new_supply";
      else if (raw === "discrepancy") q.type = "discrepancy";
      else if (["payment", "loan", "insert_shipment"].includes(raw)) q.type = "__none__";
      else q.type = raw;
    }
    supplierDocs = await SupplierRequestModel.find(q).lean();
  }
  if (needCustomer) {
    const q: any = { ...statusFilter };
    if (typeFilterCustomer) {
      const raw = typeFilterCustomer;
      if (raw === "insert_shipment" || raw === "shipment") q.type = "insert_shipment";
      else if (raw === "discrepancy") q.type = "discrepancy";
      else if (["payment", "loan", "new_supply"].includes(raw)) q.type = "__none__";
      else q.type = raw;
    }
    customerDocs = await CustomerRequestModel.find(q).lean();
  }

  // Collect entity ids to bulk fetch names and tags
  const workerIds = workerDocs.map((d) => d.workerId);
  const supplierIds = supplierDocs.map((d) => d.supplierId);
  const customerIds = customerDocs.map((d) => d.customerId);

  const [workers, suppliers, customers, accounts] = await Promise.all([
    workerIds.length ? WorkerModel.find({ id: { $in: workerIds } }).lean() : Promise.resolve([]),
    supplierIds.length ? SupplierModel.find({ id: { $in: supplierIds } }).lean() : Promise.resolve([]),
    customerIds.length ? CustomerModel.find({ id: { $in: customerIds } }).lean() : Promise.resolve([]),
    // Fetch accounts linked to these entities + generic
    (RvbAccountModel as any).find({
      $or: [
        { linkedEntityType: "worker", linkedEntityId: { $in: workerIds } },
        { linkedEntityType: "supplier", linkedEntityId: { $in: supplierIds } },
        { linkedEntityType: "customer", linkedEntityId: { $in: customerIds } },
      ],
    }).lean().catch(() => [] as any[]),
  ]);

  const workerMap = new Map<string, any>();
  for (const w of workers as any[]) workerMap.set(w.id, w);
  const supplierMap = new Map<string, any>();
  for (const s of suppliers as any[]) supplierMap.set(s.id, s);
  const customerMap = new Map<string, any>();
  for (const c of customers as any[]) customerMap.set(c.id, c);
  const accountMap = new Map<string, any>(); // entityId -> account
  for (const a of accounts as any[]) {
    if (a.linkedEntityType && a.linkedEntityId) {
      const { passwordHash, ...safe } = a as any;
      accountMap.set(`${a.linkedEntityType}:${a.linkedEntityId}`, safe);
    }
  }

  function normalize(doc: any, source: "worker" | "supplier" | "customer"): NormalizedRequest {
    let entityId = "";
    let name = "—";
    let tag: string | null = null;
    if (source === "worker") {
      entityId = doc.workerId;
      const w = workerMap.get(entityId);
      name = w?.name || doc.workerId || "Worker";
      const acc = accountMap.get(`worker:${entityId}`);
      tag = acc?.tag || null;
    } else if (source === "supplier") {
      entityId = doc.supplierId;
      const s = supplierMap.get(entityId);
      name = s?.name || doc.supplierId || "Supplier";
      const acc = accountMap.get(`supplier:${entityId}`);
      tag = acc?.tag || null;
    } else if (source === "customer") {
      entityId = doc.customerId;
      const c = customerMap.get(entityId);
      name = c?.name || doc.customerId || "Customer";
      const acc = accountMap.get(`customer:${entityId}`);
      tag = acc?.tag || null;
    }
    const summary = buildSummary(source, doc.type, doc);
    return {
      id: doc.id,
      source,
      type: doc.type,
      status: doc.status,
      entityId,
      accountId: doc.accountId,
      requesterName: name,
      tag,
      amount: doc.amount ?? doc.total ?? null,
      total: doc.total ?? doc.amount ?? null,
      submittedAt: doc.submittedAt,
      reviewedAt: doc.reviewedAt,
      reviewedBy: doc.reviewedBy,
      notes: doc.notes,
      description: doc.description,
      items: doc.items,
      summary,
      purchaseId: doc.purchaseId || null,
      paymentId: doc.paymentId || null,
      saleId: doc.saleId || null,
      raw: doc,
    };
  }

  let all: NormalizedRequest[] = [
    ...workerDocs.map((d) => normalize(d, "worker")),
    ...supplierDocs.map((d) => normalize(d, "supplier")),
    ...customerDocs.map((d) => normalize(d, "customer")),
  ];

  // Search filter (case-insensitive) across requesterName, tag, id, description
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    const nq = q.startsWith("@") ? q.slice(1) : q;
    all = all.filter((r) => {
      const hay = `${r.requesterName} ${r.tag || ""} ${r.id} ${r.description || ""} ${r.summary || ""}`.toLowerCase();
      if (hay.includes(q)) return true;
      if (r.tag && r.tag.toLowerCase().includes(nq)) return true;
      return false;
    });
  }

  // Sorting: for under_review oldest first, otherwise newest first
  const effectiveStatus = status || "under_review";
  if (effectiveStatus === "under_review") {
    all.sort((a, b) => a.submittedAt - b.submittedAt);
  } else {
    all.sort((a, b) => b.submittedAt - a.submittedAt);
  }

  const total = all.length;
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const safePage = Math.max(page, 1);
  const start = (safePage - 1) * safeLimit;
  const paged = all.slice(start, start + safeLimit);

  // KPI aggregation (over full filtered set before pagination but after search/source/status/type? We need total counts)
  // For KPI we compute from all (total) before pagination
  const kpi = {
    total,
    underReview: all.filter((r) => r.status === "under_review").length,
    accepted: all.filter((r) => r.status === "accepted").length,
    rejected: all.filter((r) => r.status === "rejected").length,
  };

  return {
    requests: paged,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit),
    kpi,
  };
}

export async function getAggregatedRequestById(params: {
  user: { accountId: string; role: string };
  source: string;
  id: string;
}) {
  const { user, source, id } = params;
  const role = user.role;
  if (["worker", "supplier", "customer"].includes(role)) throw codeError("RVB_FORBIDDEN", 403);
  const isSupervisor = role === "supervisor";
  if (isSupervisor && source !== "customer") throw codeError("RVB_FORBIDDEN", 403);
  if (!["worker", "supplier", "customer"].includes(source)) throw codeError("RVB_REQUEST_TYPE_INVALID", 400);
  let doc: any = null;
  if (source === "worker") doc = await WorkerRequestModel.findOne({ id }).lean();
  else if (source === "supplier") doc = await SupplierRequestModel.findOne({ id }).lean();
  else if (source === "customer") doc = await CustomerRequestModel.findOne({ id }).lean();
  if (!doc) throw codeError("RVB_REQUEST_NOT_FOUND", 404);
  // Enrich with entity/account info similarly to list but single
  const entityId = source === "worker" ? doc.workerId : source === "supplier" ? doc.supplierId : doc.customerId;
  const [entityRaw, accountRaw, reviewerRaw] = await Promise.all([
    source === "worker"
      ? WorkerModel.findOne({ id: entityId }).lean().catch(() => null)
      : source === "supplier"
        ? SupplierModel.findOne({ id: entityId }).lean().catch(() => null)
        : CustomerModel.findOne({ id: entityId }).lean().catch(() => null),
    (RvbAccountModel as any).findOne({ linkedEntityType: source, linkedEntityId: entityId }).lean().catch(() => null),
    doc.reviewedBy ? RvbAccountModel.findOne({ id: doc.reviewedBy }).lean().catch(() => null) as any : Promise.resolve(null),
  ].map((p: any) => p.catch(() => null)) as any);
  function stripHash<T>(doc: any): any {
    if (!doc) return null;
    const { passwordHash, ...rest } = doc;
    return rest;
  }
  const entity = entityRaw;
  const account = stripHash(accountRaw);
  const reviewerAcc = stripHash(reviewerRaw);
  // For products in items, fetch product names for detail
  let products: any[] = [];
  if (doc.items && Array.isArray(doc.items) && doc.items.length) {
    const pIds = doc.items.map((it: any) => it.productId).filter(Boolean);
    if (pIds.length) products = await ProductModel.find({ id: { $in: pIds } }).lean().catch(() => [] as any[]);
  }
  const productMap = new Map<string, any>();
  for (const p of products) productMap.set(p.id, p);

  return {
    id: doc.id,
    source,
    type: doc.type,
    status: doc.status,
    entityId,
    entity: entity || null,
    account: account || null,
    reviewer: reviewerAcc || null,
    submittedAt: doc.submittedAt,
    reviewedAt: doc.reviewedAt,
    reviewedBy: doc.reviewedBy,
    notes: doc.notes,
    description: doc.description,
    amount: doc.amount,
    total: doc.total,
    items: (doc.items || []).map((it: any) => ({ ...it, product: productMap.get(it.productId) || null })),
    calculation: doc.calculation,
    date: doc.date,
    purchaseId: doc.purchaseId,
    paymentId: doc.paymentId,
    saleId: doc.saleId,
    originalItems: doc.originalItems,
    originalTotal: doc.originalTotal,
    originalCalculation: doc.originalCalculation,
    raw: doc,
  };
}
