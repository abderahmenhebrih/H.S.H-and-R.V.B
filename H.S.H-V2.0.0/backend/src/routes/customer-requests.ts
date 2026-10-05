import { Router } from "express";
import { createCustomerRequest, listCustomerRequests, reviewCustomerRequest } from "../services/customer-request.service";
import { requireRvbAuth, requireRvbRole } from "../middleware/rvb-auth";
import type { RvbAuthRequest } from "../middleware/rvb-auth";
import { rateLimit, accountKey } from "../middleware/rateLimiter";

const router = Router();
router.use(requireRvbAuth as any);
router.use(rateLimit({ windowMs: 60 * 1000, max: 30, key: accountKey }) as any);

router.get("/", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const role = user.role;
    if (role !== "manager" && role !== "supervisor" && role !== "customer") {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
      return;
    }
    const { customerId } = req.query as any;
    if (role === "customer") {
      const linkedId = (user.account as any)?.linkedEntityId;
      const linkedType = (user.account as any)?.linkedEntityType;
      if (linkedType !== "customer" || !linkedId) {
        res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
        return;
      }
      const docs = await listCustomerRequests(linkedId);
      res.json({ success: true, requests: docs });
      return;
    }
    // Manager/Supervisor can see all or filtered
    const cid = customerId && !Array.isArray(customerId) ? customerId : Array.isArray(customerId) ? customerId[0] : undefined;
    const docs = await listCustomerRequests(cid);
    res.json({ success: true, requests: docs });
  } catch (e) {
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

router.post("/", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const role = user.role;
    if (role !== "manager" && role !== "supervisor" && role !== "customer") {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
      return;
    }
    const { customerId, type, items, total, date, description } = req.body as any;
    let cid = customerId;
    if (role === "customer") {
      const linkedType = (user.account as any)?.linkedEntityType;
      cid = (user.account as any)?.linkedEntityId;
      if (linkedType !== "customer" || !cid) {
        res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
        return;
      }
      if (customerId && customerId !== cid) {
        res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
        return;
      }
    } else {
      // manager/supervisor must supply customerId
      if (!cid) {
        res.status(400).json({ success: false, code: "RVB_CUSTOMER_REQUIRED" });
        return;
      }
    }
    const created = await createCustomerRequest({
      customerId: cid,
      accountId: user.accountId,
      type,
      items,
      total: total !== undefined ? Number(total) : undefined,
      date: date ? Number(date) : undefined,
      description,
    });
    res.status(201).json({ success: true, request: created });
  } catch (err: any) {
    const code = err?.code || "INTERNAL_ERROR";
    const status = err?.status || 500;
    res.status(status).json({ success: false, code, message: err?.message || code });
  }
});

router.post("/:id/review", requireRvbRole("manager", "supervisor") as any, async (req: RvbAuthRequest, res) => {
  try {
    const rawId = (req.params as any).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const { status, notes, items, total, date } = req.body as any;
    const reviewerId = req.rvbUser!.accountId;
    const updated = await reviewCustomerRequest(id, status as any, reviewerId, notes, { items, total: total !== undefined ? Number(total) : undefined, date: date ? Number(date) : undefined });
    res.json({ success: true, request: updated });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

export default router;
