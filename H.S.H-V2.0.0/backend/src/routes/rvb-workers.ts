import { Router } from "express";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { WorkerModel } from "../models/worker.model";
import { WorkerFinancialEventModel } from "../models/worker-financial-event.model";
import { WorkerActivityModel } from "../models/worker-activity.model";
import { RvbActivityModel } from "../models/rvb-activity.model";
import { requireRvbAuth, requireRvbRole } from "../middleware/rvb-auth";
import type { RvbAuthRequest } from "../middleware/rvb-auth";
import { allocateRevision, recordSyncChange } from "../sync/rvb-sync-helper";
import { archiveByLinkedEntity, reactivateByLinkedEntity } from "../services/rvb-account.service";

const router = Router();

// All business routes require auth; workers are manager/admin only
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

// GET /api/rvb/workers -> list
router.get("/", async (req: RvbAuthRequest, res) => {
  try {
    const workers = await WorkerModel.find().sort({ createdAt: -1 }).lean();
    const cleaned = workers.map((d: any) => {
      const { _id, __v, ...rest } = d;
      return rest;
    });
    res.json({ success: true, workers: cleaned });
  } catch (e: any) {
    console.error("GET workers failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR", message: e?.message });
  }
});

// GET /api/rvb/workers/:id/financial-events (filtered server-side) - must be before /:id
router.get("/:id/financial-events", async (req: RvbAuthRequest, res) => {
  try {
    const rawId = (req.params as any).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const worker: any = await WorkerModel.findOne({ id }).lean();
    if (!worker) {
      res.status(404).json({ success: false, code: "RVB_WORKER_NOT_FOUND" });
      return;
    }
    // Enforce server-side filtering: ignore query workerId attempts
    const events = await WorkerFinancialEventModel.find({ workerId: id }).sort({ createdAt: -1 }).lean();
    const cleaned = events.map((d: any) => {
      const { _id, __v, ...rest } = d;
      return rest;
    });
    res.json({ success: true, workerId: id, events: cleaned });
  } catch (e: any) {
    console.error("GET worker financial events failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// GET /api/rvb/workers/:id/activities - before /:id
router.get("/:id/activities", async (req: RvbAuthRequest, res) => {
  try {
    const rawId = (req.params as any).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const worker: any = await WorkerModel.findOne({ id }).lean();
    if (!worker) {
      res.status(404).json({ success: false, code: "RVB_WORKER_NOT_FOUND" });
      return;
    }
    const activities = await WorkerActivityModel.find({ workerId: id }).sort({ createdAt: -1 }).limit(200).lean();
    const cleaned = activities.map((d: any) => {
      const { _id, __v, ...rest } = d;
      return rest;
    });
    res.json({ success: true, workerId: id, activities: cleaned });
  } catch (e: any) {
    console.error("GET worker activities failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// GET /api/rvb/workers/:id -> get
router.get("/:id", async (req: RvbAuthRequest, res) => {
  try {
    const rawId = (req.params as any).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const doc: any = await WorkerModel.findOne({ id }).lean();
    if (!doc) {
      res.status(404).json({ success: false, code: "RVB_WORKER_NOT_FOUND" });
      return;
    }
    const { _id, __v, ...rest } = doc;
    res.json({ success: true, worker: rest });
  } catch (e: any) {
    console.error("GET worker failed", e);
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// POST /api/rvb/workers -> create
router.post("/", async (req: RvbAuthRequest, res) => {
  try {
    const { name, phone, address, birthDate, employmentDate, position, notes, startingSalary, monthlySalary } = req.body as any;

    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      res.status(400).json({ success: false, code: "RVB_WORKER_NAME_REQUIRED" });
      return;
    }
    const trimmedPhone = typeof phone === "string" ? phone.trim() : "";
    if (!trimmedPhone) {
      res.status(400).json({ success: false, code: "RVB_WORKER_PHONE_REQUIRED" });
      return;
    }
    const trimmedPosition = typeof position === "string" ? position.trim() : "";
    if (!trimmedPosition) {
      res.status(400).json({ success: false, code: "RVB_WORKER_POSITION_REQUIRED" });
      return;
    }
    if (employmentDate === undefined || employmentDate === null || !Number.isFinite(Number(employmentDate))) {
      res.status(400).json({ success: false, code: "RVB_WORKER_EMPLOYMENT_DATE_REQUIRED" });
      return;
    }
    const startSal = Number(startingSalary);
    const monthSal = Number(monthlySalary);
    // startingSalary = initial worker balance (opening balance): signed finite
    // allowed (negative / zero / positive). Monthly stays zero-or-positive.
    if (!Number.isFinite(startSal)) {
      res.status(400).json({ success: false, code: "RVB_WORKER_SALARY_INVALID" });
      return;
    }
    if (!Number.isFinite(monthSal) || monthSal < 0) {
      res.status(400).json({ success: false, code: "RVB_WORKER_SALARY_INVALID" });
      return;
    }

    const existing = await WorkerModel.findOne({ name: trimmedName }).lean();
    if (existing) {
      res.status(409).json({ success: false, code: "RVB_WORKER_NAME_EXISTS", message: "A worker with this name already exists." });
      return;
    }

    const now = Date.now();
    const id = `worker-${uuidv4()}`;
    const doc: any = {
      id,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced" as const,
      lastSyncedAt: now,
      name: trimmedName,
      phone: trimmedPhone,
      address: typeof address === "string" && address.trim() ? address.trim() : undefined,
      birthDate: birthDate !== undefined && birthDate !== null && Number.isFinite(Number(birthDate)) ? Number(birthDate) : undefined,
      employmentDate: Number(employmentDate),
      position: trimmedPosition,
      notes: typeof notes === "string" && notes.trim() ? notes.trim() : undefined,
      startingSalary: startSal,
      monthlySalary: monthSal,
      status: "active" as const,
      balance: startSal,
    };

    const session = await mongoose.startSession();
    let saved: any = null;
    let revision: number | null = null;
    try {
      await session.withTransaction(async () => {
        revision = await allocateRevision(session);
        doc.serverRevision = revision;
        const created = await WorkerModel.create([doc], { session } as any);
        saved = created[0];
        const payload = saved.toObject ? saved.toObject() : { ...doc };
        // recordSyncChange expects payload to be mutated with revision; already set
        // Use recordSyncChange to create SyncChange entry
        // Need to avoid double allocate: recordSyncChange will allocate another revision, so we instead manually create?
        // Instead use recordSyncChange pattern: allocate inside recordSyncChange, but we already allocated
        // So we will use direct SyncChangeModel approach to keep single revision
        // But to keep helper consistent, we use recordSyncChange which allocates; so we undo manual allocate
        // Simpler: we already allocated, now directly create SyncChange without second allocate
        const { SyncChangeModel } = await import("../models/sync-change.model");
        // Ensure doc has revision
        payload.serverRevision = revision;
        payload.syncStatus = "synced";
        payload.lastSyncedAt = now;
        await SyncChangeModel.create(
          [
            {
              revision,
              entity: "worker",
              entityId: id,
              operation: "create",
              payload,
              changedAt: new Date(),
              sourceClientId: "rvb-server",
              operationId: `rvb-worker-${id}-${revision}`,
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    const cleaned = sanitize(saved || doc);
    res.status(201).json({ success: true, worker: cleaned, revision });
  } catch (e: any) {
    console.error("POST worker failed", e);
    const status = e?.status || 500;
    const code = e?.code || "INTERNAL_ERROR";
    res.status(status).json({ success: false, code, message: e?.message || code });
  }
});

// PATCH /api/rvb/workers/:id -> edit (workerEditOperation semantics)
router.patch("/:id", async (req: RvbAuthRequest, res) => {
  try {
    const rawId = (req.params as any).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const { name, phone, address, birthDate, employmentDate, position, notes, startingSalary, monthlySalary } = req.body as any;

    // Validation mirrors frontend worker-edit.operation
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (name !== undefined && !trimmedName) {
      res.status(400).json({ success: false, code: "RVB_WORKER_NAME_REQUIRED" });
      return;
    }
    const trimmedPhone = typeof phone === "string" ? phone.trim() : "";
    if (phone !== undefined && !trimmedPhone) {
      res.status(400).json({ success: false, code: "RVB_WORKER_PHONE_REQUIRED" });
      return;
    }
    const trimmedPosition = typeof position === "string" ? position.trim() : "";
    if (position !== undefined && !trimmedPosition) {
      res.status(400).json({ success: false, code: "RVB_WORKER_POSITION_REQUIRED" });
      return;
    }
    // startingSalary = opening balance: signed finite allowed. Monthly stays >= 0.
    if (startingSalary !== undefined && !Number.isFinite(Number(startingSalary))) {
      res.status(400).json({ success: false, code: "RVB_WORKER_SALARY_INVALID" });
      return;
    }
    if (monthlySalary !== undefined && (!Number.isFinite(Number(monthlySalary)) || Number(monthlySalary) < 0)) {
      res.status(400).json({ success: false, code: "RVB_WORKER_SALARY_INVALID" });
      return;
    }
    if (employmentDate !== undefined && !Number.isFinite(Number(employmentDate))) {
      res.status(400).json({ success: false, code: "RVB_WORKER_EMPLOYMENT_DATE_REQUIRED" });
      return;
    }

    const session = await mongoose.startSession();
    let saved: any = null;
    let revision: number | null = null;
    try {
      await session.withTransaction(async () => {
        const worker: any = await WorkerModel.findOne({ id }).session(session);
        if (!worker) throw codeError("RVB_WORKER_NOT_FOUND", 404);

        // name uniqueness
        if (name !== undefined) {
          const existing: any = await WorkerModel.findOne({ name: trimmedName }).session(session);
          if (existing && existing.id !== id) throw codeError("RVB_WORKER_NAME_EXISTS", 409, "A worker with this name already exists.");
          worker.name = trimmedName;
        }
        if (phone !== undefined) worker.phone = trimmedPhone;
        if (address !== undefined) worker.address = typeof address === "string" && address.trim() ? address.trim() : null;
        if (birthDate !== undefined) worker.birthDate = birthDate !== null && Number.isFinite(Number(birthDate)) ? Number(birthDate) : null;
        if (employmentDate !== undefined) worker.employmentDate = Number(employmentDate);
        if (position !== undefined) worker.position = trimmedPosition;
        if (notes !== undefined) worker.notes = typeof notes === "string" && notes.trim() ? notes.trim() : null;
        if (startingSalary !== undefined) worker.startingSalary = Number(startingSalary);
        if (monthlySalary !== undefined) worker.monthlySalary = Number(monthlySalary);
        worker.updatedAt = Date.now();

        revision = await allocateRevision(session);
        worker.serverRevision = revision;
        worker.syncStatus = "synced";
        worker.lastSyncedAt = Date.now();
        await worker.save({ session } as any);
        saved = worker;
        const payload = worker.toObject ? worker.toObject() : { ...worker };
        const { SyncChangeModel } = await import("../models/sync-change.model");
        await SyncChangeModel.create(
          [
            {
              revision,
              entity: "worker",
              entityId: id,
              operation: "update",
              payload,
              changedAt: new Date(),
              sourceClientId: "rvb-server",
              operationId: `rvb-worker-${id}-${revision}`,
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    res.json({ success: true, worker: sanitize(saved), revision });
  } catch (e: any) {
    console.error("PATCH worker failed", e);
    const status = e?.status || 500;
    const code = e?.code || "INTERNAL_ERROR";
    res.status(status).json({ success: false, code, message: e?.message || code });
  }
});

// POST /api/rvb/workers/:id/archive
router.post("/:id/archive", async (req: RvbAuthRequest, res) => {
  try {
    const rawId = (req.params as any).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const session = await mongoose.startSession();
    let saved: any = null;
    let revision: number | null = null;
    try {
      await session.withTransaction(async () => {
        const worker: any = await WorkerModel.findOne({ id }).session(session);
        if (!worker) throw codeError("RVB_WORKER_NOT_FOUND", 404);
        if (worker.status === "archived") throw codeError("RVB_WORKER_ALREADY_ARCHIVED", 400);
        if (Number(worker.balance) !== 0) throw codeError("RVB_WORKER_BALANCE_NOT_ZERO", 400, "Cannot archive worker while the worker balance is not zero.");
        worker.status = "archived";
        worker.updatedAt = Date.now();
        revision = await allocateRevision(session);
        worker.serverRevision = revision;
        worker.syncStatus = "synced";
        worker.lastSyncedAt = Date.now();
        await worker.save({ session } as any);
        saved = worker;
        const payload = worker.toObject ? worker.toObject() : { ...worker };
        const { SyncChangeModel } = await import("../models/sync-change.model");
        await SyncChangeModel.create(
          [
            {
              revision,
              entity: "worker",
              entityId: id,
              operation: "update",
              payload,
              changedAt: new Date(),
              sourceClientId: "rvb-server",
              operationId: `rvb-worker-${id}-${revision}`,
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    // Archive linked account if any (outside transaction, post-commit)
    try {
      await archiveByLinkedEntity("worker", id);
    } catch {}
    try {
      await WorkerActivityModel.create({
        id: `wka-${uuidv4()}`,
        createdAt: Date.now(),
        workerId: id,
        accountId: req.rvbUser!.accountId,
        action: "archived",
        details: `Archived by @${req.rvbUser!.tag}`,
        actorId: req.rvbUser!.accountId,
        actorTag: req.rvbUser!.tag,
      } as any);
    } catch {}
    try {
      await RvbActivityModel.create({
        id: `rvba-${uuidv4()}`,
        createdAt: Date.now(),
        actorAccountId: req.rvbUser!.accountId,
        actorTag: req.rvbUser!.tag,
        actorRole: req.rvbUser!.role,
        entityType: "workers",
        entityId: id,
        action: "archived",
        sourceType: "workers",
        sourceId: id,
        title: `Worker archived`,
        details: `Worker ${id} archived by @${req.rvbUser!.tag}`,
      } as any);
    } catch {}
    res.json({ success: true, worker: sanitize(saved), revision });
  } catch (e: any) {
    console.error("Archive worker failed", e);
    const status = e?.status || 500;
    const code = e?.code || "INTERNAL_ERROR";
    res.status(status).json({ success: false, code, message: e?.message || code });
  }
});

// POST /api/rvb/workers/:id/reactivate
router.post("/:id/reactivate", async (req: RvbAuthRequest, res) => {
  try {
    const rawId = (req.params as any).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const { startingSalary, monthlySalary } = req.body as any;
    const startSal = startingSalary !== undefined ? Number(startingSalary) : undefined;
    const monthSal = monthlySalary !== undefined ? Number(monthlySalary) : undefined;
    // Reactivate startingSalary follows same opening-balance rule: signed finite allowed.
    if (startSal !== undefined && !Number.isFinite(startSal)) {
      res.status(400).json({ success: false, code: "RVB_WORKER_SALARY_INVALID" });
      return;
    }
    if (monthSal !== undefined && (!Number.isFinite(monthSal) || monthSal < 0)) {
      res.status(400).json({ success: false, code: "RVB_WORKER_SALARY_INVALID" });
      return;
    }
    const session = await mongoose.startSession();
    let saved: any = null;
    let revision: number | null = null;
    try {
      await session.withTransaction(async () => {
        const worker: any = await WorkerModel.findOne({ id }).session(session);
        if (!worker) throw codeError("RVB_WORKER_NOT_FOUND", 404);
        if (worker.status === "active") throw codeError("RVB_WORKER_ALREADY_ACTIVE", 400);
        if (startSal !== undefined) worker.startingSalary = startSal;
        if (monthSal !== undefined) worker.monthlySalary = monthSal;
        // If not provided, keep existing but ensure they are valid.
        // startingSalary = opening balance: signed finite allowed.
        if (!Number.isFinite(Number(worker.startingSalary))) throw codeError("RVB_WORKER_SALARY_INVALID", 400);
        if (!Number.isFinite(Number(worker.monthlySalary)) || Number(worker.monthlySalary) < 0) throw codeError("RVB_WORKER_SALARY_INVALID", 400);
        worker.status = "active";
        worker.updatedAt = Date.now();
        revision = await allocateRevision(session);
        worker.serverRevision = revision;
        worker.syncStatus = "synced";
        worker.lastSyncedAt = Date.now();
        await worker.save({ session } as any);
        saved = worker;
        const payload = worker.toObject ? worker.toObject() : { ...worker };
        const { SyncChangeModel } = await import("../models/sync-change.model");
        await SyncChangeModel.create(
          [
            {
              revision,
              entity: "worker",
              entityId: id,
              operation: "update",
              payload,
              changedAt: new Date(),
              sourceClientId: "rvb-server",
              operationId: `rvb-worker-${id}-${revision}`,
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    try {
      await reactivateByLinkedEntity("worker", id);
    } catch {}
    try {
      await WorkerActivityModel.create({
        id: `wka-${uuidv4()}`,
        createdAt: Date.now(),
        workerId: id,
        accountId: req.rvbUser!.accountId,
        action: "reactivated",
        details: `Reactivated by @${req.rvbUser!.tag}`,
        actorId: req.rvbUser!.accountId,
        actorTag: req.rvbUser!.tag,
      } as any);
    } catch {}
    try {
      await RvbActivityModel.create({
        id: `rvba-${uuidv4()}`,
        createdAt: Date.now(),
        actorAccountId: req.rvbUser!.accountId,
        actorTag: req.rvbUser!.tag,
        actorRole: req.rvbUser!.role,
        entityType: "workers",
        entityId: id,
        action: "reactivated",
        sourceType: "workers",
        sourceId: id,
        title: `Worker reactivated`,
        details: `Worker ${id} reactivated by @${req.rvbUser!.tag}`,
      } as any);
    } catch {}
    res.json({ success: true, worker: sanitize(saved), revision });
  } catch (e: any) {
    console.error("Reactivate worker failed", e);
    const status = e?.status || 500;
    const code = e?.code || "INTERNAL_ERROR";
    res.status(status).json({ success: false, code, message: e?.message || code });
  }
});

// POST /api/rvb/workers/:id/bonus-absence (restricted to bonus/absence, transactional)
router.post("/:id/bonus-absence", async (req: RvbAuthRequest, res) => {
  try {
    const rawId = (req.params as any).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const { type, amount, note } = req.body as any;
    if (!["bonus", "absence"].includes(type)) {
      res.status(400).json({ success: false, code: "RVB_TYPE_INVALID", message: "type must be bonus or absence" });
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      res.status(400).json({ success: false, code: "RVB_AMOUNT_REQUIRED" });
      return;
    }

    const session = await mongoose.startSession();
    let result: any = null;
    try {
      await session.withTransaction(async () => {
        const worker: any = await WorkerModel.findOne({ id }).session(session);
        if (!worker) throw codeError("RVB_WORKER_NOT_FOUND", 404);
        if (worker.status !== "active") throw codeError("RVB_WORKER_ARCHIVED", 400, "Archived worker cannot receive bonus/absence");

        const before = Number(worker.balance) || 0;
        let after: number;
        if (type === "bonus") {
          after = before + amt;
        } else {
          if (amt > before) throw codeError("RVB_ABSENCE_EXCEEDS_BALANCE", 400, "Absence amount exceeds worker balance.");
          after = before - amt;
        }

        worker.balance = after;
        worker.updatedAt = Date.now();
        const workerRev = await allocateRevision(session);
        worker.serverRevision = workerRev;
        worker.syncStatus = "synced";
        worker.lastSyncedAt = Date.now();
        await worker.save({ session } as any);

        const payload = worker.toObject ? worker.toObject() : { ...worker };
        const { SyncChangeModel } = await import("../models/sync-change.model");
        await SyncChangeModel.create(
          [
            {
              revision: workerRev,
              entity: "worker",
              entityId: id,
              operation: "update",
              payload,
              changedAt: new Date(),
              sourceClientId: "rvb-server",
              operationId: `rvb-worker-${id}-${workerRev}`,
            },
          ],
          { session },
        );

        const now = Date.now();
        const eventId = `wkfe-${uuidv4()}`;
        const eventDoc: any = {
          id: eventId,
          createdAt: now,
          updatedAt: now,
          workerId: id,
          type,
          amount: amt,
          balanceBefore: before,
          balanceAfter: after,
          note: typeof note === "string" && note.trim() ? note.trim() : null,
          actorId: req.rvbUser!.accountId,
          actorTag: req.rvbUser!.tag,
          referenceId: null,
        };
        await WorkerFinancialEventModel.create([eventDoc], { session } as any);

        const activityId = `wka-${uuidv4()}`;
        const activityDoc: any = {
          id: activityId,
          createdAt: now,
          workerId: id,
          accountId: req.rvbUser!.accountId,
          action: type === "bonus" ? "bonus_recorded" : "absence_recorded",
          details: typeof note === "string" && note.trim() ? note.trim() : `${type} ${amt}`,
          actorId: req.rvbUser!.accountId,
          actorTag: req.rvbUser!.tag,
        };
        await WorkerActivityModel.create([activityDoc], { session } as any);

        const rvbActId = `rvba-${uuidv4()}`;
        await RvbActivityModel.create(
          [
            {
              id: rvbActId,
              createdAt: now,
              actorAccountId: req.rvbUser!.accountId,
              actorTag: req.rvbUser!.tag,
              actorRole: req.rvbUser!.role,
              entityType: "workers",
              entityId: id,
              action: type === "bonus" ? "bonus_recorded" : "absence_recorded",
              sourceType: "workers",
              sourceId: id,
              title: type === "bonus" ? `Bonus ${amt} to worker` : `Absence ${amt} for worker`,
              details: typeof note === "string" && note.trim() ? note.trim() : `${type} ${amt} balance ${before} -> ${after}`,
            } as any,
          ],
          { session } as any,
        );

        result = {
          worker: payload,
          event: eventDoc,
          activity: activityDoc,
          revision: workerRev,
        };
      });
    } finally {
      await session.endSession();
    }

    res.status(201).json({ success: true, ...result });
  } catch (e: any) {
    console.error("bonus-absence failed", e);
    const status = e?.status || 500;
    const code = e?.code || "INTERNAL_ERROR";
    res.status(status).json({ success: false, code, message: e?.message || code });
  }
});

export default router;
