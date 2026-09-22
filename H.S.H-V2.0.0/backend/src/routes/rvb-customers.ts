import { Router } from "express";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { CustomerModel } from "../models/customer.model";
import { SaleModel } from "../models/sale.model";
import { PaymentModel } from "../models/payment.model";
import { RvbActivityModel } from "../models/rvb-activity.model";
import { requireRvbAuth, requireRvbRole } from "../middleware/rvb-auth";
import type { RvbAuthRequest } from "../middleware/rvb-auth";
import { allocateRevision } from "../sync/rvb-sync-helper";

const router = Router();
router.use(requireRvbAuth as any);
router.use(requireRvbRole("manager", "admin", "supervisor") as any);

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

// GET /api/rvb/customers -> list
router.get("/", async (_req: RvbAuthRequest, res) => {
  try {
    const docs = await CustomerModel.find().sort({ createdAt: -1 }).lean();
    const cleaned = docs.map((d: any) => {
      const { _id, __v, ...rest } = d;
      return rest;
    });
    res.json({ success: true, customers: cleaned });
  } catch (e: any) {
    console.error("GET customers failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// GET /api/rvb/customers/:id/sales -> sales history - before /:id
router.get("/:id/sales", async (req: RvbAuthRequest, res) => {
  try {
    const rawId = (req.params as any).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const customer: any = await CustomerModel.findOne({ id }).lean();
    if (!customer) {
      res.status(404).json({ success: false, code: "RVB_CUSTOMER_NOT_FOUND" });
      return;
    }
    const sales = await SaleModel.find({ customerId: id }).sort({ date: -1, createdAt: -1 }).lean();
    const cleaned = sales.map((d: any) => {
      const { _id, __v, ...rest } = d;
      return rest;
    });
    res.json({ success: true, customerId: id, sales: cleaned });
  } catch (e: any) {
    console.error("GET customer sales failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// GET /api/rvb/customers/:id/payments - before /:id
router.get("/:id/payments", async (req: RvbAuthRequest, res) => {
  try {
    const rawId = (req.params as any).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const customer: any = await CustomerModel.findOne({ id }).lean();
    if (!customer) {
      res.status(404).json({ success: false, code: "RVB_CUSTOMER_NOT_FOUND" });
      return;
    }
    const payments = await PaymentModel.find({ entityType: "customer", entityId: id }).sort({ date: -1, createdAt: -1 }).lean();
    const cleaned = payments.map((d: any) => {
      const { _id, __v, ...rest } = d;
      return rest;
    });
    res.json({ success: true, customerId: id, payments: cleaned });
  } catch (e: any) {
    console.error("GET customer payments failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// GET /api/rvb/customers/:id
router.get("/:id", async (req: RvbAuthRequest, res) => {
  try {
    const rawId = (req.params as any).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const doc: any = await CustomerModel.findOne({ id }).lean();
    if (!doc) {
      res.status(404).json({ success: false, code: "RVB_CUSTOMER_NOT_FOUND" });
      return;
    }
    const { _id, __v, ...rest } = doc;
    res.json({ success: true, customer: rest });
  } catch (e: any) {
    console.error("GET customer failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// POST /api/rvb/customers -> create
router.post("/", async (req: RvbAuthRequest, res) => {
  try {
    const { name, phone, address, identificationNumber, email, notes, type, invoiceCustomerType, legalName, commercialName, legalForm, activity, billingAddress, rc, nif, nis } = req.body as any;
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      res.status(400).json({ success: false, code: "RVB_CUSTOMER_NAME_REQUIRED" });
      return;
    }
    const trimmedPhone = typeof phone === "string" ? phone.trim() : "";
    if (!trimmedPhone) {
      res.status(400).json({ success: false, code: "RVB_CUSTOMER_PHONE_REQUIRED" });
      return;
    }
    const trimmedType = typeof type === "string" ? type.trim() : "";
    if (!trimmedType) {
      res.status(400).json({ success: false, code: "RVB_CUSTOMER_TYPE_REQUIRED" });
      return;
    }
    if (invoiceCustomerType && !["consumer", "business"].includes(String(invoiceCustomerType))) {
      res.status(400).json({ success: false, code: "RVB_INVOICE_CUSTOMER_TYPE_INVALID" });
      return;
    }
    const existing = await CustomerModel.findOne({ name: trimmedName }).lean();
    if (existing) {
      res.status(409).json({ success: false, code: "RVB_CUSTOMER_NAME_EXISTS" });
      return;
    }

    const now = Date.now();
    const id = `customer-${uuidv4()}`;
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
      type: trimmedType,
      balance: 0,
      invoiceCustomerType: invoiceCustomerType === "business" ? "business" : "consumer",
      legalName: typeof legalName === "string" && legalName.trim() ? legalName.trim() : undefined,
      commercialName: typeof commercialName === "string" && commercialName.trim() ? commercialName.trim() : undefined,
      legalForm: typeof legalForm === "string" && legalForm.trim() ? legalForm.trim() : undefined,
      activity: typeof activity === "string" && activity.trim() ? activity.trim() : undefined,
      billingAddress: typeof billingAddress === "string" && billingAddress.trim() ? billingAddress.trim() : undefined,
      rc: typeof rc === "string" && rc.trim() ? rc.trim() : undefined,
      nif: typeof nif === "string" && nif.trim() ? nif.trim() : undefined,
      nis: typeof nis === "string" && nis.trim() ? nis.trim() : undefined,
    };

    const session = await mongoose.startSession();
    let saved: any = null;
    let revision: number | null = null;
    try {
      await session.withTransaction(async () => {
        revision = await allocateRevision(session);
        doc.serverRevision = revision;
        const created = await CustomerModel.create([doc], { session } as any);
        saved = created[0];
        const payload = saved.toObject ? saved.toObject() : { ...doc };
        const { SyncChangeModel } = await import("../models/sync-change.model");
        await SyncChangeModel.create(
          [
            {
              revision,
              entity: "customer",
              entityId: id,
              operation: "create",
              payload,
              changedAt: new Date(),
              sourceClientId: "rvb-server",
              operationId: `rvb-customer-${id}-${revision}`,
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
        entityType: "customers",
        entityId: id,
        action: "created",
        sourceType: "customers",
        sourceId: id,
        title: `Customer created: ${trimmedName}`,
        details: `Created by @${req.rvbUser!.tag}`,
      } as any);
    } catch {}

    res.status(201).json({ success: true, customer: sanitize(saved || doc), revision });
  } catch (e: any) {
    console.error("POST customer failed", e);
    const status = e?.status || 500;
    const code = e?.code || "INTERNAL_ERROR";
    res.status(status).json({ success: false, code, message: e?.message || code });
  }
});

// PATCH /api/rvb/customers/:id -> edit preserves business data logic
router.patch("/:id", async (req: RvbAuthRequest, res) => {
  try {
    const rawId = (req.params as any).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const { name, phone, address, identificationNumber, email, notes, type, invoiceCustomerType, legalName, commercialName, legalForm, activity, billingAddress, rc, nif, nis } = req.body as any;

    if (name !== undefined) {
      const tn = typeof name === "string" ? name.trim() : "";
      if (!tn) {
        res.status(400).json({ success: false, code: "RVB_CUSTOMER_NAME_REQUIRED" });
        return;
      }
    }
    if (phone !== undefined) {
      const tp = typeof phone === "string" ? phone.trim() : "";
      if (!tp) {
        res.status(400).json({ success: false, code: "RVB_CUSTOMER_PHONE_REQUIRED" });
        return;
      }
    }
    if (type !== undefined) {
      const tt = typeof type === "string" ? type.trim() : "";
      if (!tt) {
        res.status(400).json({ success: false, code: "RVB_CUSTOMER_TYPE_REQUIRED" });
        return;
      }
    }
    if (invoiceCustomerType !== undefined && !["consumer", "business"].includes(String(invoiceCustomerType))) {
      res.status(400).json({ success: false, code: "RVB_INVOICE_CUSTOMER_TYPE_INVALID" });
      return;
    }

    const session = await mongoose.startSession();
    let saved: any = null;
    let revision: number | null = null;
    try {
      await session.withTransaction(async () => {
        const customer: any = await CustomerModel.findOne({ id }).session(session);
        if (!customer) throw codeError("RVB_CUSTOMER_NOT_FOUND", 404);

        const existingCustomer: any = customer.toObject ? customer.toObject() : { ...customer };
        const shouldPreserveBusinessData = invoiceCustomerType === "consumer" && existingCustomer.invoiceCustomerType === "business";

        const buildField = (inputVal: string | undefined, existingVal: string | undefined) => {
          if (inputVal === undefined) {
            if (shouldPreserveBusinessData) return existingVal;
            return undefined;
          }
          if (inputVal === null) {
            if (shouldPreserveBusinessData) return existingVal;
            return null;
          }
          const trimmed = String(inputVal).trim();
          if (trimmed === "") {
            if (shouldPreserveBusinessData) return existingVal;
            return null;
          }
          return trimmed;
        };

        if (name !== undefined) {
          const tn = String(name).trim();
          const existing: any = await CustomerModel.findOne({ name: tn }).session(session);
          if (existing && existing.id !== id) throw codeError("RVB_CUSTOMER_NAME_EXISTS", 409);
          customer.name = tn;
        }
        if (phone !== undefined) customer.phone = String(phone).trim();
        if (address !== undefined) customer.address = typeof address === "string" && address.trim() ? address.trim() : null;
        if (identificationNumber !== undefined) customer.identificationNumber = typeof identificationNumber === "string" && identificationNumber.trim() ? identificationNumber.trim() : null;
        if (email !== undefined) customer.email = typeof email === "string" && email.trim() ? email.trim() : null;
        if (notes !== undefined) customer.notes = typeof notes === "string" && notes.trim() ? notes.trim() : null;
        if (type !== undefined) customer.type = String(type).trim();
        if (invoiceCustomerType !== undefined) customer.invoiceCustomerType = invoiceCustomerType;

        const fields: Record<string, any> = {
          legalName: buildField(legalName, existingCustomer.legalName),
          commercialName: buildField(commercialName, existingCustomer.commercialName),
          legalForm: buildField(legalForm, existingCustomer.legalForm),
          activity: buildField(activity, existingCustomer.activity),
          billingAddress: buildField(billingAddress, existingCustomer.billingAddress),
          rc: buildField(rc, existingCustomer.rc),
          nif: buildField(nif, existingCustomer.nif),
          nis: buildField(nis, existingCustomer.nis),
        };
        for (const [k, v] of Object.entries(fields)) {
          if (v !== undefined) {
            customer[k] = v;
          }
        }

        customer.updatedAt = Date.now();
        revision = await allocateRevision(session);
        customer.serverRevision = revision;
        customer.syncStatus = "synced";
        customer.lastSyncedAt = Date.now();
        await customer.save({ session } as any);
        saved = customer;
        const payload = customer.toObject ? customer.toObject() : { ...customer };
        const { SyncChangeModel } = await import("../models/sync-change.model");
        await SyncChangeModel.create(
          [
            {
              revision,
              entity: "customer",
              entityId: id,
              operation: "update",
              payload,
              changedAt: new Date(),
              sourceClientId: "rvb-server",
              operationId: `rvb-customer-${id}-${revision}`,
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
        entityType: "customers",
        entityId: id,
        action: "updated",
        sourceType: "customers",
        sourceId: id,
        title: `Customer updated`,
        details: `Updated by @${req.rvbUser!.tag}`,
      } as any);
    } catch {}

    res.json({ success: true, customer: sanitize(saved), revision });
  } catch (e: any) {
    console.error("PATCH customer failed", e);
    const status = e?.status || 500;
    const code = e?.code || "INTERNAL_ERROR";
    res.status(status).json({ success: false, code, message: e?.message || code });
  }
});

// DELETE /api/rvb/customers/:id -> deletion safeguards
router.delete("/:id", async (req: RvbAuthRequest, res) => {
  try {
    const rawId = (req.params as any).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const customer: any = await CustomerModel.findOne({ id }).lean();
    if (!customer) {
      res.status(404).json({ success: false, code: "RVB_CUSTOMER_NOT_FOUND" });
      return;
    }

    const sale = await SaleModel.findOne({ customerId: id }).lean();
    if (sale) {
      res.status(400).json({ success: false, code: "RVB_CUSTOMER_HAS_SALES", message: "Cannot delete customer because it is used in sale history." });
      return;
    }
    const payment = await PaymentModel.findOne({ entityType: "customer", entityId: id }).lean();
    if (payment) {
      res.status(400).json({ success: false, code: "RVB_CUSTOMER_HAS_PAYMENTS", message: "Cannot delete customer because it is used in payment history." });
      return;
    }
    if (Number(customer.balance) !== 0) {
      res.status(400).json({ success: false, code: "RVB_CUSTOMER_BALANCE_NOT_ZERO", message: "Cannot delete customer while the customer balance is not zero." });
      return;
    }

    const session = await mongoose.startSession();
    let revision: number | null = null;
    try {
      await session.withTransaction(async () => {
        revision = await allocateRevision(session);
        await CustomerModel.deleteOne({ id }).session(session);
        const { SyncChangeModel } = await import("../models/sync-change.model");
        await SyncChangeModel.create(
          [
            {
              revision,
              entity: "customer",
              entityId: id,
              operation: "delete",
              payload: undefined,
              changedAt: new Date(),
              sourceClientId: "rvb-server",
              operationId: `rvb-customer-${id}-${revision}`,
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
        entityType: "customers",
        entityId: id,
        action: "deleted",
        sourceType: "customers",
        sourceId: id,
        title: `Customer deleted`,
        details: `Deleted by @${req.rvbUser!.tag}`,
      } as any);
    } catch {}

    res.json({ success: true, revision });
  } catch (e: any) {
    console.error("DELETE customer failed", e);
    const status = e?.status || 500;
    const code = e?.code || "INTERNAL_ERROR";
    res.status(status).json({ success: false, code, message: e?.message || code });
  }
});

export default router;
