import { Router } from "express";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { WorkerFinancialEventModel } from "../models/worker-financial-event.model";
import { WorkerModel } from "../models/worker.model";
import { RvbAccountModel } from "../models/rvb-account.model";
import { requireRvbAuth, requireRvbRole } from "../middleware/rvb-auth";
import type { RvbAuthRequest } from "../middleware/rvb-auth";
import { WorkerActivityModel } from "../models/worker-activity.model";
import { RvbActivityModel } from "../models/rvb-activity.model";
import { SyncCounterModel } from "../models/sync-counter.model";
import { SyncChangeModel } from "../models/sync-change.model";

const router = Router();
router.use(requireRvbAuth as any);

async function getNextRevisionInternal(session?: any): Promise<number> {
  const opts = session ? { session } : {};
  const doc: any = await SyncCounterModel.findOneAndUpdate(
    { name: "global" },
    { $inc: { revision: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true, ...opts },
  );
  if (!doc) {
    const created: any = await SyncCounterModel.create([{ name: "global", revision: 1 }], opts as any);
    return (created[0] as any).revision;
  }
  if (typeof (doc as any).revision !== "number") {
    await SyncCounterModel.updateOne({ name: "global" }, { $set: { revision: 1 } }, opts as any);
    return 1;
  }
  return (doc as any).revision;
}

router.get("/", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const role = user.role;
    if (role === "manager" || role === "admin") {
      const { workerId } = req.query as any;
      const filter: any = {};
      if (workerId) filter.workerId = Array.isArray(workerId) ? workerId[0] : workerId;
      const docs = await WorkerFinancialEventModel.find(filter).sort({ createdAt: -1 }).lean();
      res.json({ success: true, events: docs });
      return;
    }
    if (role === "supplier" || role === "customer") {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
      return;
    }
    let account: any = user.account;
    if (!account || !account.linkedEntityId) {
      try {
        account = await RvbAccountModel.findOne({ id: user.accountId }).lean();
      } catch {}
    }
    const linkedType = account?.linkedEntityType;
    const linkedId = account?.linkedEntityId;
    if (!linkedType || !linkedId || linkedType !== "worker") {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
      return;
    }
    const filter: any = { workerId: linkedId };
    const docs = await WorkerFinancialEventModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, events: docs });
  } catch (e) {
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

router.post("/", requireRvbRole("manager", "admin") as any, async (req: RvbAuthRequest, res) => {
  const session = await mongoose.startSession();
  try {
    const { workerId, type, amount, note } = req.body as any;
    if (!workerId || !type || amount === undefined) {
      res.status(400).json({ success: false, code: "RVB_WORKER_REQUIRED" });
      return;
    }
    // Restrict to bonus/absence only (section 14-15)
    if (!["bonus", "absence"].includes(type)) {
      // Reject loan/payment/salary via this endpoint (403 or 400)
      res.status(400).json({ success: false, code: "RVB_TYPE_INVALID" });
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      res.status(400).json({ success: false, code: "RVB_AMOUNT_REQUIRED" });
      return;
    }
    let resultEvent: any = null;
    let resultWorker: any = null;
    let txnError: any = null;
    try {
      await session.withTransaction(async () => {
        const worker: any = await WorkerModel.findOne({ id: workerId }).session(session);
        if (!worker) {
          throw Object.assign(new Error("RVB_WORKER_NOT_FOUND"), { code: "RVB_WORKER_NOT_FOUND", status: 404 });
        }
        if (worker.status !== "active") {
          throw Object.assign(new Error("RVB_WORKER_ARCHIVED"), { code: "RVB_WORKER_ARCHIVED", status: 400 });
        }
        const before = Number(worker.balance) || 0;
        let after = before;
        if (type === "bonus") {
          after = before + amt;
        } else if (type === "absence") {
          if (amt > before) {
            throw Object.assign(new Error("RVB_PAYMENT_EXCEEDS_CREDIT"), { code: "RVB_PAYMENT_EXCEEDS_CREDIT", status: 400 });
          }
          after = before - amt;
        }
        const now = Date.now();
        const revision = await getNextRevisionInternal(session);
        // Apply exactly once inside tx, read balance inside tx
        await WorkerModel.updateOne(
          { id: workerId },
          {
            $set: {
              balance: after,
              updatedAt: now,
              serverRevision: revision,
              lastSyncedAt: now,
              syncStatus: "synced",
            },
          },
          { session },
        );
        const evId = `wkfe-${uuidv4()}`;
        const evDoc: any = {
          id: evId,
          createdAt: now,
          updatedAt: now,
          workerId,
          type,
          amount: amt,
          balanceBefore: before,
          balanceAfter: after,
          note: note || null,
          actorId: req.rvbUser!.accountId,
          actorTag: req.rvbUser!.tag,
          referenceId: null,
        };
        const createdEv = await WorkerFinancialEventModel.create([evDoc], { session });
        resultEvent = (createdEv[0] as any).toObject ? (createdEv[0] as any).toObject() : createdEv[0];
        const activityId = `wka-${uuidv4()}`;
        const activityDoc: any = {
          id: activityId,
          createdAt: now,
          workerId,
          accountId: req.rvbUser!.accountId,
          action: type === "bonus" ? "bonus_recorded" : "absence_recorded",
          details: note || `${type} ${amt}`,
          actorId: req.rvbUser!.accountId,
          actorTag: req.rvbUser!.tag,
        };
        await WorkerActivityModel.create([activityDoc], { session } as any);
        // Also create generic RvbActivity for audit trail (finance domain)
        try {
          await RvbActivityModel.create(
            [
              {
                id: `rvba-${uuidv4()}`,
                createdAt: now,
                actorAccountId: req.rvbUser!.accountId,
                actorTag: req.rvbUser!.tag,
                actorRole: req.rvbUser!.role,
                entityType: "worker",
                entityId: workerId,
                action: type === "bonus" ? "worker_bonus" : "worker_absence",
                sourceType: "workers",
                sourceId: workerId,
                title: type === "bonus" ? "Bonus recorded" : "Absence recorded",
                details: note || `${type} ${amt}`,
              } as any,
            ],
            { session } as any,
          );
        } catch {}
        // Create Worker UPDATE SyncChange atomically
        const updatedWorkerDoc: any = await WorkerModel.findOne({ id: workerId }).session(session);
        const payload = updatedWorkerDoc ? (updatedWorkerDoc.toObject ? updatedWorkerDoc.toObject() : updatedWorkerDoc) : { id: workerId, balance: after, serverRevision: revision, updatedAt: now, lastSyncedAt: now, syncStatus: "synced" };
        // Ensure serverRevision is set correctly in payload
        if (payload) payload.serverRevision = revision;
        await SyncChangeModel.create(
          [
            {
              revision,
              entity: "worker",
              entityId: workerId,
              operation: "update",
              payload,
              changedAt: new Date(now),
              sourceClientId: `rvb-financial:${req.rvbUser!.accountId}`,
              operationId: `op-${evId}`,
            },
          ],
          { session } as any,
        );
        resultWorker = { id: workerId, balance: after, serverRevision: revision };
      });
    } catch (txErr: any) {
      txnError = txErr;
    }
    if (txnError) {
      const status = txnError.status || 500;
      const code = txnError.code || "INTERNAL_ERROR";
      res.status(status).json({ success: false, code, message: txnError.message });
      return;
    }
    if (!resultEvent) {
      res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
      return;
    }
    res.status(201).json({ success: true, event: resultEvent, worker: resultWorker });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  } finally {
    try {
      await session.endSession();
    } catch {}
  }
});

export default router;
