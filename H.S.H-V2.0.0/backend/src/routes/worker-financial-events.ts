import { Router } from "express";
import { WorkerFinancialEventModel } from "../models/worker-financial-event.model";
import { WorkerModel } from "../models/worker.model";
import { requireRvbAuth, requireRvbRole } from "../middleware/rvb-auth";
import type { RvbAuthRequest } from "../middleware/rvb-auth";
import { recordFinancialEvent } from "../services/worker-financial-event.service";
import { WorkerActivityModel } from "../models/worker-activity.model";

const router = Router();
router.use(requireRvbAuth as any);

router.get("/", async (req: RvbAuthRequest, res) => {
  try {
    const { workerId } = req.query as any;
    const filter: any = {};
    if (workerId) filter.workerId = Array.isArray(workerId) ? workerId[0] : workerId;
    const docs = await WorkerFinancialEventModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, events: docs });
  } catch (e) {
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

router.post("/", requireRvbRole("manager", "admin") as any, async (req: RvbAuthRequest, res) => {
  try {
    const { workerId, type, amount, note } = req.body as any;
    if (!workerId || !type || amount === undefined) {
      res.status(400).json({ success: false, code: "RVB_WORKER_REQUIRED" });
      return;
    }
    if (!["salary", "bonus", "absence", "adjustment", "loan", "payment"].includes(type)) {
      res.status(400).json({ success: false, code: "RVB_TYPE_INVALID" });
      return;
    }
    const worker: any = await WorkerModel.findOne({ id: workerId });
    if (!worker) {
      res.status(404).json({ success: false, code: "RVB_WORKER_NOT_FOUND" });
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      res.status(400).json({ success: false, code: "RVB_AMOUNT_REQUIRED" });
      return;
    }
    const before = Number(worker.balance) || 0;
    let after = before;
    if (type === "bonus" || type === "salary" || type === "loan") {
      if (worker.status !== "active") {
        res.status(400).json({ success: false, code: "RVB_WORKER_ARCHIVED" });
        return;
      }
      after = before + amt;
    } else if (type === "absence" || type === "payment") {
      if (worker.status !== "active") {
        res.status(400).json({ success: false, code: "RVB_WORKER_ARCHIVED" });
        return;
      }
      if (amt > before) {
        res.status(400).json({ success: false, code: "RVB_PAYMENT_EXCEEDS_CREDIT" });
        return;
      }
      after = before - amt;
    } else if (type === "adjustment") {
      after = before + amt; // allow negative via note
    }

    worker.balance = after;
    worker.updatedAt = Date.now();
    await worker.save();

    const ev = await recordFinancialEvent({
      workerId,
      type,
      amount: amt,
      balanceBefore: before,
      balanceAfter: after,
      note: note || null,
      actorId: req.rvbUser!.accountId,
      actorTag: req.rvbUser!.tag,
    });

    // also record activity
    await WorkerActivityModel.create({
      id: `wka-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      workerId,
      accountId: req.rvbUser!.accountId,
      action: type === "bonus" ? "bonus_recorded" : type === "absence" ? "absence_recorded" : type,
      details: note || `${type} ${amt}`,
      actorId: req.rvbUser!.accountId,
      actorTag: req.rvbUser!.tag,
    } as any);

    res.status(201).json({ success: true, event: ev, worker: { id: worker.id, balance: worker.balance } });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

export default router;
