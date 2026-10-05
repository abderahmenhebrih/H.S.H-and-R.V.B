import { Router } from "express";
import { requireRvbAuth, requireRvbRole } from "../middleware/rvb-auth";
import type { RvbAuthRequest } from "../middleware/rvb-auth";
import { listAggregatedRequests, getAggregatedRequestById } from "../services/rvb-request-aggregation.service";
import { reviewWorkerRequest } from "../services/worker-request.service";
import { reviewSupplierRequest } from "../services/supplier-request.service";
import { reviewCustomerRequest } from "../services/customer-request.service";

const router = Router();
router.use(requireRvbAuth as any);

// GET /api/rvb/requests?status=under_review&source=worker&type=payment&search=&page=1&limit=25
router.get("/", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const { status, source, type, search, page, limit } = req.query as any;
    const result = await listAggregatedRequests({
      user: user as any,
      status: status && !Array.isArray(status) ? String(status) : "under_review",
      source: source && !Array.isArray(source) ? String(source) : undefined,
      type: type && !Array.isArray(type) ? String(type) : undefined,
      search: search && !Array.isArray(search) ? String(search) : undefined,
      page: page ? Number(Array.isArray(page) ? page[0] : page) : 1,
      limit: limit ? Number(Array.isArray(limit) ? limit[0] : limit) : 25,
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    const statusCode = err?.status || 500;
    res.status(statusCode).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

// GET /api/rvb/requests/:source/:id  -> detail
router.get("/:source/:id", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const source = String((req.params as any).source);
    const id = String((req.params as any).id);
    const data = await getAggregatedRequestById({ user: user as any, source, id });
    res.json({ success: true, request: data });
  } catch (err: any) {
    const statusCode = err?.status || 500;
    res.status(statusCode).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

// POST /api/rvb/requests/:source/:id/review  { status, notes, items?, total?, calculation?, date? }
router.post("/:source/:id/review", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const source = String((req.params as any).source);
    const id = String((req.params as any).id);
    const { status, notes, items, total, calculation, date } = req.body as any;
    const role = user.role;
    // Permissions: manager can review all, supervisor only customer
    if (role === "supervisor" && source !== "customer") {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN", message: "Supervisor cannot review worker/supplier requests" });
      return;
    }
    if (!["manager", "supervisor"].includes(role)) {
      res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
      return;
    }
    let updated: any;
    if (source === "worker") {
      updated = await reviewWorkerRequest(id, status, user.accountId, notes);
    } else if (source === "supplier") {
      updated = await reviewSupplierRequest(id, status, user.accountId, notes, { items, total: total !== undefined ? Number(total) : undefined, calculation, date: date !== undefined ? Number(date) : undefined });
    } else if (source === "customer") {
      updated = await reviewCustomerRequest(id, status, user.accountId, notes, { items, total: total !== undefined ? Number(total) : undefined, date: date !== undefined ? Number(date) : undefined });
    } else {
      res.status(400).json({ success: false, code: "RVB_REQUEST_TYPE_INVALID" });
      return;
    }
    res.json({ success: true, request: updated });
  } catch (err: any) {
    const statusCode = err?.status || 500;
    res.status(statusCode).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

export default router;
