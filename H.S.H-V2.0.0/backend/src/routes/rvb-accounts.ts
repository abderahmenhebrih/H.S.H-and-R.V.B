import { Router } from "express";
import { RvbAccountModel } from "../models/rvb-account.model";
import { WorkerModel } from "../models/worker.model";
import { SupplierModel } from "../models/supplier.model";
import { CustomerModel } from "../models/customer.model";
import {
  createRvbAccount,
  updateRvbAccount,
  archiveRvbAccount,
  reactivateRvbAccount,
  disableRvbAccount,
  deleteRvbAccount,
  setInitialPassword,
  linkRvbAccount,
  unlinkRvbAccount,
} from "../services/rvb-account.service";
import { requireRvbAuth, requireRvbRole } from "../middleware/rvb-auth";
import { toSafeRvbAccount } from "../lib/rvb-auth";
import { validatePasswordPolicy } from "../lib/password";

const router = Router();

function handleError(res: any, err: any) {
  const code = err?.code || "INTERNAL_ERROR";
  const status = err?.status || 500;
  const known = [
    "RVB_TAG_REQUIRED",
    "RVB_TAG_INVALID",
    "RVB_TAG_ALREADY_EXISTS",
    "RVB_TAG_IMMUTABLE",
    "RVB_DISPLAY_NAME_REQUIRED",
    "RVB_ROLE_INVALID",
    "RVB_ENTITY_ROLE_MISMATCH",
    "RVB_LINKED_ENTITY_INACTIVE",
    "RVB_LINKED_ENTITY_NOT_FOUND",
    "RVB_LINKED_ENTITY_REQUIRED",
    "RVB_ENTITY_ALREADY_LINKED",
    "RVB_ACCOUNT_NOT_FOUND",
    "RVB_CANNOT_DELETE_SELF",
    "RVB_LAST_MANAGER",
    "RVB_ONBOARDING_INVALID",
    "RVB_FIELD_NOT_ALLOWED",
    "RVB_PASSWORD_REQUIRED",
    "RVB_PASSWORD_TOO_SHORT",
    "RVB_PASSWORD_TOO_LONG",
    "RVB_PASSWORD_CONFIRM_MISMATCH",
    "RVB_PASSWORD_ALREADY_SET",
    "RVB_UNAUTHENTICATED",
    "RVB_FORBIDDEN",
  ];
  if (known.includes(code)) {
    res.status(status).json({ success: false, code, message: code });
    return;
  }
  console.error("RVB accounts error:", err);
  res.status(status).json({ success: false, code, message: err?.message || code });
}

// Protect all account management routes: Manager/Admin only
router.use(requireRvbAuth as any, requireRvbRole("manager", "admin") as any);

async function enrichAccountsWithDisplayName(accounts: any[]): Promise<any[]> {
  if (!accounts || accounts.length === 0) return accounts;
  const workerIds = accounts.filter((a: any) => a.linkedEntityType === "worker" && a.linkedEntityId).map((a: any) => a.linkedEntityId);
  const supplierIds = accounts.filter((a: any) => a.linkedEntityType === "supplier" && a.linkedEntityId).map((a: any) => a.linkedEntityId);
  const customerIds = accounts.filter((a: any) => a.linkedEntityType === "customer" && a.linkedEntityId).map((a: any) => a.linkedEntityId);
  const [workers, suppliers, customers] = await Promise.all([
    workerIds.length ? WorkerModel.find({ id: { $in: workerIds } }).lean() : Promise.resolve([] as any[]),
    supplierIds.length ? SupplierModel.find({ id: { $in: supplierIds } }).lean() : Promise.resolve([] as any[]),
    customerIds.length ? CustomerModel.find({ id: { $in: customerIds } }).lean() : Promise.resolve([] as any[]),
  ]);
  const wMap = new Map((workers as any[]).map((w: any) => [w.id, w.name] as any));
  const sMap = new Map((suppliers as any[]).map((s: any) => [s.id, s.name] as any));
  const cMap = new Map((customers as any[]).map((c: any) => [c.id, c.name] as any));
  return accounts.map((acc: any) => {
    let display: string | null = null;
    if (acc.linkedEntityType === "worker") display = (wMap.get(acc.linkedEntityId) as any) || null;
    else if (acc.linkedEntityType === "supplier") display = (sMap.get(acc.linkedEntityId) as any) || null;
    else if (acc.linkedEntityType === "customer") display = (cMap.get(acc.linkedEntityId) as any) || null;
    return { ...acc, linkedEntityDisplayName: display };
  });
}

// GET /api/rvb/accounts/linkable?type=worker|supplier|customer&search=
router.get("/linkable", async (req, res) => {
  try {
    const typeRaw = (req.query as any).type;
    const searchRaw = (req.query as any).search || (req.query as any).q;
    const type = Array.isArray(typeRaw) ? typeRaw[0] : typeRaw;
    const search = Array.isArray(searchRaw) ? searchRaw[0] : searchRaw;
    const normalizedType = typeof type === "string" ? type.trim().toLowerCase() : "";
    if (!["worker", "supplier", "customer"].includes(normalizedType)) {
      res.status(400).json({ success: false, code: "RVB_LINKABLE_TYPE_REQUIRED" });
      return;
    }
    let Model: any = null;
    if (normalizedType === "worker") Model = WorkerModel;
    else if (normalizedType === "supplier") Model = SupplierModel;
    else if (normalizedType === "customer") Model = CustomerModel;

    // Find already linked entity ids to filter out
    const linked = await RvbAccountModel.find({ linkedEntityType: normalizedType, linkedEntityId: { $ne: null } } as any).lean();
    const linkedIds = new Set(linked.map((a: any) => a.linkedEntityId).filter(Boolean));

    const filter: any = normalizedType === "worker" ? { status: "active" } : {};
    if (search && typeof search === "string" && search.trim()) {
      const s = search.trim();
      filter.name = { $regex: s, $options: "i" };
    }

    const docs: any[] = await Model.find(filter).sort({ name: 1 }).limit(100).lean();
    const available = docs.filter((d: any) => !linkedIds.has(d.id));
    const cleaned = available.map((d: any) => {
      const { _id, __v, ...rest } = d;
      return { id: rest.id, name: rest.name, phone: rest.phone, type: normalizedType };
    });
    res.json({ success: true, type: normalizedType, entities: cleaned });
  } catch (e: any) {
    console.error("GET linkable failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// GET /api/rvb/accounts
router.get("/", async (_req, res) => {
  try {
    const docs = await RvbAccountModel.find().sort({ createdAt: -1 }).lean();
    const cleaned = docs.map((d: any) => toSafeRvbAccount(d));
    const enriched = await enrichAccountsWithDisplayName(cleaned);
    res.json({ success: true, accounts: enriched });
  } catch (e) {
    console.error("GET rvb accounts failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// GET /api/rvb/accounts/:id
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const doc: any = await RvbAccountModel.findOne({ id }).lean();
    if (!doc) {
      res.status(404).json({ success: false, code: "RVB_ACCOUNT_NOT_FOUND" });
      return;
    }
    const safe = toSafeRvbAccount(doc) as any;
    const enrichedArr = await enrichAccountsWithDisplayName([safe]);
    const enriched = enrichedArr[0] || safe;
    res.json({ success: true, account: enriched });
  } catch (e) {
    console.error("GET rvb account failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// POST /api/rvb/accounts
router.post("/", async (req, res) => {
  try {
    const { password, confirmPassword } = req.body as any;
    if (!password) {
      res.status(400).json({ success: false, code: "RVB_PASSWORD_REQUIRED" });
      return;
    }
    const policyError = validatePasswordPolicy(password, confirmPassword);
    if (policyError) {
      res.status(400).json({ success: false, code: policyError });
      return;
    }
    const created: any = await createRvbAccount(req.body as any);
    res.status(201).json({ success: true, account: toSafeRvbAccount(created) });
  } catch (err: any) {
    handleError(res, err);
  }
});

// PATCH /api/rvb/accounts/:id
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updated: any = await updateRvbAccount(id, req.body as any);
    res.json({ success: true, account: toSafeRvbAccount(updated) });
  } catch (err: any) {
    handleError(res, err);
  }
});

router.post("/:id/archive", async (req, res) => {
  try {
    const { id } = req.params;
    const updated: any = await archiveRvbAccount(id);
    res.json({ success: true, account: toSafeRvbAccount(updated) });
  } catch (err: any) {
    handleError(res, err);
  }
});

router.post("/:id/reactivate", async (req, res) => {
  try {
    const { id } = req.params;
    const updated: any = await reactivateRvbAccount(id);
    res.json({ success: true, account: toSafeRvbAccount(updated) });
  } catch (err: any) {
    handleError(res, err);
  }
});

router.post("/:id/disable", async (req, res) => {
  try {
    const { id } = req.params;
    const updated: any = await disableRvbAccount(id);
    res.json({ success: true, account: toSafeRvbAccount(updated) });
  } catch (err: any) {
    handleError(res, err);
  }
});

// DELETE /api/rvb/accounts/:id — permanent login-identity removal.
// Manager/Admin only (router-level). Linked business entities, business
// history, chats and audits are explicitly preserved by the service.
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const actorAccountId = (req as any).rvbUser?.accountId as string | undefined;
    const deleted: any = await deleteRvbAccount(id, actorAccountId);
    res.json({ success: true, deletedId: deleted.id, tag: deleted.tag });
  } catch (err: any) {
    handleError(res, err);
  }
});

router.post("/:id/set-initial-password", async (req, res) => {
  try {
    const { id } = req.params;
    const { password, confirmPassword } = req.body as any;
    const updated: any = await setInitialPassword(id, password, confirmPassword);
    res.json({ success: true, account: toSafeRvbAccount(updated) });
  } catch (err: any) {
    handleError(res, err);
  }
});

router.post("/:id/link", async (req, res) => {
  try {
    const { id } = req.params;
    const { workerId, supplierId, customerId, entityId } = req.body as any;
    const raw = workerId || supplierId || customerId || entityId;
    if (!raw || typeof raw !== "string" || !raw.trim()) {
      res.status(400).json({ success: false, code: "RVB_LINKED_ENTITY_REQUIRED" });
      return;
    }
    const updated: any = await linkRvbAccount(id, raw.trim());
    res.json({ success: true, account: toSafeRvbAccount(updated) });
  } catch (err: any) {
    handleError(res, err);
  }
});

router.post("/:id/unlink", async (req, res) => {
  try {
    const { id } = req.params;
    const updated: any = await unlinkRvbAccount(id);
    res.json({ success: true, account: toSafeRvbAccount(updated) });
  } catch (err: any) {
    handleError(res, err);
  }
});

export default router;
