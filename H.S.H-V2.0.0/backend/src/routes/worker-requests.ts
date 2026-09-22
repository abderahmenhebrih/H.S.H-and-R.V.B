import { Router } from "express";
import { WorkerRequestModel } from "../models/worker-request.model";
import { createWorkerRequest, listWorkerRequests, reviewWorkerRequest } from "../services/worker-request.service";
import { requireRvbAuth, requireRvbRole } from "../middleware/rvb-auth";
import type { RvbAuthRequest } from "../middleware/rvb-auth";
import { rateLimit, accountKey } from "../middleware/rateLimiter";

const router = Router();

// All routes require auth
router.use(requireRvbAuth as any);
// Per-account rate limit for submissions (authenticated, IP fallback)
router.use(rateLimit({ windowMs: 60 * 1000, max: 30, key: accountKey }) as any);

// GET /api/rvb/worker-requests?workerId=xxx
router.get("/", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const { workerId } = req.query as any;
    const wid = Array.isArray(workerId) ? workerId[0] : workerId;
    const role = user.role;
    if (role === "manager" || role === "admin") {
      const docs = await listWorkerRequests(wid);
      res.json({ success: true, requests: docs });
      return;
    }
    if (role === "worker" || role === "supervisor") {
      const linkedType = (user.account as any)?.linkedEntityType;
      const linkedId = (user.account as any)?.linkedEntityId;
      if (linkedType !== "worker" || !linkedId) {
        res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
        return;
      }
      if (wid && wid !== linkedId) {
        res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
        return;
      }
      const docs = await listWorkerRequests(linkedId);
      res.json({ success: true, requests: docs });
      return;
    }
    // supplier, customer, etc
    res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
  } catch (e: any) {
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

// POST /api/rvb/worker-requests
router.post("/", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const role = user.role;
    if (role !== "manager" && role !== "admin" && role !== "worker" && role !== "supervisor") {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
      return;
    }
    const { workerId, type, amount, description } = req.body as any;
    let effectiveWorkerId = workerId;
    if (role === "worker" || role === "supervisor") {
      const linkedType = (user.account as any)?.linkedEntityType;
      const linkedId = (user.account as any)?.linkedEntityId;
      if (linkedType !== "worker" || !linkedId) {
        res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
        return;
      }
      // Derive from account, ignore supplied workerId if mismatched
      if (workerId && workerId !== linkedId) {
        res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
        return;
      }
      effectiveWorkerId = linkedId;
    } else {
      // manager/admin must supply workerId
      if (!effectiveWorkerId) {
        res.status(400).json({ success: false, code: "RVB_WORKER_REQUIRED" });
        return;
      }
    }
    const created = await createWorkerRequest({
      workerId: effectiveWorkerId,
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
