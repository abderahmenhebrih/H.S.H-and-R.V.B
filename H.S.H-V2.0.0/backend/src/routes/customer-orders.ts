import { Router } from "express";
import { createCustomerOrder, listCustomerOrders, reviewCustomerOrder, cancelCustomerOrder, editCustomerOrder } from "../services/customer-order.service";
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
    const { customerId, status } = req.query as any;
    if (role === "customer") {
      const linkedType = (user.account as any)?.linkedEntityType;
      const linkedId = (user.account as any)?.linkedEntityId;
      if (linkedType !== "customer" || !linkedId) {
        res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
        return;
      }
      const docs = await listCustomerOrders({ customerId: linkedId, status: status && !Array.isArray(status) ? status : undefined });
      res.json({ success: true, orders: docs });
      return;
    }
    // Manager/Supervisor can see all or filtered
    const docs = await listCustomerOrders({
      customerId: customerId && !Array.isArray(customerId) ? customerId : undefined,
      status: status && !Array.isArray(status) ? status : undefined,
    });
    res.json({ success: true, orders: docs });
  } catch (e) {
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

router.post("/", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    if (user.role !== "customer") {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
      return;
    }
    const linkedType = (user.account as any)?.linkedEntityType;
    const linkedId = (user.account as any)?.linkedEntityId;
    if (linkedType !== "customer" || !linkedId) {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
      return;
    }
    const { items, total, notes } = req.body as any;
    // Prevent IDOR: body customerId must match linked if provided
    const { customerId } = req.body as any;
    if (customerId && customerId !== linkedId) {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
      return;
    }
    // Idempotency identity for this submission: cleanest contract is the
    // Idempotency-Key header; body clientRequestId accepted as fallback.
    // The key is stable across retries of ONE attempt; a new intentional
    // order uses a new key. Scoping (actor) is derived server-side from the
    // authenticated session inside the service, never from client input.
    const rawHeader = (req.headers as any)["idempotency-key"];
    const headerKey = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const clientRequestId = headerKey !== undefined ? headerKey : (req.body as any)?.clientRequestId;
    const created = await createCustomerOrder({ customerId: linkedId, accountId: user.accountId, items, total: Number(total), notes, clientRequestId });
    if (created.idempotentReplay) {
      res.json({ success: true, order: created.order, idempotentReplay: true });
      return;
    }
    res.status(201).json({ success: true, order: created.order });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

router.post("/:id/review", requireRvbRole("manager", "supervisor") as any, async (req: RvbAuthRequest, res) => {
  try {
    const rawId = (req.params as any).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const { status, items, notes } = req.body as any;
    const reviewerId = req.rvbUser!.accountId;
    const updated = await reviewCustomerOrder(id, status as any, reviewerId, items, notes);
    res.json({ success: true, order: updated });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

router.post("/:id/cancel", async (req: RvbAuthRequest, res) => {
  try {
    const rawId = (req.params as any).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const user = req.rvbUser!;
    if (user.role !== "customer") {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
      return;
    }
    const updated = await cancelCustomerOrder(id, user.accountId);
    res.json({ success: true, order: updated });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

router.patch("/:id", async (req: RvbAuthRequest, res) => {
  try {
    const rawId = (req.params as any).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const user = req.rvbUser!;
    if (user.role !== "customer") {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
      return;
    }
    const { items, notes } = req.body as any;
    const updated = await editCustomerOrder(id, user.accountId, items, notes);
    res.json({ success: true, order: updated });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

export default router;
