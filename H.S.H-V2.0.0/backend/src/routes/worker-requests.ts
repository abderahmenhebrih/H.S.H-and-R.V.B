import { Router } from "express";
import { WorkerRequestModel } from "../models/worker-request.model";
import { createWorkerRequest, listWorkerRequests, reviewWorkerRequest } from "../services/worker-request.service";
import { requireRvbAuth, requireRvbRole } from "../middleware/rvb-auth";
import type { RvbAuthRequest } from "../middleware/rvb-auth";

const router = Router();

// All routes require auth
router.use(requireRvbAuth as any);

// GET /api/rvb/worker-requests?workerId=xxx
router.get("/", async (req: RvbAuthRequest, res) => {
  try {
    const { workerId } = req.query as any;
    const wid = Array.isArray(workerId) ? workerId[0] : workerId;
    const docs = await listWorkerRequests(wid);
    res.json({ success: true, requests: docs });
  } catch (e: any) {
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// POST /api/rvb/worker-requests
router.post("/", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    // Portal roles worker/supervisor can create own requests; manager/admin can create for any
    const { workerId, type, amount, description } = req.body as any;
    // If worker/supervisor, ensure they are linked to that worker
    if (user.role === "worker" || user.role === "supervisor") {
      const linkedId = (user.account as any)?.linkedEntityId;
      if (linkedId !== workerId) {
        res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
        return;
      }
    }
    const created = await createWorkerRequest({
      workerId,
      accountId: user.accountId,
      type,
      amount: amount !== undefined ? Number(amount) : null,
      description,
    });
    res.status(201).json({ success: true, request: created });
  } catch (err: any) {
    const code = err?.code || "INTERNAL_ERROR";
    const status = err?.status || 500;
    res.status(status).json({ success: false, code, message: err?.message || code });
  }
});

// POST /api/rvb/worker-requests/:id/review  { status, notes }
router.post("/:id/review", requireRvbRole("manager", "admin") as any, async (req: RvbAuthRequest, res) => {
  try {
    const rawId = (req.params as any).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const { status, notes } = req.body as any;
    const reviewerId = req.rvbUser!.accountId;
    const updated = await reviewWorkerRequest(id, status as "accepted" | "rejected", reviewerId, notes);
    res.json({ success: true, request: updated });
  } catch (err: any) {
    const code = err?.code || "INTERNAL_ERROR";
    const status = err?.status || 500;
    res.status(status).json({ success: false, code, message: err?.message || code });
  }
});

export default router;
