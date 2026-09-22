import { Router } from "express";
import { createSupplierRequest, listSupplierRequests, reviewSupplierRequest } from "../services/supplier-request.service";
import { requireRvbAuth, requireRvbRole } from "../middleware/rvb-auth";
import type { RvbAuthRequest } from "../middleware/rvb-auth";

const router = Router();
router.use(requireRvbAuth as any);

router.get("/", async (req: RvbAuthRequest, res) => {
  try {
    const { supplierId } = req.query as any;
    const docs = await listSupplierRequests(supplierId && !Array.isArray(supplierId) ? supplierId : Array.isArray(supplierId) ? supplierId[0] : undefined);
    res.json({ success: true, requests: docs });
  } catch (e) {
    res.status(500).json({ success: false, code: "INTERNAL_ERROR" });
  }
});

router.post("/", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const { supplierId, type, items, total, calculation, date, description } = req.body as any;
    if (user.role === "supplier") {
      const linkedId = (user.account as any)?.linkedEntityId;
      if (linkedId !== supplierId) {
        res.status(403).json({ success: false, code: "RVB_FORBIDDEN" });
        return;
      }
    }
    const created = await createSupplierRequest({
      supplierId,
      accountId: user.accountId,
      type,
      items,
      total: total !== undefined ? Number(total) : undefined,
      calculation,
      date: date ? Number(date) : undefined,
      description,
    });
    res.status(201).json({ success: true, request: created });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

router.post("/:id/review", requireRvbRole("manager", "admin") as any, async (req: RvbAuthRequest, res) => {
  try {
    const rawId = (req.params as any).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const { status, notes } = req.body as any;
    const reviewerId = req.rvbUser!.accountId;
    const updated = await reviewSupplierRequest(id, status as any, reviewerId, notes);
    res.json({ success: true, request: updated });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

export default router;
