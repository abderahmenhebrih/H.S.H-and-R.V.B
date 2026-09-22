import { Router } from "express";
import { WorkerActivityModel } from "../models/worker-activity.model";
import { requireRvbAuth } from "../middleware/rvb-auth";
import type { RvbAuthRequest } from "../middleware/rvb-auth";

const router = Router();
router.use(requireRvbAuth as any);

router.get("/", async (req: RvbAuthRequest, res) => {
  try {
    const { workerId } = req.query as any;
    const filter: any = {};
    if (workerId) filter.workerId = Array.isArray(workerId) ? workerId[0] : workerId;
    const docs = await WorkerActivityModel.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, activities: docs });
  } catch (e) {
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

export default router;
