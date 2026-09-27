import { Router } from "express";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { SupplierModel } from "../models/supplier.model";
import { PurchaseModel } from "../models/purchase.model";
import { PaymentModel } from "../models/payment.model";
import { RvbActivityModel } from "../models/rvb-activity.model";
import { requireRvbAuth, requireRvbRole } from "../middleware/rvb-auth";
import type { RvbAuthRequest } from "../middleware/rvb-auth";
import { allocateRevision } from "../sync/rvb-sync-helper";
import { applyLinkedEntityLifecycleToRvbAccount } from "../services/rvb-account.service";

const router = Router();

router.use(requireRvbAuth as any);
router.use(requireRvbRole("manager", "admin") as any);

function codeError(code: string, status: number, message?: string) {
  const err = new Error(message || code) as any;
  err.code = code;
  err.status = status;
  return err;
}

function sanitize(doc: any) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : doc;
  const { _id, __v, ...rest } = obj;
  return rest;
}

// GET /api/rvb/suppliers -> list
router.get("/", async (_req: RvbAuthRequest, res) => {
  try {
    const docs = await SupplierModel.find().sort({ createdAt: -1 }).lean();
    const cleaned = docs.map((d: any) => {
      const { _id, __v, ...rest } = d;
      return rest;
    });
    res.json({ success: true, suppliers: cleaned });
  } catch (e: any) {
    console.error("GET suppliers failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// GET /api/rvb/suppliers/:id/purchases -> purchase history filtered server-side - before /:id
router.get("/:id/purchases", async (req: RvbAuthRequest, res) => {
  try {
    const rawId = (req.params as any).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const supplier: any = await SupplierModel.findOne({ id }).lean();
    if (!supplier) {
      res.status(404).json({ success: false, code: "RVB_SUPPLIER_NOT_FOUND" });
      return;
    }
    const purchases = await PurchaseModel.find({ supplierId: id }).sort({ date: -1, createdAt: -1 }).lean();
    const cleaned = purchases.map((d: any) => {
      const { _id, __v, ...rest } = d;
      return rest;
    });
    res.json({ success: true, supplierId: id, purchases: cleaned });
  } catch (e: any) {
    console.error("GET supplier purchases failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// GET /api/rvb/suppliers/:id/payments - before /:id
router.get("/:id/payments", async (req: RvbAuthRequest, res) => {
  try {
    const rawId = (req.params as any).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const supplier: any = await SupplierModel.findOne({ id }).lean();
    if (!supplier) {
      res.status(404).json({ success: false, code: "RVB_SUPPLIER_NOT_FOUND" });
      return;
    }
    const payments = await PaymentModel.find({ entityType: "supplier", entityId: id }).sort({ date: -1, createdAt: -1 }).lean();
    const cleaned = payments.map((d: any) => {
      const { _id, __v, ...rest } = d;
      return rest;
    });
    res.json({ success: true, supplierId: id, payments: cleaned });
  } catch (e: any) {
    console.error("GET supplier payments failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// GET /api/rvb/suppliers/:id
router.get("/:id", async (req: RvbAuthRequest, res) => {
  try {
    const rawId = (req.params as any).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const doc: any = await SupplierModel.findOne({ id }).lean();
    if (!doc) {
      res.status(404).json({ success: false, code: "RVB_SUPPLIER_NOT_FOUND" });
      return;
    }
    const { _id, __v, ...rest } = doc;
    res.json({ success: true, supplier: rest });
  } catch (e: any) {
    console.error("GET supplier failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// POST /api/rvb/suppliers -> create
router.post("/", async (req: RvbAuthRequest, res) => {
  try {
    const { name, phone, address, identificationNumber, email, notes } = req.body as any;
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      res.status(400).json({ success: false, code: "RVB_SUPPLIER_NAME_REQUIRED" });
      return;
    }
    const trimmedPhone = typeof phone === "string" ? phone.trim() : "";
    if (!trimmedPhone) {
      res.status(400).json({ success: false, code: "RVB_SUPPLIER_PHONE_REQUIRED" });
      return;
    }
    const existing = await SupplierModel.findOne({ name: trimmedName }).lean();
    if (existing) {
      res.status(409).json({ success: false, code: "RVB_SUPPLIER_NAME_EXISTS" });
      return;
    }
    if (email && typeof email === "string" && email.trim()) {
      const trimmed = email.trim();
      // simple email check
      if (!trimmed.includes("@")) {
        res.status(400).json({ success: false, code: "RVB_EMAIL_INVALID" });
        return;
      }
    }

    const now = Date.now();
    const id = `supplier-${uuidv4()}`;
    const doc: any = {
      id,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced" as const,
      lastSyncedAt: now,
      name: trimmedName,
      phone: trimmedPhone,
      address: typeof address === "string" && address.trim() ? address.trim() : undefined,
      identificationNumber: typeof identificationNumber === "string" && identificationNumber.trim() ? identificationNumber.trim() : undefined,
      email: typeof email === "string" && email.trim() ? email.trim() : undefined,
      notes: typeof notes === "string" && notes.trim() ? notes.trim() : undefined,
      balance: 0,
    };

    const session = await mongoose.startSession();
    let saved: any = null;
    let revision: number | null = null;
    try {
      await session.withTransaction(async () => {
        revision = await allocateRevision(session);
        doc.serverRevision = revision;
        const created = await SupplierModel.create([doc], { session } as any);
        saved = created[0];
        const payload = saved.toObject ? saved.toObject() : { ...doc };
        const { SyncChangeModel } = await import("../models/sync-change.model");
        await SyncChangeModel.create(
          [
            {
              revision,
              entity: "supplier",
              entityId: id,
              operation: "create",
              payload,
              changedAt: new Date(),
              sourceClientId: "rvb-server",
              operationId: `rvb-supplier-${id}-${revision}`,
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    try {
      await RvbActivityModel.create({
        id: `rvba-${uuidv4()}`,
        createdAt: now,
        actorAccountId: req.rvbUser!.accountId,
        actorTag: req.rvbUser!.tag,
        actorRole: req.rvbUser!.role,
        entityType: "suppliers",
        entityId: id,
        action: "created",
        sourceType: "suppliers",
        sourceId: id,
        title: `Supplier created: ${trimmedName}`,
        details: `Created by @${req.rvbUser!.tag}`,
      } as any);
    } catch {}

    res.status(201).json({ success: true, supplier: sanitize(saved || doc), revision });
  } catch (e: any) {
    console.error("POST supplier failed", e);
    const status = e?.status || 500;
    const code = e?.code || "INTERNAL_ERROR";
    res.status(status).json({ success: false, code, message: e?.message || code });
  }
});

// PATCH /api/rvb/suppliers/:id -> edit (supplierEditOperation semantics)
router.patch("/:id", async (req: RvbAuthRequest, res) => {
  try {
    const rawId = (req.params as any).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const { name, phone, address, identificationNumber, email, notes } = req.body as any;

    if (name !== undefined) {
      const tn = typeof name === "string" ? name.trim() : "";
      if (!tn) {
        res.status(400).json({ success: false, code: "RVB_SUPPLIER_NAME_REQUIRED" });
        return;
      }
    }
    if (phone !== undefined) {
      const tp = typeof phone === "string" ? phone.trim() : "";
      if (!tp) {
        res.status(400).json({ success: false, code: "RVB_SUPPLIER_PHONE_REQUIRED" });
        return;
      }
    }

    const session = await mongoose.startSession();
    let saved: any = null;
    let revision: number | null = null;
    try {
      await session.withTransaction(async () => {
        const supplier: any = await SupplierModel.findOne({ id }).session(session);
        if (!supplier) throw codeError("RVB_SUPPLIER_NOT_FOUND", 404);

        if (name !== undefined) {
          const tn = String(name).trim();
          const existing: any = await SupplierModel.findOne({ name: tn }).session(session);
          if (existing && existing.id !== id) throw codeError("RVB_SUPPLIER_NAME_EXISTS", 409);
          supplier.name = tn;
        }
        if (phone !== undefined) supplier.phone = String(phone).trim();
        if (address !== undefined) supplier.address = typeof address === "string" && address.trim() ? address.trim() : null;
        if (identificationNumber !== undefined) supplier.identificationNumber = typeof identificationNumber === "string" && identificationNumber.trim() ? identificationNumber.trim() : null;
        if (email !== undefined) supplier.email = typeof email === "string" && email.trim() ? email.trim() : null;
        if (notes !== undefined) supplier.notes = typeof notes === "string" && notes.trim() ? notes.trim() : null;
        supplier.updatedAt = Date.now();
        revision = await allocateRevision(session);
        supplier.serverRevision = revision;
        supplier.syncStatus = "synced";
        supplier.lastSyncedAt = Date.now();
        await supplier.save({ session } as any);
        saved = supplier;
        const payload = supplier.toObject ? supplier.toObject() : { ...supplier };
        const { SyncChangeModel } = await import("../models/sync-change.model");
        await SyncChangeModel.create(
          [
            {
              revision,
              entity: "supplier",
              entityId: id,
              operation: "update",
              payload,
              changedAt: new Date(),
              sourceClientId: "rvb-server",
              operationId: `rvb-supplier-${id}-${revision}`,
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    try {
      await RvbActivityModel.create({
        id: `rvba-${uuidv4()}`,
        createdAt: Date.now(),
        actorAccountId: req.rvbUser!.accountId,
        actorTag: req.rvbUser!.tag,
        actorRole: req.rvbUser!.role,
        entityType: "suppliers",
        entityId: id,
        action: "updated",
        sourceType: "suppliers",
        sourceId: id,
        title: `Supplier updated`,
        details: `Updated by @${req.rvbUser!.tag}`,
      } as any);
    } catch {}

    res.json({ success: true, supplier: sanitize(saved), revision });
  } catch (e: any) {
    console.error("PATCH supplier failed", e);
    const status = e?.status || 500;
    const code = e?.code || "INTERNAL_ERROR";
    res.status(status).json({ success: false, code, message: e?.message || code });
  }
});

// DELETE /api/rvb/suppliers/:id -> preserve deletion safeguards
router.delete("/:id", async (req: RvbAuthRequest, res) => {
  try {
    const rawId = (req.params as any).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const supplier: any = await SupplierModel.findOne({ id }).lean();
    if (!supplier) {
      res.status(404).json({ success: false, code: "RVB_SUPPLIER_NOT_FOUND" });
      return;
    }

    // Safeguards: purchases
    const purchases = await PurchaseModel.findOne({ supplierId: id }).lean();
    if (purchases) {
      res.status(400).json({ success: false, code: "RVB_SUPPLIER_HAS_PURCHASES", message: "Cannot delete supplier because it is used in purchase history." });
      return;
    }
    const payment = await PaymentModel.findOne({ entityType: "supplier", entityId: id }).lean();
    if (payment) {
      res.status(400).json({ success: false, code: "RVB_SUPPLIER_HAS_PAYMENTS", message: "Cannot delete supplier because it is used in payment history." });
      return;
    }
    if (Number(supplier.balance) !== 0) {
      res.status(400).json({ success: false, code: "RVB_SUPPLIER_BALANCE_NOT_ZERO", message: "Cannot delete supplier while the supplier balance is not zero." });
      return;
    }

    const session = await mongoose.startSession();
    let revision: number | null = null;
    let accountToDisconnect: string | null = null;
    try {
      await session.withTransaction(async () => {
        revision = await allocateRevision(session);
        await SupplierModel.deleteOne({ id }).session(session);
        accountToDisconnect = await applyLinkedEntityLifecycleToRvbAccount("supplier", id, "delete", session);
        const { SyncChangeModel } = await import("../models/sync-change.model");
        await SyncChangeModel.create(
          [
            {
              revision,
              entity: "supplier",
              entityId: id,
              operation: "delete",
              payload: undefined,
              changedAt: new Date(),
              sourceClientId: "rvb-server",
              operationId: `rvb-supplier-${id}-${revision}`,
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    if (accountToDisconnect) {
      try {
        const { disconnectRvbAccount } = await import("../lib/chat-socket");
        disconnectRvbAccount(accountToDisconnect);
      } catch {}
    }

    try {
      await RvbActivityModel.create({
        id: `rvba-${uuidv4()}`,
        createdAt: Date.now(),
        actorAccountId: req.rvbUser!.accountId,
        actorTag: req.rvbUser!.tag,
        actorRole: req.rvbUser!.role,
        entityType: "suppliers",
        entityId: id,
        action: "deleted",
        sourceType: "suppliers",
        sourceId: id,
        title: `Supplier deleted`,
        details: `Deleted by @${req.rvbUser!.tag}`,
      } as any);
    } catch {}

    res.json({ success: true, revision });
  } catch (e: any) {
    console.error("DELETE supplier failed", e);
    const status = e?.status || 500;
    const code = e?.code || "INTERNAL_ERROR";
    res.status(status).json({ success: false, code, message: e?.message || code });
  }
});

export default router;
