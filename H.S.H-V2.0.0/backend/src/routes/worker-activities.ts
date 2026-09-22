import { Router } from "express";
import { WorkerActivityModel } from "../models/worker-activity.model";
import { RvbAccountModel } from "../models/rvb-account.model";
import { requireRvbAuth } from "../middleware/rvb-auth";
import type { RvbAuthRequest } from "../middleware/rvb-auth";

const router = Router();
router.use(requireRvbAuth as any);

router.get("/", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const role = user.role;
    // Manager/Admin may read any Worker activity
    if (role === "manager" || role === "admin") {
      const { workerId } = req.query as any;
      const filter: any = {};
      if (workerId) filter.workerId = Array.isArray(workerId) ? workerId[0] : workerId;
      const docs = await WorkerActivityModel.find(filter).sort({ createdAt: -1 }).limit(100).lean();
      res.json({ success: true, activities: docs });
      return;
    }
    if (role === "supplier" || role === "customer") {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
      return;
    }
    // Worker or Supervisor: only own linked Worker, never trust workerId query as authority
    // Derive own entity ID from authenticated account (trusted)
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
    // Worker/Supervisor personal Worker activity only
    const filter: any = { workerId: linkedId };
    const docs = await WorkerActivityModel.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, activities: docs });
  } catch (e) {
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

export default router;
